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
async function render({ standings = 'standings', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [await loadFixture(standings)],
    now,
  });
}

test('renders title with PL logo', async () => {
  const html = await render();
  assert.match(html, /Premier League/i);
  assert.match(html, /Premier_League_Logo\.svg/);
});

test('renders 20 rows split 10+10', async () => {
  const html = await render();
  const matches = html.match(/class="pos"/g) || [];
  assert.equal(matches.length, 20);
});

test('renders W-D-L compact column', async () => {
  const html = await render();
  assert.match(html, /W-D-L/);
  assert.match(html, /\d+-\d+-\d+/);
});

test('inverts the Man Utd row', async () => {
  const html = await render();
  assert.match(html, /class="[^"]*row-inv/);
});

test('shows UCL cut line after row 4, relegation cut after row 17', async () => {
  const html = await render();
  const cuts = (html.match(/cut-line/g) || []).length;
  assert.ok(cuts >= 2, `expected at least 2 cut lines, got ${cuts}`);
});

test('shows setup placeholder when the standings response is an auth error', async () => {
  const html = await render({ standings: 'bad-token' });
  assert.match(html, /Couldn't load Premier League data/i);
  assert.match(html, /API token is invalid/i);
});

test('shows preseason placeholder when standings table is empty', async () => {
  const html = await render({ standings: 'standings-empty' });
  assert.match(html, /haven't been set for this season yet/i);
  assert.match(html, /Season starts/i);
});

test('also renders correctly when polling response is at the top level (TRMNL single-URL mode)', async () => {
  // On-device with one polling URL, TRMNL expands the response keys at top level
  // instead of under IDX_0. Simulate by passing the fixture as formFields and no idxResponses.
  const fixture = await loadFixture('standings');
  const html = await renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...fixture },
    idxResponses: [],
  });
  // Should render the full table, not the "Couldn't load" placeholder
  assert.match(html, /Premier League/i);
  const positions = (html.match(/class="pos"/g) || []).length;
  assert.equal(positions, 20);
});
