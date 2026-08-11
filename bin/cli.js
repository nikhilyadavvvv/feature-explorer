#!/usr/bin/env node
/**
 * feature-explorer — CLI entry point.
 *
 *   npx feature-explorer init                          print the agent instructions
 *   npx feature-explorer build  <spec.json> [out.html]  render a spec into a page
 *   npx feature-explorer verify <out.html> [spec.json]  check a page against disk
 *
 * This file does not reimplement build.js or verify.js for the actual page-rendering
 * work — it spawns them as subprocesses and forwards stdio/exit-code untouched. What
 * it *does* own: where the output lands when the caller doesn't say, and opening it
 * afterward. Those two things used to live only in prose (PROMPT.md/SKILL.md telling
 * the agent what to do) — and an agent whose own harness has stronger opinions about
 * file placement than a markdown file it fetched will follow its own habits instead.
 * Deciding the path and opening the file in code means it happens regardless of how
 * carefully any given agent reads instructions.
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

  npx feature-explorer build <spec.json> [out.html] [--no-open]
      Read a spec, pull the real source lines it references off disk, validate
      the structure, and write the explorer page. If out.html is omitted, it
      defaults to .feature-explorer/<spec-name>.html at the repository root
      (created if needed) — inside the repo, findable, untracked. On success,
      opens the result (\`open\`/\`xdg-open\`/\`start\`) unless --no-open is given.

  npx feature-explorer verify <out.html> [spec.json]
      Re-parse a built page and diff every displayed line against the working
      tree. Exit code non-zero on any mismatch. Identical to \`node verify.js\`.

  npx feature-explorer --version | --help

No dependencies, no network calls. The only files written are inside whatever
<out.html> you end up with — https://github.com/nikhilyadavvvv/feature-explorer
`;

function run(script, args) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], { stdio: 'inherit' });
}

// spawnSync yields status:null (not 0) if the child was killed by a signal rather than
// exiting normally — treat that as failure too, instead of letting `?? 1` silently pass it.
function exitCodeOf(result) {
  return result.signal ? 1 : (result.status ?? 1);
}

function printDoc(file) {
  process.stdout.write(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

// Null if cwd isn't inside a git repo (or git isn't on PATH) — callers fall back to cwd.
function gitRepoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// .feature-explorer/<spec-basename>.html at the repo root — deterministic regardless
// of which subdirectory of the repo you were invoked from, unlike a bare cwd default.
function defaultOutputPath(specPath) {
  const root = gitRepoRoot() || process.cwd();
  const base = path.basename(specPath).replace(/\.spec\.json$/i, '').replace(/\.json$/i, '');
  return path.join(root, '.feature-explorer', `${base || 'explorer'}.html`);
}

// Best-effort: never throws, never blocks the build's own success/failure on whether
// there happened to be a display to open it on (CI, headless containers, SSH sessions).
function tryOpen(filePath) {
  const openers = {
    darwin: ['open', [filePath]],
    win32: ['cmd', ['/c', 'start', '""', filePath]],
  };
  const [cmd, args] = openers[process.platform] || ['xdg-open', [filePath]];
  try {
    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'build': {
    const noOpen = rest.includes('--no-open');
    const positional = rest.filter(a => a !== '--no-open');
    const [specPath, explicitOut] = positional;
    if (!specPath) {
      console.error('usage: npx feature-explorer build <spec.json> [out.html] [--no-open]');
      process.exit(1);
    }
    const outPath = explicitOut || defaultOutputPath(specPath);
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });

    const result = run('build.js', [specPath, outPath]);
    const code = exitCodeOf(result);
    if (code === 0 && !noOpen) {
      const opened = tryOpen(outPath);
      console.log(opened
        ? `✓ opened ${outPath}`
        : `(couldn't auto-open — open ${outPath} yourself)`);
    }
    process.exit(code);
    break;
  }

  case 'verify': {
    if (rest.length < 1) {
      console.error('usage: npx feature-explorer verify <out.html> [spec.json]');
      process.exit(1);
    }
    process.exit(exitCodeOf(run('verify.js', rest)));
    break;
  }

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
