import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderTemplate } from '../../tools/render-lib.mjs';

const ICS = await readFile(new URL('./samples/learn.ics', import.meta.url), 'utf8');
const TEMPLATE = await readFile(new URL('./markup.liquid', import.meta.url), 'utf8');
const FORM = JSON.parse(await readFile(new URL('./form-fields.json', import.meta.url), 'utf8'));
const transformSrc = await readFile(new URL('./serverless.js', import.meta.url), 'utf8');

// The transform reads the wall clock, so every test pins it. A Date subclass is
// the least invasive way to do that inside the sandbox: `new Date()` and
// `Date.now()` are frozen, while `new Date(x)` still parses normally.
function runTransform(input, isoNow) {
  const fixed = new Date(isoNow);
  const ClockDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed.getTime(); }
  };
  const ctx = vm.createContext({ Intl, Date: ClockDate, Math, Array, Object, Number, String, JSON, isNaN, console });
  vm.runInContext(transformSrc, ctx);
  return ctx.transform(input);
}

// Builds a sandbox with a stubbed fetch, to exercise run() without a network.
function withFetch(fetchImpl, isoNow = MON_SEP_7) {
  const fixed = new Date(isoNow);
  const ClockDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed.getTime(); }
  };
  const ctx = vm.createContext({
    Intl, Date: ClockDate, Math, Array, Object, Number, String, JSON, isNaN, console,
    fetch: fetchImpl, AbortSignal,
  });
  vm.runInContext(transformSrc, ctx);
  return ctx;
}

const okFetch = (body) => async () => ({ ok: true, status: 200, text: async () => body });

function at(isoNow, ics = ICS) {
  return runTransform({ IDX_0: ics }, isoNow);
}

async function render(isoNow, ics = ICS) {
  const { ...vars } = at(isoNow, ics);
  return renderTemplate(TEMPLATE, { formFields: { ...FORM, ...vars }, idxResponses: [] });
}

// Sun 2026-09-06 08:00 ET. 12:00Z is 08:00 EDT.
const SUN_SEP_6 = '2026-09-06T12:00:00Z';
const MON_SEP_7 = '2026-09-07T12:14:00Z';

// ── Parsing ──────────────────────────────────────────────────────────────────

test('parses the real GWU feed', () => {
  const out = at(MON_SEP_7);
  assert.equal(out.ok, true);
});

test('rejects a response that is not a calendar', () => {
  const out = at(MON_SEP_7, '<html>login page</html>');
  assert.equal(out.ok, false);
  assert.equal(out.day_rows.length, 0);
});

// TRMNL's docs are inconsistent about where a non-JSON polling body lands, so
// the transform hunts for the calendar rather than assuming one shape.
test('finds the calendar wherever the polling payload puts it', () => {
  const shapes = {
    'bare IDX_0 string': { IDX_0: ICS },
    'IDX_0.data': { IDX_0: { data: ICS } },
    'top-level data node': { data: ICS },
    'pre-split into lines': { IDX_0: ICS.split('\n') },
    'nested wrapper': { IDX_0: { body: { content: ICS } } },
  };
  for (const [name, input] of Object.entries(shapes)) {
    const out = runTransform(input, MON_SEP_7);
    assert.equal(out.ok, true, `did not find the calendar in: ${name}`);
    assert.ok(out.queue.length > 0, `no deadlines parsed from: ${name}`);
  }
});

test('reports the payload shape when no calendar is found', () => {
  const out = runTransform({ IDX_0: '<html><body>Sign in</body></html>' }, MON_SEP_7);
  assert.equal(out.ok, false);
  assert.match(out.debug_shape, /IDX_0/);
  assert.match(out.debug_shape, /string\(33\)/);
  assert.match(out.debug_shape, /Sign in/);
});

test('the shape report stays short and does not leak the whole body', () => {
  const out = runTransform({ IDX_0: 'x'.repeat(50000) }, MON_SEP_7);
  assert.equal(out.ok, false);
  assert.ok(out.debug_shape.length < 200, `shape report too long: ${out.debug_shape.length}`);
});

