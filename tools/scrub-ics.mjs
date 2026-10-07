#!/usr/bin/env node
// Build the committed synthetic .ics fixture from a real, local calendar feed.
//
// This repo is public, so plugins/blackboard-week/samples/learn.ics must not
// contain real coursework. Everything structural is preserved — the VTIMEZONE
// block and its DST RRULEs, every UID, every DTSTART/DTEND, line folding, the
// event count, escaped commas — and only SUMMARY values are replaced. The
// fixture therefore drives exactly the same code paths as the live feed.
//
//   node tools/scrub-ics.mjs \
//     plugins/blackboard-week/local/learn.real.ics \
//     plugins/blackboard-week/samples/learn.ics
//
// Re-run it after recapturing the feed. If it reports that a pinned UID is
// missing, the test that depends on that date needs updating alongside.

import { readFile, writeFile } from 'node:fs/promises';

// UIDs the tests pin, kept on their real dates so the fixture still drives the
// hero, queue ordering, truncation, and the class/deadline collisions.
const PINNED = {
  _3152398_: 'Session 2 Self-Check',
  _3200637_: 'Class 3 Preparation Activity (due noon on 9/9)',
  _3152399_: 'Session 3 Self-Check',
  _3176150_: 'Session 3 Assignment: Article Review 1',
  _3179181_: 'Team Charter',
  _3152411_: 'Sessions 3-4 Discussion Board: Example Case Study on Regional Store Performance',
  _3176157_: 'Group Assignment: Field Study Analysis Paper',
  _3176158_: 'Group Assignment: Field Study Analysis Presentation',
  _3180719_: 'Team Participation',
  // Carries escaped commas in the real feed; keeps the unescaping path covered.
  _3152414_: 'Sessions 7-8 Discussion Board: Example Topic\\, Second Clause\\, and a Third',
};

// Filler by UID block, mirroring SEMESTER.uidRanges. Vocabulary is distinctive
// so the title-rule fallback still has something to match on.
const BLOCKS = [
  { lo: 3152000, hi: 3152999, titles: ['Session %n Self-Check', 'Session %n Quiz'] },
  { lo: 3176000, hi: 3176999, titles: ['Session %n Assignment: Article Review %n', 'Group Assignment: Metrics Appendix Written Report', 'Group Assignment: Team Contract'] },
  { lo: 3179000, hi: 3180999, titles: ['Individual Application Assignment %n', 'Team Project - Individual Activity', 'Team Project Guide & Presentation'] },
  { lo: 3200000, hi: 3219999, titles: ['Team Project Preparation %n', 'Class %n Preparation Activity'] },
];

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node tools/scrub-ics.mjs <real.ics> <synthetic.ics>');
  process.exit(2);
}

const src = await readFile(inPath, 'utf8');

const counters = new Map();
function fillerFor(uid) {
  const n = Number(/-_(\d+)_/.exec(uid)?.[1] ?? 0);
  const block = BLOCKS.find((b) => n >= b.lo && n <= b.hi);
  const key = block ? String(block.lo) : 'other';
  const i = (counters.get(key) ?? 0) + 1;
  counters.set(key, i);
  if (!block) return `Coursework item ${i}`;
  return block.titles[(i - 1) % block.titles.length].replace(/%n/g, String(i));
}

const lines = src.split(/\r?\n/);
const out = [];
const seen = new Set();
let inEvent = false;
let uid = null;
let buffer = [];

for (const line of lines) {
  if (line === 'BEGIN:VEVENT') { inEvent = true; uid = null; buffer = [line]; continue; }
  if (!inEvent) { out.push(line); continue; }
  buffer.push(line);
  if (line.startsWith('UID:')) uid = line.slice(4);
  if (line === 'END:VEVENT') {
    const short = /-(_\d+_)/.exec(uid ?? '')?.[1] ?? '';
    if (short) seen.add(short);
    const title = PINNED[short] ?? fillerFor(uid ?? '');
    out.push(...buffer.map((l) => (l.startsWith('SUMMARY:') ? 'SUMMARY:' + title : l)));
    inEvent = false;
  }
}

const result = out.join('\r\n');
await writeFile(outPath, result, 'utf8');

// Structural parity is the whole point — assert it rather than assume it.
const count = (s, re) => (s.match(re) || []).length;
let ok = true;
for (const [label, re] of [
  ['VEVENT', /BEGIN:VEVENT/g], ['UID', /^UID:/gm], ['DTSTART', /^DTSTART/gm],
  ['DTEND', /^DTEND/gm], ['RRULE', /^RRULE/gm], ['VTIMEZONE', /BEGIN:VTIMEZONE/g],
  ['escaped commas', /\\,/g],
]) {
  const a = count(src, re);
  const b = count(result, re);
  if (a !== b) ok = false;
  console.log(`  ${label.padEnd(16)} real=${String(a).padEnd(4)} synthetic=${String(b).padEnd(4)} ${a === b ? 'ok' : 'MISMATCH'}`);
}

const missing = Object.keys(PINNED).filter((k) => !seen.has(k));
if (missing.length) {
  console.warn(`  pinned UIDs absent from the feed: ${missing.join(', ')}`);
  console.warn('  tests referencing those dates will need updating');
}
if (!ok) {
  console.error('structural mismatch — not safe to commit');
  process.exit(1);
}
console.log(`wrote ${outPath}`);
