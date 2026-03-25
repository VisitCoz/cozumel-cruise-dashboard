#!/usr/bin/env node
/**
 * Cozumel Cruise Schedule Scraper
 * Fetches data from: https://servicios.apiqroo.com.mx/programacion/
 *
 * Usage:
 *   node scrape-schedule.js              # Scrapes current month
 *   node scrape-schedule.js 2026 4       # Scrapes April 2026
 *   node scrape-schedule.js 2026 3 4 5   # Scrapes March-May 2026
 *
 * Requires: npm install cheerio
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Lazy-load cheerio — install with: npm install cheerio
let cheerio;
try {
    cheerio = require('cheerio');
} catch {
    console.error('Missing dependency: cheerio');
    console.error('Run: npm install cheerio');
    process.exit(1);
}

const SOURCE_URL = 'https://servicios.apiqroo.com.mx/programacion/';
const OUTPUT_FILE = path.join(__dirname, 'schedule-data.json');

// ── Terminal name normalization ───────────────────
function normalizeTerminal(raw) {
    const t = raw.trim().toUpperCase();
    if (t.includes('PUNTA LANGOSTA')) return 'Punta Langosta';
    if (t.includes('SSA')) return 'SSA Mexico';
    if (t.includes('PUERTA MAYA')) return 'Puerta Maya';
    return raw.trim();
}

// ── Status normalization ──────────────────────────
function normalizeStatus(raw) {
    const s = raw.trim().toLowerCase();
    if (s.includes('arriba') || s.includes('arrived')) return 'Arrived';
    if (s.includes('programa') || s.includes('scheduled')) return 'Scheduled';
    if (s.includes('cancela') || s.includes('cancel')) return 'Cancelled';
    return 'Scheduled';
}

// ── Parse date from D/MM/YYYY to YYYY-MM-DD ──────
function parseDate(raw) {
    const parts = raw.trim().split('/');
    if (parts.length !== 3) return raw.trim();
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ── Fetch HTML from the main page ─────────────────
function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'CozumelDashboard/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// ── POST to controller.php for specific month ─────
function fetchMonth(year, month) {
    return new Promise((resolve, reject) => {
        const postData = `anio=${year}&mes=${month}&status=&doAction=arribos.history.get`;
        const options = {
            hostname: 'servicios.apiqroo.com.mx',
            port: 443,
            path: '/programacion/controller.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': SOURCE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                'Accept': 'text/html, */*; q=0.01',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ── Parse HTML table rows into schedule entries ───
function parseScheduleHTML(html) {
    const $ = cheerio.load(html);
    const entries = [];

    // The table rows contain ship data
    $('tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 7) return;

        const terminal = $(cells[0]).text().trim();
        const ship = $(cells[2]).text().trim();
        const arrivalDate = $(cells[3]).text().trim();
        const eta = $(cells[4]).text().trim();
        const departureDate = $(cells[5]).text().trim();
        const etd = $(cells[6]).text().trim();

        // Status: look for image alt text or status indicator
        let status = 'Scheduled';
        const statusCell = cells.length > 7 ? $(cells[7]) : $(cells[6]);
        const statusImg = statusCell.find('img');
        if (statusImg.length) {
            const alt = statusImg.attr('alt') || '';
            const src = statusImg.attr('src') || '';
            if (alt.toLowerCase().includes('arriba') || src.includes('green')) status = 'Arrived';
            else if (alt.toLowerCase().includes('cancela') || src.includes('red')) status = 'Cancelled';
        }

        if (!ship || !arrivalDate) return;

        entries.push({
            ship: ship,
            terminal: normalizeTerminal(terminal),
            arrival: parseDate(arrivalDate),
            eta: eta.replace(/\s/g, '') || '07:00',
            departure: parseDate(departureDate),
            etd: etd.replace(/\s/g, '') || '17:00',
            status: normalizeStatus(status),
        });
    });

    return entries;
}

// ── Main ──────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const now = new Date();
    let year = now.getFullYear();
    let months = [now.getMonth() + 1]; // current month

    if (args.length >= 2) {
        year = parseInt(args[0]);
        months = args.slice(1).map(Number);
    } else if (args.length === 1) {
        year = parseInt(args[0]);
    }

    console.log(`Scraping Cozumel cruise schedule from APIQROO...`);
    console.log(`Year: ${year}, Months: ${months.join(', ')}`);

    let allEntries = [];

    // First try the main page (always has current month)
    try {
        console.log(`Fetching main page...`);
        const mainHTML = await fetchPage(SOURCE_URL);
        const mainEntries = parseScheduleHTML(mainHTML);
        if (mainEntries.length > 0) {
            console.log(`  Found ${mainEntries.length} entries from main page`);
            allEntries.push(...mainEntries);
        }
    } catch (err) {
        console.error(`  Failed to fetch main page: ${err.message}`);
    }

    // Try the AJAX endpoint for additional months
    for (const month of months) {
        // Skip if main page already covered this month
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const alreadyHave = allEntries.some(e => e.arrival.startsWith(monthStr));
        if (alreadyHave) {
            console.log(`  Month ${month} already loaded from main page`);
            continue;
        }

        try {
            console.log(`  Fetching month ${month}/${year} via AJAX...`);
            const html = await fetchMonth(year, month);
            const entries = parseScheduleHTML(html);
            console.log(`  Found ${entries.length} entries for month ${month}`);
            allEntries.push(...entries);
        } catch (err) {
            console.error(`  Failed for month ${month}: ${err.message}`);
        }
    }

    if (allEntries.length === 0) {
        console.error('\nNo schedule entries found! The page structure may have changed.');
        console.error('Check the source manually: ' + SOURCE_URL);
        process.exit(1);
    }

    // Remove cancelled entries and duplicates
    allEntries = allEntries.filter(e => e.status !== 'Cancelled');

    // Deduplicate by ship+arrival date
    const seen = new Set();
    allEntries = allEntries.filter(e => {
        const key = `${e.ship}|${e.arrival}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by date then ETA
    allEntries.sort((a, b) => {
        if (a.arrival !== b.arrival) return a.arrival.localeCompare(b.arrival);
        return a.eta.localeCompare(b.eta);
    });

    // Load existing data to merge
    let existing = { schedule: [] };
    try {
        existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    } catch {}

    // Merge: keep entries from months we didn't re-scrape
    const scrapedMonths = new Set(allEntries.map(e => e.arrival.substring(0, 7)));
    const kept = existing.schedule.filter(e => !scrapedMonths.has(e.arrival.substring(0, 7)));

    const merged = [...kept, ...allEntries];
    merged.sort((a, b) => {
        if (a.arrival !== b.arrival) return a.arrival.localeCompare(b.arrival);
        return a.eta.localeCompare(b.eta);
    });

    const output = {
        source: SOURCE_URL,
        lastUpdated: new Date().toISOString(),
        schedule: merged,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\nSaved ${merged.length} entries to ${OUTPUT_FILE}`);
    console.log(`Months covered: ${[...new Set(merged.map(e => e.arrival.substring(0, 7)))].join(', ')}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
