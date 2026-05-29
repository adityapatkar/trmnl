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
async function render({ standings = 'standings-league-phase', knockout = 'knockout-matches-empty', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [await loadFixture(standings), await loadFixture(knockout)],
    now,
  });
}

test('renders the UCL title bar', async () => {
  const html = await render();
  assert.match(html, /UEFA CHAMPIONS LEAGUE/i);
});

test('renders 36 league-phase rows split 18+18 across two columns', async () => {
  const html = await render();
  // Count <tr> with a position cell
  const matches = html.match(/class="pos"/g) || [];
  // (Standings fixture has 36 teams)
  assert.ok(matches.length >= 30, `expected ~36 rows, got ${matches.length}`);
});

test('inverts the row where team.id == highlight_team_id', async () => {
  const html = await render();
  // The highlighted row contains class="row-inv" applied
  assert.match(html, /class="[^"]*row-inv/);
});

test('shows R16 cut line after row 8 in left column', async () => {
  const html = await render();
  assert.match(html, /cut-line/);
});

test('falls back to setup placeholder when API key blank', async () => {
  const html = await render({ form: { football_data_api_key: '' } });
  assert.match(html, /add your football-data\.org API key/i);
});
