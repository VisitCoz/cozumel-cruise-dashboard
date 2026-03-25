#!/usr/bin/env node
/**
 * Telegram Notification System for Cozumel Cruise Dashboard
 *
 * Sends daily schedule alerts to you and your guides via Telegram.
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → get your BOT TOKEN
 *   2. Add the bot to your group chat (or message it directly)
 *   3. Get chat IDs (run: node notify-telegram.js --setup)
 *   4. Set environment variables:
 *        TELEGRAM_BOT_TOKEN=your_bot_token
 *        TELEGRAM_CHAT_IDS=chat_id_1,chat_id_2,chat_id_3
 *
 * Usage:
 *   node notify-telegram.js              # Send today's schedule
 *   node notify-telegram.js --tomorrow   # Send tomorrow's schedule
 *   node notify-telegram.js --week       # Send weekly summary
 *   node notify-telegram.js --setup      # Find your chat IDs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || '').split(',').filter(Boolean);

// ── Ship capacity lookup (same as data.js) ────────
const SHIP_CAPACITIES = {
    'ICON OF THE SEAS': 7600, 'STAR OF THE SEAS': 7600,
    'HARMONY OF THE SEAS': 6687, 'ALLURE OF THE SEAS': 6780,
    'OASIS OF THE SEAS': 6780, 'EXPLORER OF THE SEAS': 3840,
    'INDEPENDENCE OF THE SEAS': 4370, 'MARINER OF THE SEAS': 3807,
    'RHAPSODY OF THE SEAS': 2435, 'ENCHANTMENT OF THE SEAS': 2446,
    'GRANDEUR OF THE SEAS': 2446, 'MSC WORLD AMERICA': 6774,
    'MSC SEASCAPE': 5877, 'MSC GRANDIOSA': 6334, 'MSC. DIVINA': 4345,
    'CARNIVAL CELEBRATION': 5374, 'CARNIVAL JUBILEE': 5400,
    'MARDI GRAS': 5282, 'CARNIVAL VENEZIA': 4072,
    'CARNIVAL HORIZON': 3960, 'CARNIVAL BREEZE': 3690,
    'CARNIVAL VALOR': 2984, 'CARNIVAL LIBERTY': 2984,
    'CARNIVAL LEGEND': 2124, 'CARNIVAL MIRACLE': 2124,
    'CARNIVAL PARADISE': 2052, 'NORWEGIAN VIVA': 3998,
    'NORWEGIAN PRIMA': 3215, 'NORWEGIAN ENCORE': 3998,
    'NORWEGIAN ESCAPE': 4266, 'NORWEGIAN DAWN': 2340,
    'NORWEGIAN PEARL': 2394, 'NORWEGIAN JEWEL': 2376,
    'DISNEY MAGIC': 2713, 'DISNEY TREASURE': 4000,
    'DISNEY DESTINY': 4000, 'CELEBRITY XCEL': 3250,
    'CELEBRITY ECLIPSE': 2850, 'CELEBRITY SILHOUETTE': 2886,
    'CELEBRITY CONSTELLATION': 2170, 'CELEBRITY SUMMIT': 2158,
    'CELEBRITY APEX': 3260, 'REGAL PRINCESS': 3560,
    'STAR PRINCESS': 4300, 'SUN PRINCESS': 4300,
    'MAJESTIC PRINCESS': 3560, 'EURODAM': 2104,
    'KONINGSDAM': 2650, 'NIEUW STATENDAM': 2666,
    'SCARLET LADY': 2770, 'RESILIENT LADY': 2770,
    'QUEEN ELIZABETH': 2081, 'SEVEN SEAS GRANDEUR': 750,
    'INSIGNIA': 684, 'NAUTICA': 684,
    'MARGARITAVILLE AT SEA ISLANDER': 2350,
    'MEIN SCHIFF 1': 2894, 'AIDASOL': 2194,
    'SEA CLOUD SPIRIT': 136, 'VENTURA': 3078,
};

function cleanShipName(raw) {
    return raw.replace(/^M\/[SV]\s+/i, '').replace(/^MS\s+/i, '').trim();
}

function getCapacity(name) {
    return SHIP_CAPACITIES[cleanShipName(name)] || SHIP_CAPACITIES[name] || null;
}

// ── Telegram API ──────────────────────────────────
function telegramAPI(method, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { resolve({ ok: false, body }); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function sendMessage(chatId, text) {
    const result = await telegramAPI('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
    });
    if (!result.ok) {
        console.error(`Failed to send to ${chatId}:`, result.description || result);
    }
    return result;
}

// ── Schedule data loading ─────────────────────────
function loadSchedule() {
    const filePath = path.join(__dirname, 'schedule-data.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getShipsForDate(schedule, dateStr) {
    return schedule.filter(s => s.arrival === dateStr);
}

function formatDateNice(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Message builders ──────────────────────────────
function buildDayMessage(dateStr, ships, label) {
    if (ships.length === 0) {
        return `⚓ <b>${label} - ${formatDateNice(dateStr)}</b>\n\nNo ships scheduled.`;
    }

    const totalPax = ships.reduce((sum, s) => sum + (getCapacity(s.ship) || 0), 0);

    let msg = `⚓ <b>${label} - ${formatDateNice(dateStr)}</b>\n`;
    msg += `📊 ${ships.length} ships | ~${totalPax.toLocaleString()} passengers\n\n`;

    ships.forEach((ship, i) => {
        const name = cleanShipName(ship.ship);
        const cap = getCapacity(ship.ship);
        const capStr = cap ? ` (${cap.toLocaleString()} pax)` : '';
        msg += `${i + 1}. <b>${name}</b>${capStr}\n`;
        msg += `   📍 ${ship.terminal}\n`;
        msg += `   🕐 ${ship.eta} → ${ship.etd}\n\n`;
    });

    return msg.trim();
}

function buildWeekMessage(schedule) {
    let msg = `📅 <b>Cozumel Weekly Cruise Schedule</b>\n\n`;

    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const ships = getShipsForDate(schedule, dateStr);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const isToday = i === 0;

        if (ships.length === 0) {
            msg += `${isToday ? '👉 ' : ''}${dayName}: <i>No ships</i>\n`;
        } else {
            const names = ships.map(s => cleanShipName(s.ship)).join(', ');
            const totalPax = ships.reduce((sum, s) => sum + (getCapacity(s.ship) || 0), 0);
            msg += `${isToday ? '👉 ' : ''}${dayName}: <b>${ships.length} ships</b> (~${totalPax.toLocaleString()} pax)\n`;
            msg += `   ${names}\n`;
        }
    }

    msg += `\n🔗 Source: APIQROO Port Authority`;
    return msg;
}

// ── Setup helper ──────────────────────────────────
async function setup() {
    if (!BOT_TOKEN) {
        console.log(`
╔══════════════════════════════════════════════════╗
║       Telegram Bot Setup for Cozumel Dashboard   ║
╚══════════════════════════════════════════════════╝

Step 1: Create a Telegram Bot
  → Open Telegram and message @BotFather
  → Send /newbot
  → Choose a name (e.g., "Cozumel Cruise Alert")
  → Choose a username (e.g., "cozumel_cruise_bot")
  → Copy the BOT TOKEN you receive

Step 2: Set environment variable
  → Set TELEGRAM_BOT_TOKEN=<your_token>
  → Then run: node notify-telegram.js --setup

Step 3: Get chat IDs
  → Message your bot on Telegram (send /start)
  → Or add it to a group chat with your guides
  → Run this setup again to see chat IDs

Step 4: Set chat IDs
  → Set TELEGRAM_CHAT_IDS=id1,id2,id3
  → For GitHub Actions, add both as repository secrets
`);
        return;
    }

    console.log('Checking for messages to your bot...');
    const result = await telegramAPI('getUpdates', { offset: -10 });

    if (!result.ok) {
        console.error('Error:', result.description);
        return;
    }

    if (result.result.length === 0) {
        console.log('\nNo messages found. Send /start to your bot on Telegram first, then run this again.');
        return;
    }

    const chats = new Map();
    for (const update of result.result) {
        const chat = update.message?.chat;
        if (chat) {
            chats.set(chat.id, {
                id: chat.id,
                type: chat.type,
                name: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.trim(),
            });
        }
    }

    console.log('\nFound these chats:\n');
    for (const [id, chat] of chats) {
        console.log(`  Chat ID: ${id}`);
        console.log(`  Name:    ${chat.name}`);
        console.log(`  Type:    ${chat.type}`);
        console.log('');
    }

    const ids = [...chats.keys()].join(',');
    console.log(`Set this as your TELEGRAM_CHAT_IDS: ${ids}`);
}

// ── Main ──────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--setup')) {
        return setup();
    }

    if (!BOT_TOKEN) {
        console.error('TELEGRAM_BOT_TOKEN not set. Run with --setup for instructions.');
        process.exit(1);
    }

    if (CHAT_IDS.length === 0) {
        console.error('TELEGRAM_CHAT_IDS not set. Run with --setup for instructions.');
        process.exit(1);
    }

    const data = loadSchedule();
    const schedule = data.schedule;

    let message;

    if (args.includes('--week')) {
        message = buildWeekMessage(schedule);
    } else {
        const offset = args.includes('--tomorrow') ? 1 : 0;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const dateStr = d.toISOString().split('T')[0];
        const ships = getShipsForDate(schedule, dateStr);
        const label = offset === 0 ? 'TODAY in Cozumel' : 'TOMORROW in Cozumel';
        message = buildDayMessage(dateStr, ships, label);
    }

    console.log('Sending to', CHAT_IDS.length, 'chat(s)...');
    console.log('---');
    console.log(message.replace(/<[^>]+>/g, ''));
    console.log('---');

    for (const chatId of CHAT_IDS) {
        const result = await sendMessage(chatId.trim(), message);
        if (result.ok) {
            console.log(`Sent to ${chatId}`);
        }
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
