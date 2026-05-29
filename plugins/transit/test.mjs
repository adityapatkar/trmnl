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

async function renderAll({ predictions = 'wmata-predictions', buses = 'fairfax-predictions', incidents = 'wmata-incidents-empty', bulletins = 'fairfax-bulletins-empty', form, now } = {}) {
  return renderTemplate(await loadTemplate(), {
    formFields: { ...(await loadForm()), ...form },
    idxResponses: [
      await loadFixture(predictions),
      await loadFixture(buses),
      await loadFixture(incidents),
      await loadFixture(bulletins),
    ],
    now,
  });
}

test('renders the title bar with station name and refresh interval', async () => {
  const html = await renderAll();
  assert.match(html, /TYSONS/i);
  assert.match(html, /METRO/i);
  assert.match(html, /refreshes/i);
});

test('shows a setup placeholder when WMATA API key is blank', async () => {
  const html = await renderAll({ form: { wmata_api_key: '' } });
  assert.match(html, /add your WMATA API key/i);
});

test('renders LN / CAR / DEST / MIN header row for metro', async () => {
  const html = await renderAll();
  assert.match(html, /LN[\s\S]*CAR[\s\S]*DEST[\s\S]*MIN/);
});

test('renders direction dividers derived from Group + destinations', async () => {
  const html = await renderAll();
  // From the captured fixture, expect at least one direction label
  assert.match(html, /(Largo|Ashburn|Wiehle|Downtown|Mt Vernon|New Carrollton|NewCrlton)/i);
});

test('renders ARR / BRD / numeric minutes correctly', async () => {
  const html = await renderAll();
  // Should contain at least one of these markers from the fixture
  assert.ok(/ARR|BRD|\b\d{1,2}\b/.test(html));
});

test('renders empty-trains placeholder when no predictions', async () => {
  const html = await renderAll({ predictions: 'wmata-predictions-empty' });
  assert.match(html, /no predictions/i);
});

test('renders the line code badge (e.g., SV) for each train', async () => {
  const html = await renderAll();
  // The captured fixture is at Tysons (Silver Line) so SV should appear
  assert.match(html, /\bSV\b/);
});

test('renders bus section header (Connector — stops)', async () => {
  const html = await renderAll();
  assert.match(html, /Connector/i);
});

test('renders bus predictions grouped by stop name', async () => {
  const html = await renderAll();
  // Each route renders the route number in a badge
  const fixture = await loadFixture('fairfax-predictions');
  const firstRoute = fixture['bustime-response'].prd[0].rt;
  assert.match(html, new RegExp(`\\b${firstRoute}\\b`));
});

test('renders DUE for buses with prdctdn=DUE', async () => {
  const html = await renderAll();
  const fixture = await loadFixture('fairfax-predictions');
  const hasDue = fixture['bustime-response'].prd.some((p) => p.prdctdn === 'DUE');
  if (hasDue) assert.match(html, /\bDUE\b/);
});

test('renders Fairfax error message when bustime-response.error is set', async () => {
  const html = await renderAll({ buses: 'fairfax-predictions-error' });
  assert.match(html, /No service scheduled/i);
});
