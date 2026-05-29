#!/usr/bin/env node
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
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
  .option('--now <iso>', 'fixed timestamp for "now" (ISO string)', null);

program.parse(process.argv);
const opts = program.opts();

async function readJson(path) {
  if (!path) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

const template = await readFile(opts.template, 'utf8');
const formFields = (await readJson(opts.formFields)) ?? {};
const idxResponses = [];
for (const key of ['idx0', 'idx1', 'idx2', 'idx3', 'idx4', 'idx5']) {
  const idx = parseInt(key.slice(3), 10);
  const path = opts[key];
  if (path) idxResponses[idx] = await readJson(path);
}
const now = opts.now ? new Date(opts.now) : new Date();

const html = await renderTemplate(template, { formFields, idxResponses, now });
process.stdout.write(html);
