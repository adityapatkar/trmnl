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
