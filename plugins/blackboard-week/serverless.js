// TRMNL Serverless function for the blackboard-week plugin.
//
// Paste this into the plugin's "Markup Editor → Serverless" tab, Node runtime.
// Sandboxed Node v20 with outbound fetch(), 128 MB, 5 seconds.
//
// This function fetches GWU's Blackboard calendar feed itself rather than using
// a Polling URL. TRMNL's polling layer is content-type driven: it fetches the
// feed fine but discards the body, because `text/calendar` isn't among the types
// it parses — the sandbox then receives a payload whose only key is `trmnl`.
//
// That feed contains ONLY gradebook due dates — every VEVENT is a
// `GradableItem`, with no LOCATION, no CATEGORIES, an empty DESCRIPTION, and no
// course name anywhere. So this transform does three things the feed can't:
//
//   1. Fetches and parses the ICS (no recurrence: every RRULE is a DST rule
//      inside VTIMEZONE, and zero VEVENTs recur).
//   2. Attributes each due date to a course, via the gradebook UID blocks in
//      SEMESTER.uidRanges below.
//   3. Merges in the class schedule and the deadlines Blackboard never got told
//      about — including a course's capstone paper, which in the real Fall 2026
//      data was worth 30 of 101 points and appeared nowhere in the feed.
//
// All feed timestamps are TZID=America/New_York and the screen renders Eastern,
// so wall-clock components are used directly; epochs are only computed where a
// real duration is needed (countdowns), via Intl rather than offset arithmetic.

// ─────────────────────────────────────────────────────────────────────────────
// SEMESTER CONFIG — the only block that needs editing between semesters.
//
// This is a SYNTHETIC EXAMPLE. This repo is public, so it does not carry a real
// class schedule or real coursework; samples/learn.ics is synthetic to match.
// The real config lives in local/semester.local.js, which is gitignored — paste
// this file into TRMNL's Serverless tab, then swap this block for that one.
// ─────────────────────────────────────────────────────────────────────────────
var SEMESTER = {
  // Weekly classes run from `start` through `end` inclusive, skipping `breaks`.
  start: '2026-08-24',
  end: '2026-12-01',

  courses: {
    LT: { short: 'Team Dynamics', name: 'Team Dynamics' },
    ETH: { short: 'Analytics', name: 'Applied Analytics' },
    MGT: { short: 'MGT 0000', name: 'MGT 0000 · Example Async Course' },
  },

  // weekday: 0=Sun .. 6=Sat
  weeklyClasses: [
    { course: 'LT', weekday: 3, start: '16:30', end: '19:00', location: 'Hall 652' },
    { course: 'ETH', weekday: 4, start: '19:00', end: '20:00', location: 'Online' },
  ],

  // The MGT course is asynchronous — no weekly meeting, just five live sessions
  // on scattered dates, which is why oneOffClasses exists at all.
  oneOffClasses: [
    { course: 'MGT', date: '2026-08-24', start: '19:00', end: '21:00', location: 'Online · live session' },
    { course: 'MGT', date: '2026-08-30', start: '19:00', end: '21:00', location: 'Online · live session' },
    { course: 'MGT', date: '2026-10-11', start: '19:00', end: '21:00', location: 'Online · live session' },
    { course: 'MGT', date: '2026-11-15', start: '19:00', end: '21:00', location: 'Online · live session' },
    { course: 'MGT', date: '2026-11-29', start: '19:00', end: '21:00', location: 'Online · live session' },
  ],

  // Weekly classes only. One-off live sessions are never suppressed — the async
  // course deliberately meets on Sun 11/29, inside the break week.
  breaks: [{ from: '2026-11-23', to: '2026-11-29', reason: 'Thanksgiving break' }],

  // Deadlines that exist in a syllabus but never in Blackboard's feed.
  extraDeadlines: [
    { course: 'MGT', date: '2026-12-13', time: '18:00', title: 'Capstone Project: Final Paper' },
  ],

  // Blackboard gradebook UIDs are allocated in per-course blocks — the only
  // per-course signal the feed carries. Verify a block by matching one of its
  // items against the course syllabus before trusting the whole range; the real
  // Fall 2026 mapping was confirmed that way. Padded to absorb mid-term items.
  uidRanges: [
    { from: 3152000, to: 3152999, course: 'MGT' },
    { from: 3176000, to: 3176999, course: 'ETH' },
    { from: 3179000, to: 3180999, course: 'LT' },
    { from: 3200000, to: 3200999, course: 'LT' },
  ],

  // Fallback only, for items whose UID lands outside every range above. Ordered;
  // first match wins. Deliberately keyed on distinctive course vocabulary.
  titleRules: [
    { pattern: 'self-check', course: 'MGT' },
    { pattern: 'case study', course: 'MGT' },
    { pattern: 'article review', course: 'ETH' },
    { pattern: 'metrics appendix', course: 'ETH' },
    { pattern: 'field study', course: 'ETH' },
    { pattern: 'team contract', course: 'ETH' },
    { pattern: 'team charter', course: 'LT' },
    { pattern: 'team project', course: 'LT' },
    { pattern: 'team participation', course: 'LT' },
    { pattern: 'application assignment', course: 'LT' },
    { pattern: 'preparation activity', course: 'LT' },
  ],
};

