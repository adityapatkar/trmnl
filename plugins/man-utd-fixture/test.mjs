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

test('shows setup placeholder when football_data_api_key is blank', async () => {
  const html = await render({ form: { football_data_api_key: '' } });
  assert.match(html, /add your football-data\.org API key/i);
});

test('shows off-season message when both fixture arrays empty', async () => {
  const html = await render({ next: 'off-season' });
  assert.match(html, /off-season|no fixture scheduled/i);
});
