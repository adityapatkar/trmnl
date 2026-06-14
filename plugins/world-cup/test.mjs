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
async function render({ standings = 'standings-groups', knockout = 'knockout-matches-empty', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [await loadFixture(standings), await loadFixture(knockout)],
    now,
  });
}

test('renders 2026 FIFA World Cup title with group-stage subtitle', async () => {
  const html = await render();
  assert.match(html, /2026 FIFA World Cup/i);
  assert.match(html, /Group stage/i);
});

test('renders all 12 group cards (A through L)', async () => {
  const html = await render();
  const groupHeaders = (html.match(/Group [A-L]/g) || []).length;
  // 12 distinct group cards. (Match in body, not counting CSS comment.)
  assert.ok(groupHeaders >= 12, `expected 12 group cards, got ${groupHeaders}`);
});

test('shows all 48 teams across the 12 groups', async () => {
  const html = await render();
  const positions = (html.match(/class="pos"/g) || []).length;
  assert.equal(positions, 48);
});

test('inverts the USA row (highlight_team_id default = 771)', async () => {
  const html = await render();
  // USA is in Group D — its row should have row-inv applied
  assert.match(html, /class="row-inv"[\s\S]*?USA/);
});

test('marks the top 2 teams of each group as qualifying (▸)', async () => {
  const html = await render();
  // The .qual class shows ▸ via ::before — verify the class is applied to ~24 rows
  // (top 2 in each of 12 groups, minus 1 for the highlighted team which gets row-inv instead).
  const qualRows = (html.match(/class="qual"/g) || []).length;
  assert.ok(qualRows >= 20, `expected ~24 qual rows, got ${qualRows}`);
});

test('stays in group-stage view when knockout matches are placeholders (TBD teams)', async () => {
  // Before the group stage ends, football-data.org returns 16 TIMED knockout
  // matches with null teams. We should still show the group grid in this case.
  const html = await render({ knockout: 'knockout-matches' });
  assert.match(html, /Group stage/i);
  assert.doesNotMatch(html, /Knockout phase/i);
});

test('switches to knockout bracket view when knockout matches have real teams', async () => {
  const html = await render({ knockout: 'knockout-matches-active' });
  assert.match(html, /Knockout phase/i);
  assert.match(html, /ROUND OF 16/i);
  assert.match(html, /QUARTER-?FINALS/i);
});

test('renders ties with real TLAs in knockout view (not TBD)', async () => {
  const html = await render({ knockout: 'knockout-matches-active' });
  assert.match(html, /class="tie/);
  // The active fixture has USA, MEX, ARG, BRA etc. in R16
  assert.match(html, /\bUSA\b/);
  assert.match(html, /\bMEX\b/);
});

test('falls back to setup placeholder when API key is auth-broken', async () => {
  // The default form-fields has a placeholder API key. For test, simulate a real
  // auth failure by passing a fixture-style bad-token response shape.
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    new URL('./samples/bad-token.json', import.meta.url),
    JSON.stringify({ message: 'Your API token is invalid.', errorCode: 400 }),
  );
  const html = await render({ standings: 'bad-token' });
  assert.match(html, /Couldn't load World Cup data/i);
  assert.match(html, /API token is invalid/i);
});

test('shows "Updated" timestamp slot in the title bar', async () => {
  const html = await render();
  // updated_at would be set by the transform; here we just verify the markup
  // has the "Updated" prefix and falls back to {{ now | date }}
  assert.match(html, /Updated\s+\d{1,2}:\d{2}/);
});
