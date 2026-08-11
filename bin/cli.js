#!/usr/bin/env node
/**
 * feature-explorer — CLI entry point.
 *
 *   npx feature-explorer init                          print the agent instructions
 *   npx feature-explorer build  <spec.json> <out.html>  render a spec into a page
 *   npx feature-explorer verify <out.html> <spec.json>  check a page against disk
 *
 * This file does not reimplement build.js or verify.js — it spawns them as
 * subprocesses and forwards argv/exit-code/stdio untouched, so `npx feature-explorer
 * build ...` behaves identically to `node build.js ...`. That equivalence is the
 * whole point: nothing about running this through npx should change what gets built
 * or how verify checks it.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const USAGE = `feature-explorer v${pkg.version} — turn a feature branch into a self-contained HTML architecture explorer

Usage:
  npx feature-explorer init [--full | --schema]
      Print the agent instructions to stdout — PROMPT.md by default (the short,
      agent-agnostic brief), --full for SKILL.md (the complete procedure), or
      --schema for SCHEMA.md (the spec format). Writes nothing; give your agent
      the command itself, e.g. "run \`npx feature-explorer init\` and follow it
      on the current branch."

  npx feature-explorer build <spec.json> <out.html>
      Read a spec, pull the real source lines it references off disk, validate
      the structure, and write the explorer page. Identical to \`node build.js\`.

  npx feature-explorer verify <out.html> <spec.json>
      Re-parse a built page and diff every displayed line against the working
      tree. Exit code non-zero on any mismatch. Identical to \`node verify.js\`.

  npx feature-explorer --version | --help

No dependencies, no network calls, no files written except the <out.html> you
name on the build command. https://github.com/nikhilyadavvvv/feature-explorer
`;

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { stdio: 'inherit' });
  // spawnSync yields status:null (not 0) if the child was killed by a signal rather than
  // exiting normally — treat that as failure too, instead of letting `?? 1` silently pass it.
  process.exit(result.signal ? 1 : (result.status ?? 1));
}

function printDoc(file) {
  process.stdout.write(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'build':
    if (rest.length < 2) {
      console.error('usage: npx feature-explorer build <spec.json> <out.html>');
      process.exit(1);
    }
    run('build.js', rest);
    break;

  case 'verify':
    if (rest.length < 1) {
      console.error('usage: npx feature-explorer verify <out.html> [spec.json]');
      process.exit(1);
    }
    run('verify.js', rest);
    break;

  case 'init':
    if (rest.includes('--full')) printDoc('SKILL.md');
    else if (rest.includes('--schema')) printDoc('SCHEMA.md');
    else printDoc('PROMPT.md');
    break;

  case '--version':
  case '-v':
  case 'version':
    console.log(pkg.version);
    break;

  case '--help':
  case '-h':
  case 'help':
  case undefined:
    console.log(USAGE);
    process.exit(0);
    break;

  default:
    console.error(`Unknown command: ${cmd}\n`);
    console.error(USAGE);
    process.exit(1);
}
