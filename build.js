#!/usr/bin/env node
/**
 * build.js — turn an analysis spec into a self-contained Feature Architecture Explorer.
 *
 *   node build.js spec.json explorer.html
 *
 * The important property: you never transcribe source code into the spec. You give
 * LINE RANGES, and this script reads those lines off disk. Snippets and line numbers
 * are therefore correct by construction — the failure mode of hand-copied code
 * (right-looking text at the wrong line numbers) cannot happen.
 *
 * It also refuses to build a spec that is structurally wrong: dangling edges,
 * nodes in no group, overlapping boxes, ranges past end-of-file.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [, , specPath, outPath] = process.argv;
if (!specPath || !outPath) {
  console.error('usage: node build.js <spec.json> <output.html>');
  process.exit(2);
}

const HERE = __dirname;
const TEMPLATE = path.join(HERE, 'template.html');
const die = m => { console.error('✗ ' + m); process.exit(1); };

let spec;
try { spec = JSON.parse(fs.readFileSync(specPath, 'utf8')); }
catch (e) { die(`spec is not valid JSON: ${e.message}`); }

/* ---------------- defaults ---------------- */
const DEFAULT_LEGEND = {
  status: [
    ['A', 'Added for this feature', 'added'],
    ['M', 'Modified for this feature', 'mod'],
    ['U', 'Uncommitted / untracked', 'unc'],
    ['S', 'Pre-existing supporting code', 'sup'],
    ['I', 'Infrastructure / external service', 'infra'],
  ],
  edges: [['', 'calls', 'f'], ['d', 'HTTP request', 'd'], ['t', 'data flow', 't'],
          ['db', 'store operation', 'db'], ['inf', 'inferred', 'inf']],
};
spec.legend = spec.legend || DEFAULT_LEGEND;
spec.meta = spec.meta || {};
spec.meta.repos = spec.meta.repos || {};
for (const k of ['files', 'groups', 'edges', 'nodes']) spec[k] = spec[k] || [];

/* ---------------- repo roots ---------------- */
// spec.meta.repos maps the label shown in the UI -> a path on disk. Relative paths
// resolve against the spec file's directory, so a spec can travel with the repo.
const specDir = path.dirname(path.resolve(specPath));
const roots = {};
for (const [label, p] of Object.entries(spec.meta.repos)) {
  roots[label] = path.isAbsolute(p) ? p : path.resolve(specDir, p);
  if (!fs.existsSync(roots[label])) die(`repo root for "${label}" does not exist: ${roots[label]}`);
}

const fileCache = new Map();
function readLines(repoLabel, rel) {
  const root = roots[repoLabel];
  if (!root) die(`node/segment references repo "${repoLabel}" which is not in meta.repos`);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(path.resolve(root))) die(`path escapes its repo root: ${rel}`);
  const key = abs;
  if (!fileCache.has(key)) {
    if (!fs.existsSync(abs)) die(`file not found: ${abs}`);
    fileCache.set(key, fs.readFileSync(abs, 'utf8').split('\n'));
  }
  return fileCache.get(key);
}

// Historical counterpart of readLines: the same file, as it was at a specific commit, via
// `git show` — never a checkout, so the working tree (and any uncommitted edits in it) is
// never touched. Used only for meta.checkpoints[].segs; node segs always read live disk.
const gitCache = new Map();
function readLinesAtCommit(repoLabel, rel, sha) {
  const root = roots[repoLabel];
  if (!root) die(`checkpoint segment references repo "${repoLabel}" which is not in meta.repos`);
  const key = `${root}::${sha}::${rel}`;
  if (!gitCache.has(key)) {
    let content;
    try {
      content = execFileSync('git', ['show', `${sha}:${rel}`], { cwd: root, encoding: 'utf8' });
    } catch (e) {
      die(`checkpoint sha ${sha}: \`git show ${sha}:${rel}\` failed in ${root} — ` +
          (e.stderr ? e.stderr.toString().trim().split('\n')[0] : e.message));
    }
    gitCache.set(key, content.split('\n'));
  }
  return gitCache.get(key);
}