test('survives a null polling response', () => {
  const out = runTransform({ IDX_0: null }, MON_SEP_7);
  assert.equal(out.ok, false);
});

test('unfolds RFC 5545 continuation lines', () => {
  const folded = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/New_York:20260909T120000',
    'SUMMARY:A very long assignment title that the',
    '  server folded across two lines',
    'UID:_blackboard.platform.gradebook2.GradableItem-_3179999_1',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const out = at('2026-09-07T12:00:00Z', folded);
  assert.match(out.next_up.title, /folded across two lines/);
});

test('ignores the DTSTART and RRULE lines inside VTIMEZONE', () => {
  // The feed's only RRULEs are DST rules; a naive parser would emit 1883 events.
  const out = at(MON_SEP_7);
  const stale = out.queue.filter((q) => /18\d\d|19\d\d/.test(q.when_label));
  assert.equal(stale.length, 0);
});

// ── Course attribution ───────────────────────────────────────────────────────

test('every upcoming deadline is attributed to a course', () => {
  for (const iso of [SUN_SEP_6, MON_SEP_7, '2026-10-01T12:00:00Z', '2026-11-10T12:00:00Z']) {
    assert.equal(at(iso).unassigned_count, 0, `unattributed items at ${iso}`);
  }
});

test('no queue row renders a placeholder course', () => {
  const out = at(MON_SEP_7);
  assert.ok(out.queue.length > 0);
  for (const q of out.queue) assert.notEqual(q.course, '—');
});

test('attributes by UID block, cross-checked against the syllabus', () => {
  // Rail titles are truncated at a word boundary, so match on the stem.
  const out = at(SUN_SEP_6);
  const courseOf = (stem) => (out.queue.find((q) => q.title.startsWith(stem)) || {}).course;
  assert.equal(courseOf('Session 2 Self-Check'), 'MGT 0000');
  assert.equal(courseOf('Class 3 Preparation Activity'), 'Team Dynamics');
  assert.equal(courseOf('Session 3 Assignment: Article Review'), 'Analytics');
});

test('truncated titles break at a word, not mid-word', () => {
  const out = at(SUN_SEP_6);
  for (const q of out.queue) {
    if (!q.title.endsWith('…')) continue;
    const lastWord = q.title.slice(0, -1).trim().split(' ').pop();
    assert.ok(lastWord.length > 2, `truncated mid-word: ${q.title}`);
  }
});

test('falls back to title rules when a UID lands outside every block', () => {
  const odd = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'DTSTART;TZID=America/New_York:20260910T235900',
    'SUMMARY:Session 9 Assignment: Article Review 9',
    'UID:_blackboard.platform.gradebook2.GradableItem-_9999999_1',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const out = at('2026-09-07T12:00:00Z', odd);
  assert.equal(out.unassigned_count, 0);
  assert.equal(out.queue[0].course, 'Analytics');
});

// ── Schedule merging ─────────────────────────────────────────────────────────

test('places the two weekly classes on Wednesday and Thursday', () => {
  const out = at(MON_SEP_7);
  const wed = out.day_rows.find((r) => r.label === 'WED 9');
  const thu = out.day_rows.find((r) => r.label === 'THU 10');
  const wedClass = wed.items.find((i) => i.kind === 'class');
  const thuClass = thu.items.find((i) => i.kind === 'class');
  assert.equal(wedClass.title, 'Team Dynamics');
  assert.match(wedClass.time_label, /4:30 PM – 7:00 PM.*Hall 652/);
  assert.equal(thuClass.title, 'Analytics');
  assert.match(thuClass.time_label, /7:00 PM – 8:00 PM.*Online/);
});

