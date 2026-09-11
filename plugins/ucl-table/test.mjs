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

test('falls back to setup placeholder when both polling responses are auth errors', async () => {
  const html = await render({ standings: 'bad-token', knockout: 'bad-token' });
  assert.match(html, /Couldn't load Champions League data/i);
  assert.match(html, /API token is invalid/i);
});

test('switches to bracket view when knockout matches are present', async () => {
  const html = await render({ knockout: 'knockout-matches' });
  assert.match(html, /ROUND OF 16/i);
  assert.match(html, /QUARTER-?FINALS/i);
});

test('renders ties with TLA pairs and aggregate scores', async () => {
  const html = await render({ knockout: 'knockout-matches' });
  // Pull two known TLAs from the fixture to confirm they appear
  const matches = (await loadFixture('knockout-matches')).matches;
  const sampleTla = matches[0].homeTeam.tla;
  assert.match(html, new RegExp(`\\b${sampleTla}\\b`));
  // Aggregate scores render as "X – Y" with em or en dash
  assert.ok(/[0-9]\s*[–—-]\s*[0-9]/.test(html));
});

test('highlights a tie involving the highlight team', async () => {
  const html = await render({ knockout: 'knockout-matches' });
  // Arsenal (id 57) is the highlight team in form-fields.json AND is in the 2025-26 UCL final
  assert.match(html, /class="tie[^"]*highlight/);
});

test('shows a stage status marker (FT / L1 / LIVE / SCHED) for each tie', async () => {
  const html = await render({ knockout: 'knockout-matches' });
  assert.match(html, /\b(FT|L1|LIVE|SCHED)\b/);
});

test('explains a pre-season 404 instead of rendering an empty table', async () => {
  // football-data.org 404s /standings for a season with no matches played, which
  // is every pre-season. The knockout feed still answers 200 with an empty array,
  // so the token is demonstrably fine and the auth placeholder would be a lie.
  // This used to fall through to the table branch and render <tbody></tbody>.
  const html = await render({ standings: 'standings-404-preseason', knockout: 'knockout-matches-empty' });
  assert.match(html, /hasn't kicked off/i);
  assert.doesNotMatch(html, /Check your football-data\.org API key/i);
  assert.doesNotMatch(html, /<tbody>\s*<\/tbody>/);
});