/* ---------------- expand segments ----------------
 * Shared by node segs (read live off disk) and checkpoint segs (read via `git show` at a
 * fixed commit) — same {from,to} → {l} expansion and the same range validation either way.
 * `getLines(repoLabel, rel)` is the only thing that differs between the two callers.
 */
let lineCount = 0, segCount = 0, checkpointLineCount = 0;

function expandSeg(sg, ctxLabel, defaultRepo, defaultFile, getLines, sourceDesc) {
  if (Array.isArray(sg.l)) return; // literal lines supplied (escape hatch) — left as-is

  if (sg.from == null || sg.to == null)
    die(`${ctxLabel}: segment needs {from,to} line numbers (or literal "l")`);
  const repoLabel = sg.r || defaultRepo;
  const rel = sg.f || defaultFile;
  if (!rel) die(`${ctxLabel}: segment has no file (set a default file or seg.f)`);

  const lines = getLines(repoLabel, rel);
  if (sg.from < 1) die(`${ctxLabel}: from=${sg.from} must be >= 1`);
  if (sg.to > lines.length)
    die(`${ctxLabel}: ${rel} has ${lines.length} lines${sourceDesc} but segment asks for ${sg.to}`);
  if (sg.to < sg.from) die(`${ctxLabel}: to=${sg.to} is before from=${sg.from}`);

  sg.l = [];
  for (let ln = sg.from; ln <= sg.to; ln++) sg.l.push([ln, lines[ln - 1]]);
  lineCount += sg.l.length;
  // Always stamp the resolved file/repo, not just on override — previously this was deleted
  // unconditionally, so a per-segment override (seg.f/seg.r) silently vanished from the built
  // page and verify.js fell back to the node's default file, checking the wrong source for any
  // segment that had overridden it. Self-describing segments remove that ambiguity entirely.
  sg.file = rel; sg.repo = repoLabel;
  delete sg.from; delete sg.to; delete sg.f; delete sg.r;
}

for (const n of spec.nodes) {
  if (!Array.isArray(n.segs)) { n.segs = []; continue; }
  for (const sg of n.segs) {
    segCount++;
    expandSeg(sg, `node "${n.id}"`, n.repo, n.file, readLines, '');
  }
  // Derive the displayed line range when the author didn't state one.
  if (!n.lines && n.segs.length) {
    const all = n.segs.flatMap(s => (s.l || []).map(x => x[0])).filter(Number.isFinite);
    if (all.length) n.lines = `${Math.min(...all)}–${Math.max(...all)}`;
  }
}

// meta.checkpoints — the optional commit timeline. Each checkpoint's segs are read via `git
// show <sha>:<path>` (never a checkout), so they need their own file/repo every time — there's
// no single node to default to the way there is for node segs.
const checkpoints = Array.isArray(spec.meta.checkpoints) ? spec.meta.checkpoints : [];
for (const cp of checkpoints) {
  if (!Array.isArray(cp.segs)) { cp.segs = []; continue; }
  for (const sg of cp.segs) {
    segCount++;
    if (!cp.sha) die(`checkpoint "${cp.id || '?'}" has segs but no sha to read them from`);
    expandSeg(sg, `checkpoint "${cp.id || '?'}"`, undefined, undefined,
      (repoLabel, rel) => readLinesAtCommit(repoLabel, rel, cp.sha), ` at commit ${cp.sha}`);
    checkpointLineCount += sg.l.length; // expandSeg already added it to lineCount too
  }
}