var WINDOW_DAYS = 7; // rolling window, today inclusive
var QUEUE_SIZE = 6; // hard ceiling; QUEUE_BUDGET_PX decides what actually fits

// The agenda column is a fixed 800x480 panel with no scrollbar and no runtime
// text-fitting, so density has to be decided here rather than discovered on the
// device. These are measured against the rendered preview: an empty run costs
// ~22px, a day row ~11px of padding plus ~34px per item, and a title long enough
// to wrap costs another line. Anything that doesn't fit collapses into a single
// "+N more" row, which is honest about what's hidden instead of clipping it.
var AGENDA_BUDGET_PX = 340;
var ROW_EMPTY_PX = 22;
var ROW_PAD_PX = 11;
var ITEM_PX = 38;
var ITEM_WRAP_PX = 17;
var WRAP_AT_CHARS = 38;
var AGENDA_TITLE_MAX = 46;

// The rail is budgeted like the agenda — it clipped its last entry on hardware,
// where a two-line title costs more than the desktop preview suggested.
var QUEUE_BUDGET_PX = 302;
var QUEUE_ITEM_PX = 50;
var QUEUE_WRAP_PX = 15;
var QUEUE_WRAP_AT_CHARS = 30;
var QUEUE_TITLE_MAX = 44;
var ET = 'America/New_York';

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers. Everything is Eastern civil time; `ymd` is a "YYYY-MM-DD" key.
// ─────────────────────────────────────────────────────────────────────────────

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(y, mo, d) { return y + '-' + pad2(mo) + '-' + pad2(d); }

function etNowParts() {
  var f = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  var p = {};
  f.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
  // hour12:false can emit "24" at midnight in some ICU versions.
  var h = Number(p.hour) % 24;
  return { y: Number(p.year), mo: Number(p.month), d: Number(p.day), h: h, mi: Number(p.minute) };
}

// Convert an Eastern wall-clock time to a UTC epoch without hard-coding any
// offset. Formats a guess back into Eastern and corrects; two passes converge
// even across a DST boundary.
function etWallToEpoch(y, mo, d, h, mi) {
  var target = Date.UTC(y, mo - 1, d, h, mi);
  var guess = target;
  for (var i = 0; i < 2; i++) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    var p = {};
    f.formatToParts(new Date(guess)).forEach(function (x) { p[x.type] = x.value; });
    var seen = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    guess += target - seen;
  }
  return guess;
}

// Civil-date arithmetic done at noon UTC, which no DST shift can move across a
// date boundary.
function addDays(key, n) {
  var parts = key.split('-');
  var t = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12) + n * 86400000;
  var dt = new Date(t);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayOf(key) {
  var parts = key.split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12)).getUTCDay();
}

var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayNumOf(key) { return Number(key.split('-')[2]); }
function titleCase(word) { return word.charAt(0) + word.slice(1).toLowerCase(); }
function monthOf(key) { return MON[Number(key.split('-')[1]) - 1]; }

// "4:30 PM" — no leading zero, matching how a person reads a schedule.
function timeLabel(h, mi) {
  var period = h >= 12 ? 'PM' : 'AM';
  var hour = h % 12;
  if (hour === 0) hour = 12;
  return hour + ':' + pad2(mi) + ' ' + period;
}

function hhmm(str) {
  var bits = str.split(':');
  return { h: Number(bits[0]), mi: Number(bits[1]) };
}