test('the async course appears only on its five live-session dates', () => {
  // Week containing Sun 2026-11-15, a scheduled live session.
  const withSession = at('2026-11-09T13:00:00Z');
  const sessions = withSession.day_rows.flatMap((r) => r.items).filter((i) => i.kind === 'class' && i.title === 'MGT 0000');
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].time_label, /7:00 PM – 9:00 PM/);

  // A week with no live session has none.
  const without = at('2026-10-19T12:00:00Z');
  assert.equal(without.day_rows.flatMap((r) => r.items).filter((i) => i.title === 'MGT 0000' && i.kind === 'class').length, 0);
});

test('suppresses weekly classes during Thanksgiving break but keeps the live session', () => {
  // Window covering Mon 11/23 – Sun 11/29.
  const out = at('2026-11-23T13:00:00Z');
  const classes = out.day_rows.flatMap((r) => r.items).filter((i) => i.kind === 'class');
  assert.equal(classes.filter((c) => c.title === 'Team Dynamics').length, 0);
  assert.equal(classes.filter((c) => c.title === 'Analytics').length, 0);
  assert.equal(classes.filter((c) => c.title === 'MGT 0000').length, 1, 'Sun 11/29 live session must survive the break');
});

test('weekly classes stop after the semester ends', () => {
  const out = at('2026-12-07T13:00:00Z');
  const weekly = out.day_rows.flatMap((r) => r.items)
    .filter((i) => i.kind === 'class' && i.title !== 'MGT 0000');
  assert.equal(weekly.length, 0);
});

test('surfaces the capstone, which Blackboard never publishes', () => {
  // Blackboard's feed ends at Dec 8; the capstone is Dec 13, syllabus-only.
  assert.equal(ICS.includes('20261213'), false, 'fixture must not contain the capstone');
  const out = at('2026-12-09T13:00:00Z');
  const capstone = out.queue.find((q) => /Capstone/.test(q.title));
  assert.ok(capstone, 'capstone missing from the queue');
  assert.equal(capstone.course, 'MGT 0000');
  assert.match(capstone.when_label, /6:00 PM/);
});

// ── Window and ordering ──────────────────────────────────────────────────────

test('the window is a rolling 7 days starting today', () => {
  const out = at(MON_SEP_7);
  assert.equal(out.day_rows[0].is_today, true);
  assert.match(out.day_rows[0].label, /MON 7/);
  const labels = out.day_rows.map((r) => r.label).join(' ');
  assert.match(labels, /SUN 13/, 'day 7 must be present');
  assert.doesNotMatch(labels, /SUN 6|MON 14/, 'must not reach outside the window');
});

test('today keeps its own row even when nothing is scheduled', () => {
  const out = at(MON_SEP_7);
  assert.equal(out.day_rows[0].items.length, 0);
  assert.equal(out.day_rows[0].kind, 'day');
});

test('every day in the window gets exactly one row', () => {
  // Clear days used to merge into "MON 7 – TUE 8" runs. That saved height but
  // broke the column's rhythm and wrapped inside the day gutter, so each day now
  // gets its own row and the grid stays regular.
  const out = at(MON_SEP_7);
  const labels = out.day_rows.filter((r) => r.kind !== 'more').map((r) => r.label).join(' | ');
  assert.equal(labels, 'MON 7 | TUE 8 | WED 9 | THU 10 | FRI 11 | SAT 12 | SUN 13');
});

test('clear days are rendered as rows with no items, not dropped', () => {
  const out = at(MON_SEP_7);
  const clear = out.day_rows.filter((r) => r.kind === 'day' && r.items.length === 0);
  assert.equal(clear.length, 4, 'Mon, Tue, Fri and Sat are clear that week');
});

test('a deadline drops off the queue once its time has passed', () => {
  const before = at('2026-09-06T23:00:00Z'); //  7:00 PM ET, before the 11:59 PM due time
  const after = at('2026-09-07T04:30:00Z'); // 12:30 AM ET on Sep 7, after it
  assert.equal(before.queue[0].title, 'Session 2 Self-Check');
  assert.notEqual(after.queue[0].title, 'Session 2 Self-Check');
});