/* ---------------- structural validation ---------------- */
const problems = [];
const ids = new Set();
for (const n of spec.nodes) {
  if (!n.id) problems.push('a node has no id');
  if (ids.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
  ids.add(n.id);
  if (typeof n.x !== 'number' || typeof n.y !== 'number') problems.push(`node ${n.id} needs numeric x/y`);
  if (!n.label) problems.push(`node ${n.id} has no label`);
}
for (const e of spec.edges) {
  if (!ids.has(e[0])) problems.push(`edge references unknown source node: ${e[0]}`);
  if (!ids.has(e[1])) problems.push(`edge references unknown target node: ${e[1]}`);
}
const grouped = new Map();
for (const g of spec.groups) for (const id of g.n) {
  if (!ids.has(id)) problems.push(`group ${g.id} references unknown node: ${id}`);
  if (grouped.has(id)) problems.push(`node ${id} is in two groups (${grouped.get(id)}, ${g.id})`);
  grouped.set(id, g.id);
}
const ungrouped = [...ids].filter(id => !grouped.has(id));
if (ungrouped.length) problems.push(`nodes in no group: ${ungrouped.join(', ')}`);
for (const f of spec.files) for (const id of (f.n || []))
  if (!ids.has(id)) problems.push(`file ${f.p} references unknown node: ${id}`);

const checkpointIds = new Set();
for (const cp of checkpoints) {
  if (!cp.id) problems.push('a checkpoint has no id');
  if (checkpointIds.has(cp.id)) problems.push(`duplicate checkpoint id: ${cp.id}`);
  checkpointIds.add(cp.id);
  if (!cp.sha) problems.push(`checkpoint ${cp.id || '?'} has no sha`);
}
for (const n of spec.nodes)
  if (n.checkpoint != null && !checkpointIds.has(n.checkpoint))
    problems.push(`node ${n.id} references unknown checkpoint: ${n.checkpoint}`);

// Overlap check mirrors the renderer's box sizes.
const NW = 186, NH = 62, SH = 74;
const boxes = spec.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: NW, h: n.kind === 'store' ? SH : NH }));
for (let i = 0; i < boxes.length; i++)
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
      problems.push(`nodes overlap: ${a.id} and ${b.id} — move one`);
  }

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) in ${specPath}:`);
  for (const p of problems.slice(0, 40)) console.error('  · ' + p);
  if (problems.length > 40) console.error(`  … ${problems.length - 40} more`);
  process.exit(1);
}

/* ---------------- inject ---------------- */
if (!fs.existsSync(TEMPLATE)) die(`template.html not found next to build.js (${TEMPLATE})`);
const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const OPEN = '<script id="data" type="application/json">';
const i = tpl.indexOf(OPEN);
const j = tpl.indexOf('</script>', i);
if (i < 0 || j < 0) die('template.html has no <script id="data"> block');

// meta.repos holds absolute local paths — useful to verify.js, not to a reader on the web.
const publish = JSON.parse(JSON.stringify(spec));
const json = JSON.stringify(publish);
if (json.includes('</script>')) die('spec contains the literal string "</script>", which would break the page');

const out = tpl.slice(0, i + OPEN.length) + '\n' + json + '\n' + tpl.slice(j);
fs.writeFileSync(outPath, out);

const byStatus = {};
for (const f of spec.files) byStatus[f.s] = (byStatus[f.s] || 0) + 1;
console.log(`✓ ${outPath}  (${(out.length / 1024).toFixed(0)}KB, self-contained)`);
console.log(`  ${spec.nodes.length} nodes · ${spec.edges.length} edges · ${spec.groups.length} groups · ${spec.files.length} files`);
console.log(`  ${segCount} segments · ${lineCount - checkpointLineCount} source lines read from disk` +
  (checkpointLineCount ? ` · ${checkpointLineCount} read from ${checkpoints.length} checkpoint commit(s)` : ''));
console.log(`  files by status: ${Object.entries(byStatus).map(([k, v]) => k + '=' + v).join(' ') || '—'}`);
console.log(`  next: node verify.js ${outPath} ${specPath}`);
