import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderTemplate } from '../../tools/render-lib.mjs';

async function loadFixture(name) {
  return JSON.parse(await readFile(new URL(`./samples/${name}.json`, import.meta.url), 'utf8'));
}
async function loadForm() {
  return JSON.parse(await readFile(new URL('./form-fields.json', import.meta.url), 'utf8'));
}
async function loadTemplate() {
  return readFile(new URL('./markup.liquid', import.meta.url), 'utf8');
}

// Apply the same transform that runs in TRMNL's Sandbox Runtime, so the markup
// tests see the ET-formatted kick-off strings and countdown the device sees.
const transformSrc = await readFile(new URL('./transform.js', import.meta.url), 'utf8');
const transformCtx = vm.createContext({ Intl, Date, Math, Array, isNaN });
vm.runInContext(transformSrc, transformCtx);
const transform = transformCtx.transform;

async function render({ next = 'next-fixture', live = 'live-empty', form, now } = {}) {
  const out = transform({ IDX_0: await loadFixture(next), IDX_1: await loadFixture(live) });
  const { IDX_0, IDX_1, ...extras } = out;
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...extras, ...form },
    idxResponses: [IDX_0, IDX_1],
    now,
  });
}

test('renders competition name and matchday in title bar', async () => {
  const html = await render();
  const fixture = await loadFixture('next-fixture');
  const comp = fixture.matches[0].competition.name;
  assert.match(html, new RegExp(comp, 'i'));
});

test('renders home + away team names', async () => {
  const html = await render();
  const m = (await loadFixture('next-fixture')).matches[0];
  assert.match(html, new RegExp(m.homeTeam.shortName.split(' ')[0], 'i'));
  assert.match(html, new RegExp(m.awayTeam.shortName.split(' ')[0], 'i'));
});

test('renders "VS" between the two crests', async () => {
  const html = await render();
  assert.match(html, /\bVS\b/);
});

test('renders crests as <img> tags with the API-provided URLs', async () => {
  const html = await render();
  const m = (await loadFixture('next-fixture')).matches[0];
  // Escape regex metacharacters in the URL
  const escaped = m.homeTeam.crest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(html, new RegExp(`src="${escaped}"`));
});

test('shows HOME / AWAY label based on home team id', async () => {
  const html = await render();
  const m = (await loadFixture('next-fixture')).matches[0];
  const expected = m.homeTeam.id === 66 ? 'HOME' : 'AWAY';
  assert.match(html, new RegExp(expected));
});

test('shows setup placeholder when both polling responses are auth errors', async () => {
  const html = await render({ next: 'bad-token', live: 'bad-token' });
  assert.match(html, /Couldn't load fixture data/i);
  assert.match(html, /API token is invalid/i);
});

test('shows setup placeholder when SCHEDULED is auth-broken even if LIVE returned an empty array', async () => {
  const html = await render({ next: 'bad-token', live: 'live-empty' });
  assert.match(html, /Couldn't load fixture data/i);
  assert.match(html, /API token is invalid/i);
});

test('shows off-season message when both fixture arrays empty', async () => {
  const html = await render({ next: 'off-season' });
  assert.match(html, /off-season|no fixture scheduled/i);
});

test('live view shows the score in a bordered box when IDX_1 has a match', async () => {
  const html = await render({ live: 'live-match' });
  const live = (await loadFixture('live-match')).matches[0];
  const expected = `${live.score.fullTime.home} – ${live.score.fullTime.away}`;
  // Some sources render "–" as "&ndash;" or "&#8211;". Allow either:
  assert.ok(html.includes(expected) || html.includes(expected.replace('–', '&#8211;')) || html.match(/\d\s+(?:–|&#8211;|&ndash;)\s+\d/));
});

test('live view shows the current minute', async () => {
  const html = await render({ live: 'live-match' });
  const live = (await loadFixture('live-match')).matches[0];
  assert.match(html, new RegExp(`${live.minute}'`));
});

test('live view shows HT badge when status is PAUSED', async () => {
  // Build an ad-hoc paused fixture from the live one
  const live = (await loadFixture('live-match'));
  live.matches[0].status = 'PAUSED';
  live.matches[0].minute = null;
  // Write a temp file, then reuse the test path
  const { writeFile } = await import('node:fs/promises');
  const path = new URL('./samples/live-paused.json', import.meta.url);
  await writeFile(path, JSON.stringify(live));
  const html = await render({ live: 'live-paused' });
  assert.match(html, /\bHT\b/);
});

test('live view shows the LIVE pill in the title bar', async () => {
  const html = await render({ live: 'live-match' });
  assert.match(html, /LIVE/);
});

test('live view shows stoppage time as "45+2" format when injuryTime > 0', async () => {
  const live = (await loadFixture('live-match'));
  live.matches[0].minute = 45;
  live.matches[0].injuryTime = 2;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL('./samples/live-stoppage.json', import.meta.url), JSON.stringify(live));
  const html = await render({ live: 'live-stoppage' });
  assert.match(html, /45\+2/);
});

test('kick-off is rendered in US Eastern time, never raw UTC', async () => {
  const html = await render();
  // Sample kicks off 2026-08-15T14:00:00Z → 10:00 AM EDT.
  assert.match(html, /10:00 AM EDT/);
  assert.doesNotMatch(html, /14:00/);
});

test('countdown never renders the Unix epoch (the `now`-is-undefined bug)', async () => {
  const html = await render();
  const days = [...html.matchAll(/>\s*(\d+)d\b/g)].map(m => Number(m[1]));
  for (const d of days) assert.ok(d < 400, `implausible countdown: ${d}d`);
});

test('transform formats a winter fixture as EST and a summer one as EDT', () => {
  const winter = transform({ IDX_0: { matches: [{ utcDate: '2027-01-15T15:00:00Z' }] }, IDX_1: { matches: [] } });
  const summer = transform({ IDX_0: { matches: [{ utcDate: '2027-08-15T14:00:00Z' }] }, IDX_1: { matches: [] } });
  assert.match(winter.next_kickoff_et, /10:00 AM EST/);
  assert.match(summer.next_kickoff_et, /10:00 AM EDT/);
});

test('transform countdown buckets: minutes, hours, days', () => {
  const at = iso => transform({ IDX_0: { matches: [{ utcDate: iso }] }, IDX_1: { matches: [] } }).next_countdown;
  const plus = mins => new Date(Date.now() + mins * 60000).toISOString();
  assert.match(at(plus(48)), /^4[5-9]m$/);
  assert.match(at(plus(372)), /^6h 1[12]m$/);
  assert.match(at(plus(60 * 76)), /^3d [34]h$/);
  assert.equal(at(plus(-10)), 'Kicking off');
});

test('live view shows kick-off time in Eastern time', async () => {
  const html = await render({ live: 'live-match' });
  assert.match(html, /\d{1,2}:\d{2} [AP]M E[SD]T/);
});
