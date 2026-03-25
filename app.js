// ── Utility Functions ─────────────────────────────
function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDayName(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getShipStatus(entry) {
    const now = new Date();
    const today = todayStr();

    // If not today, use the source status
    if (entry.date !== today) {
        if (entry.date < today) return { label: 'Arrived', cssClass: 'status-departed' };
        return { label: 'Scheduled', cssClass: 'status-arriving' };
    }

    // For today, compute live status
    const arrTime = new Date(today + 'T' + entry.arrival + ':00');
    const depDate = entry.departureDate || today;
    const depTime = new Date(depDate + 'T' + entry.departure + ':00');

    if (now < arrTime) return { label: 'Arriving', cssClass: 'status-arriving' };
    if (now > depTime) return { label: 'Departed', cssClass: 'status-departed' };
    return { label: 'In Port', cssClass: 'status-in-port' };
}

function formatPassengers(num) {
    if (!num) return 'N/A';
    return num.toLocaleString();
}

function getDock(terminal) {
    return DOCKS[terminal] || { name: terminal, shortName: terminal, cssClass: 'ssa', calClass: 'dock-ssa' };
}

function getShipsByDate(dateStr) {
    return SCHEDULE_DATA.filter(s => s.date === dateStr);
}

// ── Tab Switching ─────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// ── Set Current Date ──────────────────────────────
document.getElementById('currentDate').textContent = formatDate(todayStr());

// ── Today View ────────────────────────────────────
function renderToday() {
    const today = todayStr();
    const ships = getShipsByDate(today);
    const grid = document.getElementById('todayGrid');

    // Stats
    document.getElementById('shipsToday').textContent = ships.length;
    const totalPax = ships.reduce((sum, s) => sum + (s.capacity || 0), 0);
    document.getElementById('passengersToday').textContent = totalPax > 0 ? formatPassengers(totalPax) : '—';
    const activeDocks = new Set(ships.map(s => s.dock));
    document.getElementById('docksActive').textContent = activeDocks.size;

    if (ships.length === 0) {
        grid.innerHTML = '<div class="empty-state">No ships in port today</div>';
        return;
    }

    grid.innerHTML = ships.map(ship => {
        const dock = getDock(ship.dock);
        const status = getShipStatus(ship);

        return `
            <div class="ship-card dock-${dock.cssClass}">
                <div class="ship-name">${ship.shipClean}</div>
                <div class="cruise-line" style="color:${ship.line.color}">${ship.line.name}</div>
                <div class="ship-details">
                    <div class="detail">
                        <span class="detail-label">Arrives</span>
                        <span class="detail-value">${ship.arrival}</span>
                    </div>
                    <div class="detail">
                        <span class="detail-label">Departs</span>
                        <span class="detail-value">${ship.departure}</span>
                    </div>
                    <div class="detail">
                        <span class="detail-label">Passengers</span>
                        <span class="detail-value">${formatPassengers(ship.capacity)}</span>
                    </div>
                    <div class="detail">
                        <span class="detail-label">Dock</span>
                        <span class="detail-value">
                            <span class="dock-tag ${dock.cssClass}">${dock.name}</span>
                        </span>
                    </div>
                </div>
                <span class="status-badge ${status.cssClass}">${status.label}</span>
            </div>
        `;
    }).join('');
}

// ── Week View ─────────────────────────────────────
function renderWeek() {
    const weekList = document.getElementById('weekList');
    const today = todayStr();
    const days = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
    }

    let html = '';
    days.forEach(dateStr => {
        const ships = getShipsByDate(dateStr);
        const isToday = dateStr === today;

        html += `
            <div class="week-day-group">
                <div class="week-day-header ${isToday ? 'today' : ''}">
                    <span>${formatDayName(dateStr)}${isToday ? ' (Today)' : ''}</span>
                    <span class="ship-count">${ships.length} ship${ships.length !== 1 ? 's' : ''}</span>
                </div>
        `;

        if (ships.length === 0) {
            html += '<div class="week-ship-row"><span style="color:var(--gray-400);font-size:0.85rem">No ships scheduled</span></div>';
        } else {
            ships.forEach(ship => {
                const dock = getDock(ship.dock);
                html += `
                    <div class="week-ship-row">
                        <div class="week-ship-info">
                            <div class="week-ship-name">${ship.shipClean}</div>
                            <div class="week-ship-line" style="color:${ship.line.color}">${ship.line.name}</div>
                        </div>
                        <div class="week-ship-times">
                            <div class="week-ship-time">${ship.arrival} - ${ship.departure}</div>
                            <div class="week-ship-dock">
                                <span class="dock-tag ${dock.cssClass}">${dock.shortName}</span>
                            </div>
                        </div>
                        <div style="font-size:0.8rem;color:var(--gray-500);min-width:70px;text-align:right">
                            ${ship.capacity ? formatPassengers(ship.capacity) + ' pax' : ''}
                        </div>
                    </div>
                `;
            });
        }

        html += '</div>';
    });

    weekList.innerHTML = html;
}

// ── Calendar View ─────────────────────────────────
let calendarWeekStart = new Date();

function getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

calendarWeekStart = getMonday(new Date());

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calTitle');
    const today = todayStr();

    const weekStart = new Date(calendarWeekStart);
    title.textContent = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');

    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const isToday = dateStr === today;
        const ships = getShipsByDate(dateStr);

        html += `<div class="cal-day ${isToday ? 'today' : ''}">`;
        html += `<div class="cal-date">${d.getDate()}</div>`;

        const maxShow = 3;
        ships.slice(0, maxShow).forEach(ship => {
            const dock = getDock(ship.dock);
            const tipText = `${ship.shipClean} (${ship.line.name}) - ${ship.arrival}-${ship.departure} at ${dock.name}`;
            html += `<div class="cal-ship ${dock.calClass}" title="${tipText}">${ship.shipClean}</div>`;
        });

        if (ships.length > maxShow) {
            html += `<div class="cal-ship-more">+${ships.length - maxShow} more</div>`;
        }

        html += '</div>';
    }

    grid.innerHTML = html;
}

document.getElementById('calPrev').addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() - 7);
    renderCalendar();
});

document.getElementById('calNext').addEventListener('click', () => {
    calendarWeekStart.setDate(calendarWeekStart.getDate() + 7);
    renderCalendar();
});

// ── Data source info ──────────────────────────────
function updateSourceInfo() {
    const el = document.getElementById('lastUpdated');
    if (SCHEDULE_META.lastUpdated) {
        const d = new Date(SCHEDULE_META.lastUpdated);
        el.textContent = `Data from: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        el.title = `Source: ${SCHEDULE_META.source}`;
    }
}

// ── Auto-refresh status badges every minute ───────
function refreshStatuses() {
    renderToday();
}

// ── Initialize ────────────────────────────────────
async function init() {
    const loaded = await loadScheduleData();
    if (!loaded) {
        document.getElementById('todayGrid').innerHTML =
            '<div class="empty-state">Failed to load schedule data. Make sure schedule-data.json exists.</div>';
        return;
    }
    renderToday();
    renderWeek();
    renderCalendar();
    updateSourceInfo();

    // Refresh every 60 seconds for live status
    setInterval(refreshStatuses, 60000);
}

init();