test('the queue deliberately runs past the 7-day window', () => {
  const out = at(MON_SEP_7);
  assert.ok(out.queue.some((q) => q.beyond_window), 'nothing beyond the window is listed');
});

// ── Time handling ────────────────────────────────────────────────────────────

test('renders Eastern time, never a bare 24-hour clock', () => {
  const out = at(MON_SEP_7);
  assert.match(out.updated_at, /^\d{1,2}:\d{2} [AP]M ET$/);
  for (const q of out.queue) assert.match(q.when_label, /\d{1,2}:\d{2} [AP]M$/);
});

test('countdown is coarse, matching the hourly poll', () => {
  const out = at(MON_SEP_7);
  assert.match(out.next_up.countdown, /^(now|< 1h|\d+h|\d+d( \d+h)?)$/);
});

test('countdown stays correct across the November DST change', () => {
  // 2026-11-01 02:00 ET is the fall-back. Measuring from Oct 31 to Nov 2 crosses
  // it, so a naive wall-clock subtraction would be an hour short.
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT',
    'DTSTART;TZID=America/New_York:20261102T120000',
    'SUMMARY:After the clocks change',
    'UID:_blackboard.platform.gradebook2.GradableItem-_3179500_1',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  // Sat 2026-10-31 12:00 EDT === 16:00Z. To Mon 12:00 EST === 17:00Z is 49h.
  const out = at('2026-10-31T16:00:00Z', ics);
  assert.equal(out.next_up.countdown, '2d 1h');
});

test('midnight does not roll the date forward', () => {
  // 04:10Z is 00:10 EDT — an hour12:false formatter can report hour "24" here.
  const out = at('2026-09-07T04:10:00Z');
  assert.match(out.today_label, /MON SEP 7/);
  assert.match(out.updated_at, /^12:10 AM ET$/);
});

// ── Density ──────────────────────────────────────────────────────────────────

test('a class is never hidden by the overflow cap', () => {
  // Sun 2026-11-15 carries the async course's live session plus two deadlines, and the
  // week's rows land right on the budget. The deadlines may be shed — they are
  // still in the right rail — but the class must survive.
  const out = at('2026-11-09T13:00:00Z');
  const classes = out.day_rows.flatMap((r) => r.items).filter((i) => i.kind === 'class');
  assert.equal(classes.filter((c) => c.title === 'MGT 0000').length, 1);
});

test('a dense week collapses the tail instead of overflowing', () => {
  const events = [];
  for (let d = 7; d <= 13; d++) {
    for (let n = 0; n < 4; n++) {
      events.push(
        'BEGIN:VEVENT',
        `DTSTART;TZID=America/New_York:202609${d}T1${n}0000`,
        `SUMMARY:Team Project deliverable ${d}-${n} with a fairly long descriptive title`,
        `UID:_blackboard.platform.gradebook2.GradableItem-_31795${d}${n}_1`,
        'END:VEVENT',
      );
    }
  }
  const ics = ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');
  const out = at('2026-09-07T12:00:00Z', ics);
  const more = out.day_rows.find((r) => r.kind === 'more');
  assert.ok(more, 'dense week produced no overflow row');
  assert.match(more.label, /^\+\d+ more$/);
});

test('long titles are truncated rather than left to overflow', () => {
  const out = at(MON_SEP_7);
  const longest = out.queue.map((q) => q.title.length).sort((a, b) => b - a)[0];
  assert.ok(longest <= 46, `queue title too long: ${longest}`);
});

// ── Rendering ────────────────────────────────────────────────────────────────

test('renders the agenda, the queue and the hero', async () => {
  const html = await render(MON_SEP_7);
  assert.match(html, /Class 3 Preparation Activity/);
  assert.match(html, /Team Dynamics/);
  assert.match(html, /Hall 652/);
  assert.match(html, /Due next/i);
  assert.match(html, /Next up/i);
});

