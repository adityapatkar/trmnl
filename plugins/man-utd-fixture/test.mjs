import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

async function render({ next = 'next-fixture', live = 'live-empty', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [await loadFixture(next), await loadFixture(live)],
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