// Days and hours only, as a bare magnitude — the hero labels it separately.
// Polling is hourly, so minute precision would be a lie.
function countdownLabel(fromMs, toMs) {
  var mins = Math.round((toMs - fromMs) / 60000);
  if (mins <= 0) return 'now';
  var hrs = Math.floor(mins / 60);
  if (hrs < 1) return '< 1h';
  if (hrs < 24) return hrs + 'h';
  var days = Math.floor(hrs / 24);
  var rem = hrs % 24;
  if (days >= 7) return days + 'd';
  return rem > 0 ? days + 'd ' + rem + 'h' : days + 'd';
}

// ─────────────────────────────────────────────────────────────────────────────
// ICS parsing
// ─────────────────────────────────────────────────────────────────────────────

// RFC 5545 line folding: a line beginning with a space or tab continues the one
// before it.
function unfold(text) {
  return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseVevents(text) {
  var lines = unfold(text).split(/\r?\n/);
  var events = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue; // skips VTIMEZONE, which has its own DTSTART/RRULE lines
    var colon = line.indexOf(':');
    if (colon < 0) continue;
    var left = line.slice(0, colon);
    var semi = left.indexOf(';');
    var name = semi < 0 ? left : left.slice(0, semi);
    if (!(name in cur)) cur[name] = line.slice(colon + 1);
  }
  return events;
}

function parseIcsDate(value) {
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(String(value).trim());
  if (!m) return null;
  return {
    key: ymd(Number(m[1]), Number(m[2]), Number(m[3])),
    h: m[4] ? Number(m[4]) : 0,
    mi: m[5] ? Number(m[5]) : 0,
    allDay: !m[4],
  };
}

// ICS escaping: \, \; \n are the ones Blackboard actually emits. The trailing
// "(due noon on 9/9)" parenthetical some instructors add is dropped — the screen
// already states the due time, and it costs a line of wrap.
function unescapeText(value) {
  return String(value)
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*\((?:due|submit)[^)]*\)\s*$/i, '')
    .trim();
}

// The right rail is one line per item; a 100-character assignment title has to
// give way somewhere, and an ellipsis beats an overflowing row.
function truncate(text, max) {
  var t = String(text);
  if (t.length <= max) return t;
  var cut = t.slice(0, max - 1);
  // Prefer a word boundary, but not one so early it hides most of the title.
  var space = cut.lastIndexOf(' ');
  if (space > max * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s:;,.\-]+$/, '') + '…';
}

function uidNumber(uid) {
  var m = /-_(\d+)_/.exec(String(uid));
  return m ? Number(m[1]) : null;
}

