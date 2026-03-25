/**
 * Cozumel Cruise Ship Schedule
 * Source: https://servicios.apiqroo.com.mx/programacion/
 * Data loaded from schedule-data.json (updated monthly)
 *
 * To refresh: run `node scrape-schedule.js` or manually update schedule-data.json
 */

// ── Cruise line detection from ship name ──────────
const CRUISE_LINE_PATTERNS = [
    { pattern: /DISNEY/i, code: 'DCL', name: 'Disney Cruise Line', color: '#1a1a6c' },
    { pattern: /CARNIVAL|MARDI GRAS/i, code: 'CCL', name: 'Carnival Cruise Line', color: '#003da5' },
    { pattern: /NORWEGIAN/i, code: 'NCL', name: 'Norwegian Cruise Line', color: '#0077c8' },
    { pattern: /MSC[.\s]/i, code: 'MSC', name: 'MSC Cruises', color: '#002b5c' },
    { pattern: /CELEBRITY/i, code: 'CEL', name: 'Celebrity Cruises', color: '#1b365d' },
    { pattern: /ICON OF THE SEAS|STAR OF THE SEAS|OASIS|ALLURE|HARMONY|WONDER|SYMPHONY|EXPLORER|INDEPENDENCE|MARINER|RHAPSODY|ENCHANTMENT|GRANDEUR|FREEDOM|LIBERTY OF/i, code: 'RCL', name: 'Royal Caribbean', color: '#0052a5' },
    { pattern: /PRINCESS|REGAL|MAJESTIC|ENCHANTED|ISLAND PRINCESS|SUN PRINCESS|STAR PRINCESS/i, code: 'PRC', name: 'Princess Cruises', color: '#00263e' },
    { pattern: /EURODAM|KONINGSDAM|NIEUW|ROTTERDAM|ZUIDERDAM|OOSTERDAM|WESTERDAM|VOLENDAM|ZAANDAM/i, code: 'HAL', name: 'Holland America Line', color: '#003057' },
    { pattern: /SCARLET LADY|VALIANT LADY|RESILIENT LADY|BRILLIANT LADY/i, code: 'VIR', name: 'Virgin Voyages', color: '#e4002b' },
    { pattern: /QUEEN ELIZABETH|QUEEN MARY|QUEEN VICTORIA|QUEEN ANNE/i, code: 'CUN', name: 'Cunard', color: '#1a1a2e' },
    { pattern: /SEVEN SEAS/i, code: 'RSS', name: 'Regent Seven Seas', color: '#1a365d' },
    { pattern: /INSIGNIA|NAUTICA|MARINA|RIVIERA|SIRENA/i, code: 'OCL', name: 'Oceania Cruises', color: '#2c3e50' },
    { pattern: /MARGARITAVILLE/i, code: 'MAR', name: 'Margaritaville at Sea', color: '#f0a500' },
    { pattern: /MEIN SCHIFF/i, code: 'TUI', name: 'TUI Cruises', color: '#d40e14' },
    { pattern: /AIDA/i, code: 'AID', name: 'AIDA Cruises', color: '#003b7c' },
    { pattern: /SEA CLOUD/i, code: 'SCC', name: 'Sea Cloud Cruises', color: '#2c5f7c' },
    { pattern: /VENTURA|AZURA|BRITANNIA|ARVIA|IONA/i, code: 'POC', name: 'P&O Cruises', color: '#002855' },
];

