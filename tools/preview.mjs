#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderTemplate } from './render-lib.mjs';

const program = new Command();
program
  .requiredOption('--template <path>', 'Liquid template file')
  .option('--form-fields <path>', 'JSON object of form field values', null)
  .option('--idx-0 <path>', 'IDX_0 response JSON', null)
  .option('--idx-1 <path>', 'IDX_1 response JSON', null)
  .option('--idx-2 <path>', 'IDX_2 response JSON', null)
  .option('--idx-3 <path>', 'IDX_3 response JSON', null)
  .option('--idx-4 <path>', 'IDX_4 response JSON', null)
  .option('--idx-5 <path>', 'IDX_5 response JSON', null)
  .option('--now <iso>', 'fixed timestamp for "now"', null)
  .option('--transform <path>', 'TRMNL Sandbox Runtime transform.js to apply to the IDX_n responses', null)
  .requiredOption('--out <path>', 'output HTML file');

program.parse(process.argv);
const opts = program.opts();

// A polling response is JSON for most plugins, but TRMNL also accepts plaintext
// (blackboard-week polls an .ics feed). Fixtures keep their natural extension:
// .json is parsed, anything else is handed to the template as a raw string.
async function readResponse(p) {
  if (!p) return null;
  const body = await readFile(p, 'utf8');
  return p.endsWith('.json') ? JSON.parse(body) : body;
}

const template = await readFile(opts.template, 'utf8');
const formFields = JSON.parse(await readFile(opts.formFields, 'utf8').catch(() => '{}'));
const idxResponses = [];
for (let i = 0; i < 6; i++) {
  const path = opts[`idx${i}`];
  if (path) idxResponses[i] = await readResponse(path);
}
const now = opts.now ? new Date(opts.now) : new Date();

// Mirror the production pipeline: raw polling responses go through the plugin's
// transform first, then its IDX_n keys replace the merge variables and any other
// key it returns is exposed to the markup as a top-level variable.
let extras = {};
let finalIdx = idxResponses;
if (opts.transform) {
  // With --now, freeze the transform's clock too, so countdowns in the rendered
  // preview are reproducible instead of drifting with wall-clock time.
  const ClockDate = opts.now
    ? class extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now.getTime(); }
      }
    : Date;
  const ctx = vm.createContext({ Intl, Date: ClockDate, Math, Array, JSON, isNaN, console });
  vm.runInContext(await readFile(opts.transform, 'utf8'), ctx);
  const input = { ...Object.fromEntries(idxResponses.map((r, i) => [`IDX_${i}`, r])),
                  trmnl: { plugin_settings: { custom_fields_values: formFields } } };
  const out = ctx.transform(input) ?? {};
  finalIdx = [];
  extras = {};
  for (const [k, v] of Object.entries(out)) {
    const m = /^IDX_(\d+)$/.exec(k);
    if (m) finalIdx[Number(m[1])] = v; else extras[k] = v;
  }
}

const inner = await renderTemplate(template, {
  formFields: { ...formFields, ...extras },
  idxResponses: finalIdx,
  now,
});

const FRAME = `<!doctype html>
<html><head><meta charset="utf-8"><title>TRMNL Preview</title>
<style>
  body { margin: 0; background: #ddd; font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .device { width: 800px; height: 480px; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.18); overflow: hidden; }
</style></head>
<body><div class="device">${inner}</div></body></html>`;

await writeFile(opts.out, FRAME, 'utf8');
process.stderr.write(`Preview written to ${opts.out}\n`);
