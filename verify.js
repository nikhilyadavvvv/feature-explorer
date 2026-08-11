#!/usr/bin/env node
/**
 * verify.js — prove a built explorer matches the code on disk.
 *
 *   node verify.js explorer.html spec.json
 *
 * build.js already reads source lines off disk, so a fresh build is correct by
 * construction. This is the independent check that matters afterwards: it re-parses
 * the *built page* and diffs every displayed line against the working tree. Run it
 * before you share a page, and again if anyone hand-edits one.
 *
 * Exit code 0 = every line matches. Non-zero = do not publish.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [, , htmlPath, specPath] = process.argv;
if (!htmlPath) {
  console.error('usage: node verify.js <explorer.html> [spec.json]');
  console.error('  spec.json supplies meta.repos (repo label -> path) when the page omits it');
  process.exit(2);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) { console.error('✗ no data block in ' + htmlPath); process.exit(1); }

let DATA;
try { DATA = JSON.parse(m[1]); }
catch (e) { console.error('✗ data block is not valid JSON: ' + e.message); process.exit(1); }
console.log('data block parses: OK');

// Repo roots: prefer the page, fall back to the spec (paths are local, so a published
// page usually carries none and you verify against the spec beside your checkout).
let repos = (DATA.meta && DATA.meta.repos) || {};
let baseDir = path.dirname(path.resolve(htmlPath));
if (specPath && fs.existsSync(specPath)) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  repos = Object.assign({}, repos, (spec.meta && spec.meta.repos) || {});
  baseDir = path.dirname(path.resolve(specPath));
}
if (!Object.keys(repos).length) {
  console.error('✗ no meta.repos mapping found (in the page or the spec) — cannot locate sources');
  process.exit(1);
}
const roots = {};
for (const [label, p] of Object.entries(repos))
  roots[label] = path.isAbsolute(p) ? p : path.resolve(baseDir, p);

/* ---------------- structure ---------------- */
const nodes = DATA.nodes || [];
const checkpoints = (DATA.meta && DATA.meta.checkpoints) || [];
const ids = new Set(nodes.map(n => n.id));
const checkpointIds = new Set(checkpoints.map(c => c.id));
let structural = 0;
const dup = nodes.map(n => n.id).filter((x, i, a) => a.indexOf(x) !== i);
if (dup.length) { console.error('✗ duplicate node ids: ' + dup.join(', ')); structural++; }
for (const e of (DATA.edges || [])) {
  if (!ids.has(e[0])) { console.error(`✗ edge from unknown node: ${e[0]}`); structural++; }
  if (!ids.has(e[1])) { console.error(`✗ edge to unknown node: ${e[1]}`); structural++; }
}
for (const n of nodes)
  if (n.checkpoint != null && !checkpointIds.has(n.checkpoint)) {
    console.error(`✗ node ${n.id} references unknown checkpoint: ${n.checkpoint}`); structural++;
  }
console.log(`structure: ${nodes.length} nodes, ${(DATA.edges || []).length} edges` +
            (checkpoints.length ? `, ${checkpoints.length} checkpoints` : '') +
            (structural ? ` — ${structural} problem(s)` : ' — OK'));

/* ---------------- code fidelity ---------------- */
const cache = new Map();
function lines(label, rel) {
  const root = roots[label];
  if (!root) return null;
  const abs = path.resolve(root, rel);
  if (!cache.has(abs)) {
    cache.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null);
  }
  return cache.get(abs);
}

// Historical counterpart of lines(): checkpoint segments assert against a specific commit,
// never the working tree, via the same read-only `git show` build.js used to source them.
// Returns null (never throws) so a bad sha/path reports as "unresolved", same as a missing file.
const gitCache = new Map();
function linesAtCommit(label, rel, sha) {
  const root = roots[label];
  if (!root) return null;
  const key = `${root}::${sha}::${rel}`;
  if (!gitCache.has(key)) {
    try {
      gitCache.set(key, execFileSync('git', ['show', `${sha}:${rel}`], { cwd: root, encoding: 'utf8' }).split('\n'));
    } catch {
      gitCache.set(key, null);
    }
  }
  return gitCache.get(key);
}

let checked = 0, mismatched = 0, checkpointChecked = 0;
const unresolved = new Set();
const shown = [];

function checkSegs(segs, label, describeMismatch, getLines) {
  for (const sg of segs) {
    // A segment may override the node's file/repo (segFile/segRepo survive into the page
    // only if the author used literal lines; built specs bake the path into the node).
    const repoLabel = sg.repo || label.repo;
    const rel = sg.file || label.file;
    if (!rel || rel === '—') continue;
    const L = getLines(repoLabel, rel);
    if (!L) { unresolved.add(label.unresolvedTag(repoLabel, rel)); continue; }
    for (const [ln, txt] of (sg.l || [])) {
      checked++;
      const actual = L[ln - 1];
      if (actual === undefined) {
        mismatched++;
        if (shown.length < 20) shown.push(`${describeMismatch}  ${rel}:${ln}  — line does not exist (file has ${L.length})`);
      } else if (actual !== txt) {
        mismatched++;
        if (shown.length < 20) shown.push(
          `${describeMismatch}  ${rel}:${ln}\n    page: ${JSON.stringify(txt)}\n    disk: ${JSON.stringify(actual)}`);
      }
    }
  }
}

for (const n of nodes) {
  checkSegs(n.segs || [], { repo: n.repo, file: n.file, unresolvedTag: (l, r) => `${l} :: ${r}` }, n.id, lines);
}

for (const cp of checkpoints) {
  const before = checked;
  checkSegs(cp.segs || [], { repo: undefined, file: undefined, unresolvedTag: (l, r) => `${l} :: ${r} @ ${cp.sha}` },
    `checkpoint ${cp.id}`, (label, rel) => linesAtCommit(label, rel, cp.sha));
  checkpointChecked += checked - before;
}

if (shown.length) { console.error('\nMISMATCHES:'); for (const s of shown) console.error('  ' + s); }
if (unresolved.size) {
  console.error('\nUNRESOLVED FILES (no repo root, missing commit, or file moved/deleted):');
  for (const u of unresolved) console.error('  ' + u);
}

console.log(`\ncode lines checked: ${checked - checkpointChecked}   mismatches: ${mismatched}` +
  (checkpointChecked ? `\ncheckpoint lines checked (against their own commits): ${checkpointChecked}` : ''));
const ok = mismatched === 0 && unresolved.size === 0 && structural === 0;
console.log(ok ? '✓ VERIFIED — every displayed line matches the working tree' +
                 (checkpoints.length ? ' (and each checkpoint matches its own commit)' : '')
              : '✗ FAILED — do not publish this page until the above is resolved');
process.exit(ok ? 0 : 1);
