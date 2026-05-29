import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const engine = new Liquid({
  jsTruthy: true,
  root: [REPO_ROOT],
});

// Custom tag: include raw file contents (no Liquid parsing of the included content).
// Used to inline plugins/_shared/styles.css inside <style> blocks during local rendering.
// TRMNL admin does NOT support this — the CSS must be inlined manually before upload.
// Usage: {% include_raw "plugins/_shared/styles.css" %}
engine.registerTag('include_raw', {
  parse(tagToken) {
    this.filePath = tagToken.args.replace(/^["']|["']$/g, '');
  },
  async render() {
    return readFile(resolve(REPO_ROOT, this.filePath), 'utf8');
  },
});

export async function renderTemplate(template, { formFields = {}, idxResponses = [], now = new Date() } = {}) {
  const context = { ...formFields, now };
  for (let i = 0; i < idxResponses.length; i++) {
    context[`IDX_${i}`] = idxResponses[i];
  }
  return engine.parseAndRender(template, context);
}
