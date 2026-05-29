#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
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
  .requiredOption('--out <path>', 'output HTML file');

program.parse(process.argv);
const opts = program.opts();

async function readJson(p) { return p ? JSON.parse(await readFile(p, 'utf8')) : null; }

const template = await readFile(opts.template, 'utf8');
const formFields = (await readJson(opts.formFields)) ?? {};
const idxResponses = [];
for (let i = 0; i < 6; i++) {
  const path = opts[`idx${i}`];
  if (path) idxResponses[i] = await readJson(path);
}
const now = opts.now ? new Date(opts.now) : new Date();
const inner = await renderTemplate(template, { formFields, idxResponses, now });

const FRAME = `<!doctype html>
<html><head><meta charset="utf-8"><title>TRMNL Preview</title>
<style>
  body { margin: 0; background: #ddd; font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .device { width: 800px; height: 480px; background: white; box-shadow: 0 4px 24px rgba(0,0,0,0.18); overflow: hidden; }
</style></head>
<body><div class="device">${inner}</div></body></html>`;

await writeFile(opts.out, FRAME, 'utf8');
process.stderr.write(`Preview written to ${opts.out}\n`);