test('every rendered assignment carries a visible course label', async () => {
  const html = await render(MON_SEP_7);
  const chips = [...html.matchAll(/<span class="chip">([^<]+)<\/span>/g)].map((m) => m[1].trim());
  const dueRows = [...html.matchAll(/<div class="item due">/g)].length;
  assert.equal(chips.length, dueRows, 'a due item rendered without a course chip');
  for (const c of chips) assert.ok(['Team Dynamics', 'Analytics', 'MGT 0000'].includes(c), c);
});

test('class rows render no course chip', async () => {
  // Liquid treats "" as truthy — only nil and false are falsy — so `{% if it.course %}`
  // rendered an empty chip pill beside every class. Class rows are already named
  // by their course, so the chip must be absent, not blank.
  const html = await render(MON_SEP_7);
  assert.doesNotMatch(html, /<span class="chip">\s*<\/span>/, 'an empty chip was rendered');
  const classRows = html.split('<div class="item class').slice(1);
  assert.ok(classRows.length > 0, 'no class rows in this fixture week');
  for (const row of classRows) {
    const upToNextItem = row.split('<div class="item')[0];
    assert.doesNotMatch(upToNextItem, /class="chip"/, 'a class row carried a chip');
  }
});

test('the time and title of an item are separate block lines', async () => {
  // They were inline siblings once, and collided on the device.
  const html = await render(MON_SEP_7);
  assert.match(html, /class="item-body"/);
});

test('shows a setup message when the feed cannot be read', async () => {
  const html = await render(MON_SEP_7, 'not a calendar');
  assert.match(html, /Couldn't read the Blackboard calendar feed/i);
  assert.match(html, /Share Calendar/);
  assert.match(html, /Received:/, 'the failure screen must name what arrived');
});

test('renders a clear week without an empty hero', async () => {
  const html = await render('2027-06-01T12:00:00Z');
  assert.match(html, /nothing scheduled/i);
  assert.doesNotMatch(html, /Next up/i);
  assert.match(html, /Nothing due/i);
});


// ── Serverless entry point ───────────────────────────────────────────────────

test('run() fetches the share link and builds the screen', async () => {
  let requested = null;
  const ctx = withFetch(async (url) => {
    requested = url;
    return { ok: true, status: 200, text: async () => ICS };
  });
  const out = await ctx.run({ blackboard_ics_url: 'https://bb.example/learn.ics' });
  assert.equal(requested, 'https://bb.example/learn.ics');
  assert.equal(out.ok, true);
  assert.ok(out.queue.length > 0);
});

test('run() finds the share link under trmnl.plugin_settings too', async () => {
  const ctx = withFetch(okFetch(ICS));
  const out = await ctx.run({
    trmnl: { plugin_settings: { custom_fields_values: { blackboard_ics_url: 'https://bb.example/learn.ics' } } },
  });
  assert.equal(out.ok, true);
});

test('run() explains an unconfigured share link', async () => {
  const ctx = withFetch(okFetch(ICS));
  const out = await ctx.run({ trmnl: {} });
  assert.equal(out.ok, false);
  assert.match(out.debug_shape, /no share link configured/);
});

test('run() reports an HTTP error rather than rendering an empty week', async () => {
  const ctx = withFetch(async () => ({ ok: false, status: 401, text: async () => '' }));
  const out = await ctx.run({ blackboard_ics_url: 'https://bb.example/learn.ics' });
  assert.equal(out.ok, false);
  assert.match(out.debug_shape, /HTTP 401/);
});

test('run() recognises an SSO login page as a dead share link', async () => {
  const ctx = withFetch(okFetch('<html><body>Sign in to GW</body></html>'));
  const out = await ctx.run({ blackboard_ics_url: 'https://bb.example/learn.ics' });
  assert.equal(out.ok, false);
  assert.match(out.debug_shape, /not a calendar/);
});

test('run() survives a thrown fetch', async () => {
  const ctx = withFetch(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
  const out = await ctx.run({ blackboard_ics_url: 'https://bb.example/learn.ics' });
  assert.equal(out.ok, false);
  assert.match(out.debug_shape, /fetch failed: getaddrinfo ENOTFOUND/);
});