// ── Known passenger capacities ────────────────────
const SHIP_CAPACITIES = {
    'ICON OF THE SEAS': 7600,
    'STAR OF THE SEAS': 7600,
    'WONDER OF THE SEAS': 6988,
    'HARMONY OF THE SEAS': 6687,
    'ALLURE OF THE SEAS': 6780,
    'OASIS OF THE SEAS': 6780,
    'SYMPHONY OF THE SEAS': 6680,
    'EXPLORER OF THE SEAS': 3840,
    'INDEPENDENCE OF THE SEAS': 4370,
    'MARINER OF THE SEAS': 3807,
    'RHAPSODY OF THE SEAS': 2435,
    'ENCHANTMENT OF THE SEAS': 2446,
    'GRANDEUR OF THE SEAS': 2446,
    'MSC WORLD AMERICA': 6774,
    'MSC SEASCAPE': 5877,
    'MSC GRANDIOSA': 6334,
    'MSC. DIVINA': 4345,
    'MSC SEASIDE': 5179,
    'MSC MERAVIGLIA': 5714,
    'CARNIVAL CELEBRATION': 5374,
    'CARNIVAL JUBILEE': 5400,
    'MARDI GRAS': 5282,
    'CARNIVAL VENEZIA': 4072,
    'CARNIVAL HORIZON': 3960,
    'CARNIVAL BREEZE': 3690,
    'CARNIVAL VISTA': 3934,
    'CARNIVAL VALOR': 2984,
    'CARNIVAL LIBERTY': 2984,
    'CARNIVAL LEGEND': 2124,
    'CARNIVAL MIRACLE': 2124,
    'CARNIVAL PARADISE': 2052,
    'CARNIVAL DREAM': 3646,
    'CARNIVAL GLORY': 2984,
    'CARNIVAL MAGIC': 3690,
    'CARNIVAL VENEZIA': 4072,
    'NORWEGIAN VIVA': 3998,
    'NORWEGIAN PRIMA': 3215,
    'NORWEGIAN ENCORE': 3998,
    'NORWEGIAN ESCAPE': 4266,
    'NORWEGIAN DAWN': 2340,
    'NORWEGIAN PEARL': 2394,
    'NORWEGIAN JEWEL': 2376,
    'NORWEGIAN GETAWAY': 3963,
    'NORWEGIAN JOY': 3883,
    'DISNEY MAGIC': 2713,
    'DISNEY FANTASY': 4000,
    'DISNEY WISH': 4000,
    'DISNEY TREASURE': 4000,
    'DISNEY DESTINY': 4000,
    'CELEBRITY XCEL': 3250,
    'CELEBRITY BEYOND': 3260,
    'CELEBRITY APEX': 3260,
    'CELEBRITY ECLIPSE': 2850,
    'CELEBRITY SILHOUETTE': 2886,
    'CELEBRITY CONSTELLATION': 2170,
    'CELEBRITY SUMMIT': 2158,
    'REGAL PRINCESS': 3560,
    'MAJESTIC PRINCESS': 3560,
    'STAR PRINCESS': 4300,
    'SUN PRINCESS': 4300,
    'ENCHANTED PRINCESS': 3660,
    'ISLAND PRINCESS': 2200,
    'EURODAM': 2104,
    'KONINGSDAM': 2650,
    'NIEUW STATENDAM': 2666,
    'NIEUW AMSTERDAM': 2106,
    'SCARLET LADY': 2770,
    'RESILIENT LADY': 2770,
    'VALIANT LADY': 2770,
    'QUEEN ELIZABETH': 2081,
    'SEVEN SEAS GRANDEUR': 750,
    'INSIGNIA': 684,
    'NAUTICA': 684,
    'MARGARITAVILLE AT SEA ISLANDER': 2350,
    'MEIN SCHIFF 1': 2894,
    'AIDASOL': 2194,
    'SEA CLOUD SPIRIT': 136,
    'VENTURA': 3078,
};

// ── Dock definitions ──────────────────────────────
const DOCKS = {
    'Punta Langosta': { name: 'Punta Langosta', shortName: 'P. Langosta', cssClass: 'punta-langosta', calClass: 'dock-pl' },
    'SSA Mexico': { name: 'SSA Mexico', shortName: 'SSA', cssClass: 'ssa', calClass: 'dock-ssa' },
    'Puerta Maya': { name: 'Puerta Maya', shortName: 'P. Maya', cssClass: 'puerta-maya', calClass: 'dock-pm' },
};

// ── Helpers ───────────────────────────────────────
function detectCruiseLine(shipName) {
    for (const entry of CRUISE_LINE_PATTERNS) {
        if (entry.pattern.test(shipName)) {
            return { code: entry.code, name: entry.name, color: entry.color };
        }
    }
    return { code: 'UNK', name: 'Unknown Line', color: '#666' };
}

function cleanShipName(raw) {
    return raw.replace(/^M\/[SV]\s+/i, '').replace(/^MS\s+/i, '').trim();
}

function getCapacity(shipName) {
    const cleaned = cleanShipName(shipName);
    return SHIP_CAPACITIES[cleaned] || SHIP_CAPACITIES[shipName] || null;
}

// ── Load and transform schedule data ──────────────
let SCHEDULE_DATA = [];
let SCHEDULE_META = {};

async function loadScheduleData() {
    try {
        const response = await fetch('schedule-data.json');
        const data = await response.json();
        SCHEDULE_META = {
            source: data.source,
            lastUpdated: data.lastUpdated,
        };
        SCHEDULE_DATA = data.schedule.map(entry => ({
            ship: entry.ship,
            shipClean: cleanShipName(entry.ship),
            line: detectCruiseLine(entry.ship),
            capacity: getCapacity(entry.ship),
            date: entry.arrival,
            arrival: entry.eta,
            departure: entry.etd,
            departureDate: entry.departure,
            dock: entry.terminal,
            status: entry.status,
        }));
        return true;
    } catch (err) {
        console.error('Failed to load schedule data:', err);
        return false;
    }
}