function courseFor(uid, title) {
  var n = uidNumber(uid);
  if (n !== null) {
    for (var i = 0; i < SEMESTER.uidRanges.length; i++) {
      var r = SEMESTER.uidRanges[i];
      if (n >= r.from && n <= r.to) return r.course;
    }
  }
  var lower = String(title || '').toLowerCase();
  for (var j = 0; j < SEMESTER.titleRules.length; j++) {
    if (lower.indexOf(SEMESTER.titleRules[j].pattern) !== -1) return SEMESTER.titleRules[j].course;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule generation
// ─────────────────────────────────────────────────────────────────────────────

function inBreak(key) {
  for (var i = 0; i < SEMESTER.breaks.length; i++) {
    if (key >= SEMESTER.breaks[i].from && key <= SEMESTER.breaks[i].to) return true;
  }
  return false;
}

function classesOn(key) {
  var out = [];
  var i;
  if (key >= SEMESTER.start && key <= SEMESTER.end && !inBreak(key)) {
    var wd = weekdayOf(key);
    for (i = 0; i < SEMESTER.weeklyClasses.length; i++) {
      var c = SEMESTER.weeklyClasses[i];
      if (c.weekday === wd) out.push(c);
    }
  }
  for (i = 0; i < SEMESTER.oneOffClasses.length; i++) {
    if (SEMESTER.oneOffClasses[i].date === key) out.push(SEMESTER.oneOffClasses[i]);
  }
  return out.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
}

function courseInfo(code) {
  return SEMESTER.courses[code] || { short: '—', name: 'Unassigned' };
}


// ─────────────────────────────────────────────────────────────────────────────
// Payload probing
// ─────────────────────────────────────────────────────────────────────────────

var ICS_MARKER = 'BEGIN:VCALENDAR';
var PROBE_MAX_DEPTH = 5;

// Depth-first hunt for the calendar body. Handles a bare string, any wrapper
// object, and a body that arrived pre-split into an array of lines.
function findIcs(value, depth) {
  if (value == null || depth > PROBE_MAX_DEPTH) return null;

  if (typeof value === 'string') {
    return value.indexOf(ICS_MARKER) !== -1 ? value : null;
  }

  if (Array.isArray(value)) {
    var allStrings = value.length > 0;
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string') { allStrings = false; break; }
    }
    if (allStrings) {
      var joined = value.join('\n');
      if (joined.indexOf(ICS_MARKER) !== -1) return joined;
    }
    for (var j = 0; j < value.length; j++) {
      var hit = findIcs(value[j], depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof value === 'object') {
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var found = findIcs(value[keys[k]], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// A compact, safe rendering of what actually arrived, so a failure names its
// cause on the screen instead of just saying "couldn't read the feed".
function describeShape(value, depth) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (depth > 2) return '…';

  if (typeof value === 'string') {
    var head = value.slice(0, 40).replace(/\s+/g, ' ');
    return 'string(' + value.length + ') "' + head + (value.length > 40 ? '…' : '') + '"';
  }
  if (typeof value !== 'object') return typeof value + '(' + String(value).slice(0, 20) + ')';
  if (Array.isArray(value)) {
    return 'array(' + value.length + ')' + (value.length > 0 ? ' of ' + describeShape(value[0], depth + 1) : '');
  }

  var keys = Object.keys(value).slice(0, 6);
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    parts.push(keys[i] + ': ' + describeShape(value[keys[i]], depth + 1));
  }
  return '{ ' + parts.join(', ') + ' }';
}

// ─────────────────────────────────────────────────────────────────────────────

// Pure core: an ICS string in, the rendered screen model out. No clock reading
// beyond "now", no network — so the tests drive this directly.
function buildScreen(raw, debugNote) {
  var ok = typeof raw === 'string' && raw.indexOf(ICS_MARKER) !== -1;

  var now = etNowParts();
  var todayKey = ymd(now.y, now.mo, now.d);
  var nowMs = etWallToEpoch(now.y, now.mo, now.d, now.h, now.mi);

  var out = {
    ok: ok,
    today_label: DOW[weekdayOf(todayKey)] + ' ' + monthOf(todayKey).toUpperCase() + ' ' + dayNumOf(todayKey),
    updated_at: timeLabel(now.h, now.mi) + ' ET',
    next_up: null,
    day_rows: [],
    queue: [],
    courses: [],
    unassigned_count: 0,
    debug_shape: ok ? '' : (debugNote || 'no calendar in the response'),
  };

  var codes = Object.keys(SEMESTER.courses);
  for (var c = 0; c < codes.length; c++) {
    out.courses.push({ code: codes[c], short: SEMESTER.courses[codes[c]].short, name: SEMESTER.courses[codes[c]].name });
  }

  if (!ok) return out;

  // ── Deadlines: feed + hardcoded, all normalized to one shape ───────────────
  var deadlines = [];
  var events = parseVevents(raw);
  var i;
  for (i = 0; i < events.length; i++) {
    var ev = events[i];
    if (!ev.DTSTART || !ev.SUMMARY) continue;
    var when = parseIcsDate(ev.DTSTART);
    if (!when) continue;
    var title = unescapeText(ev.SUMMARY);
    var code = courseFor(ev.UID, title);
    deadlines.push({
      key: when.key, h: when.h, mi: when.mi, title: title,
      course: code, source: 'blackboard',
    });
  }
  for (i = 0; i < SEMESTER.extraDeadlines.length; i++) {
    var x = SEMESTER.extraDeadlines[i];
    var t = hhmm(x.time);
    deadlines.push({ key: x.date, h: t.h, mi: t.mi, title: x.title, course: x.course, source: 'syllabus' });
  }
  deadlines.sort(function (a, b) {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    if (a.h !== b.h) return a.h - b.h;
    return a.mi - b.mi;
  });

  // Still-open deadlines only: today's items stay until their time has passed.
  var upcoming = deadlines.filter(function (d) {
    if (d.key > todayKey) return true;
    if (d.key < todayKey) return false;
    return d.h * 60 + d.mi >= now.h * 60 + now.mi;
  });

  // Prior semesters sit in the same feed with UIDs outside every configured
  // range. They can never reach the screen, so only upcoming items count as
  // genuinely unattributed.
  for (i = 0; i < upcoming.length; i++) {
    if (!upcoming[i].course) out.unassigned_count++;
  }

  // ── Left column: one row per day, empty days collapsed into a single run ───
  var lastKey = addDays(todayKey, WINDOW_DAYS - 1);
  var candidates = [];
  var hiddenItems = 0;

  function rowHeight(row) {
    if (row.items.length === 0) return ROW_EMPTY_PX;
    var h = ROW_PAD_PX;
    for (var k = 0; k < row.items.length; k++) {
      h += ITEM_PX;
      if (String(row.items[k].title).length > WRAP_AT_CHARS) h += ITEM_WRAP_PX;
    }
    return h;
  }

  function classesOnly(row) {
    var kept = [];
    for (var i = 0; i < row.items.length; i++) {
      if (row.items[i].kind === 'class') kept.push(row.items[i]);
    }
    return { kind: row.kind, label: row.label, is_today: row.is_today, items: kept };
  }

  for (var dayIdx = 0; dayIdx < WINDOW_DAYS; dayIdx++) {
    var key = addDays(todayKey, dayIdx);
    var isToday = key === todayKey;
    var items = [];

    var cls = classesOn(key);
    for (i = 0; i < cls.length; i++) {
      var s = hhmm(cls[i].start);
      var e = hhmm(cls[i].end);
      items.push({
        kind: 'class',
        sort: s.h * 60 + s.mi,
        time_label: timeLabel(s.h, s.mi) + ' – ' + timeLabel(e.h, e.mi)
          + (cls[i].location ? '  ·  ' + cls[i].location : ''),
        title: courseInfo(cls[i].course).short,
        course: '',
      });
    }

    for (i = 0; i < deadlines.length; i++) {
      if (deadlines[i].key !== key) continue;
      var d = deadlines[i];
      var past = key === todayKey && d.h * 60 + d.mi < now.h * 60 + now.mi;
      items.push({
        kind: 'due',
        sort: d.h * 60 + d.mi,
        time_label: timeLabel(d.h, d.mi) + (d.source === 'syllabus' ? '  ·  from syllabus' : ''),
        title: truncate(d.title, AGENDA_TITLE_MAX),
        course: courseInfo(d.course).short,
        past: past,
      });
    }

    items.sort(function (a, b) { return a.sort - b.sort; });

    // Every day gets exactly one row, clear or not. Collapsing empty days into
    // "MON 7 – TUE 8" runs saved a little height but cost the column its regular
    // rhythm, and the range label wrapped inside the day gutter.
    candidates.push({
      kind: 'day',
      label: DOW[weekdayOf(key)] + ' ' + dayNumOf(key),
      is_today: isToday,
      items: items,
    });
  }

  // Fit the candidates into the column. Classes get reserved space before any
  // row is placed: a deadline that doesn't fit is still visible in the right
  // rail, but a class appears nowhere else on the screen, so it must survive
  // even when it falls on the last day of a crowded week. classTail[i] is the
  // height of the class-only content from row i onwards.
  var classTail = [];
  classTail[candidates.length] = 0;
  for (var ti = candidates.length - 1; ti >= 0; ti--) {
    var tailRow = classesOnly(candidates[ti]);
    classTail[ti] = classTail[ti + 1] + (tailRow.items.length > 0 ? rowHeight(tailRow) : 0);
  }

  var totalPx = 0;
  for (i = 0; i < candidates.length; i++) totalPx += rowHeight(candidates[i]);
  // Only give up a row's worth of space to the "+N more" line if it'll be shown.
  var budget = totalPx > AGENDA_BUDGET_PX ? AGENDA_BUDGET_PX - ROW_EMPTY_PX : AGENDA_BUDGET_PX;

  var usedPx = 0;
  for (i = 0; i < candidates.length; i++) {
    var row = candidates[i];
    if (usedPx + rowHeight(row) + classTail[i + 1] <= budget) {
      usedPx += rowHeight(row);
      out.day_rows.push(row);
      continue;
    }
    var trimmed = classesOnly(row);
    if (trimmed.items.length > 0 && usedPx + rowHeight(trimmed) + classTail[i + 1] <= budget) {
      usedPx += rowHeight(trimmed);
      out.day_rows.push(trimmed);
      hiddenItems += row.items.length - trimmed.items.length;
      continue;
    }
    hiddenItems += row.items.length;
  }

  if (hiddenItems > 0) {
    out.day_rows.push({
      kind: 'more', is_today: false, items: [],
      label: '+' + hiddenItems + ' more',
      text: (hiddenItems === 1 ? 'one more deadline' : hiddenItems + ' more deadlines') + ' — see Due next',
    });
  }

  // ── Right rail: the deadline queue, deliberately running past the window ───
  var queuePx = 0;
  for (i = 0; i < upcoming.length && i < QUEUE_SIZE; i++) {
    var q = upcoming[i];
    var beyond = q.key > lastKey;
    var qTitle = truncate(q.title, QUEUE_TITLE_MAX);
    var qPx = QUEUE_ITEM_PX + (qTitle.length > QUEUE_WRAP_AT_CHARS ? QUEUE_WRAP_PX : 0);
    if (queuePx + qPx > QUEUE_BUDGET_PX) break;
    queuePx += qPx;
    out.queue.push({
      when_label: (q.key === todayKey ? 'Today' : titleCase(DOW[weekdayOf(q.key)]) + ' ' + dayNumOf(q.key))
        + ' · ' + timeLabel(q.h, q.mi),
      title: qTitle,
      course: courseInfo(q.course).short,
      is_today: q.key === todayKey,
      beyond_window: beyond,
    });
  }

  // ── Hero: the single most imminent deadline ───────────────────────────────
  if (upcoming.length > 0) {
    var n = upcoming[0];
    var whenWord;
    if (n.key === todayKey) whenWord = 'due today';
    else if (n.key === addDays(todayKey, 1)) whenWord = 'due tomorrow';
    else whenWord = 'due ' + titleCase(DOW[weekdayOf(n.key)]) + ' ' + monthOf(n.key) + ' ' + dayNumOf(n.key);
    out.next_up = {
      title: n.title,
      course: courseInfo(n.course).name,
      when_label: whenWord + ', ' + timeLabel(n.h, n.mi),
      countdown: countdownLabel(nowMs, etWallToEpoch(
        Number(n.key.split('-')[0]), Number(n.key.split('-')[1]), Number(n.key.split('-')[2]), n.h, n.mi
      )),
    };
  }

  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────────────────────

// Where the ICS link can be found on the Serverless `input`. TRMNL documents
// custom field values as arriving on `input` directly; the older sandbox handed
// them over under trmnl.plugin_settings. Check both rather than bet on one.
function icsUrlFrom(input) {
  if (!input) return null;
  var candidates = [
    input.blackboard_ics_url,
    input.trmnl && input.trmnl.plugin_settings && input.trmnl.plugin_settings.custom_fields_values
      && input.trmnl.plugin_settings.custom_fields_values.blackboard_ics_url,
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === 'string' && candidates[i].indexOf('http') === 0) return candidates[i];
  }
  return null;
}

// TRMNL Serverless entry point (Markup Editor → Serverless, Node runtime).
//
// The plugin fetches the calendar itself rather than using a Polling URL.
// TRMNL's polling layer is content-type driven: it fetched this feed fine but
// discarded the body, because `text/calendar` isn't among the types it parses,
// and the transform received a payload whose only key was `trmnl`. Fetching here
// sidesteps that entirely, and keeps the share link — a bearer token — inside
// TRMNL instead of a third-party proxy.
async function run(input) {
  var url = icsUrlFrom(input);
  if (!url) {
    return buildScreen(null, 'no share link configured — set blackboard_ics_url in plugin settings');
  }

  try {
    // The sandbox allows 5 seconds total; cap the fetch so a slow Blackboard
    // fails with a readable screen rather than an opaque timeout.
    var res = await fetch(url, {
      redirect: 'follow',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    if (!res.ok) return buildScreen(null, 'Blackboard returned HTTP ' + res.status);

    var text = await res.text();
    if (text.indexOf(ICS_MARKER) === -1) {
      // Most likely an SSO redirect to a login page, i.e. a dead share link.
      return buildScreen(null, 'response was not a calendar — ' + describeShape(text, 0));
    }
    return buildScreen(text, '');
  } catch (err) {
    return buildScreen(null, 'fetch failed: ' + (err && err.message ? err.message : String(err)));
  }
}

// Local harness entry point: the preview tool and tests supply the ICS directly,
// so nothing in the test suite touches the network.
function transform(input) {
  return buildScreen(findIcs(input, 0), describeShape(input, 0));
}
