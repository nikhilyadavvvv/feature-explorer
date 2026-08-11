# Feature Architecture Explorer — agent instructions

Agent-agnostic version of `SKILL.md`. Same procedure, no Claude Code wrapper. Give this file to
any agent that can read a repository and run a shell command — no clone required, `npx` fetches
the two scripts it needs on demand.

Read `SKILL.md` for the full procedure and `SCHEMA.md` for the spec format — this file is the
short brief plus the rules that must not be broken. (Fetch either with
`npx feature-explorer init --full` / `--schema` if you don't already have them on disk.)

## Task

Analyse the feature on the current branch and produce an interactive HTML explorer:

1. Establish scope (branch, merge-base, changed files, uncommitted work) with read-only git.
2. Read the changed code, plus enough surrounding code to know who calls it and what it calls.
3. Write a spec JSON: nodes, groups, edges, files, and explanations. **Line ranges, never pasted code.**
4. Output goes to `.feature-explorer/` **at the repository root** — inside the repo, so it's
   right where the user is already looking, but untracked:
   ```bash
   ROOT=$(git rev-parse --show-toplevel)
   mkdir -p "$ROOT/.feature-explorer"
   ```
   Name the files `<branch-slug>.spec.json` and `<branch-slug>.html` inside it. Repo root (not
   cwd) makes the location deterministic even from a subdirectory in a monorepo. Do **not**
   `git add` it, and do **not** edit `.gitignore` to cover it — that's still editing a tracked
   file. If `git check-ignore .feature-explorer` fails, just note that in your final report; let
   the user decide whether to add the rule themselves.
5. `npx feature-explorer build <spec.json> <out.html>` (or `node build.js …` if you cloned the repo)
6. `npx feature-explorer verify <out.html> <spec.json>` — must exit 0.
7. Try to open it for them — `open <path>` (macOS) / `xdg-open <path>` (Linux) / `start <path>`
   (Windows). Best-effort: don't fail the task if there's no display to open it on.
8. Report what you found, the absolute path, whether `.gitignore` already covers it, whether you
   opened it, and confirm no tracked file, stage, branch, commit or ref changed.

## Non-negotiable

- **Read-only w.r.t. tracked state.** No `add · commit · checkout · switch · restore · reset ·
  clean · stash · merge · rebase · cherry-pick · revert · pull · push · fetch · apply`. No edits
  to any tracked file (`.gitignore` included), no formatters, no installs, nothing staged. There
  may be uncommitted work in the tree — leave it untouched. The one filesystem change allowed is
  the new *untracked* `.feature-explorer/` directory — `git status` shows it as untracked, never
  modified, and it's one `rm -rf` away from gone.
- **Land the deliverable somewhere findable.** `.feature-explorer/` at repo root, absolute path
  reported, ideally opened for them — never your own tool's internal artifact store, where
  "output goes in the repo" quietly turns into "output goes wherever is convenient for me."
- **The working tree is the truth.** Explain files as they exist on disk now, including
  uncommitted edits. Never check out an old version to read it.
- **Never transcribe code.** Segments are `{"from": N, "to": M}`; the builder reads the lines.
- **Never invent a relationship.** Read the implementation. An import is not a call. If a
  relationship is inferred, mark it `"inf"`. If you can't support it, omit it.
- **Explain intent, not syntax.** "Prevents a retry when the backend marked the failure
  non-recoverable" — not "this is an if statement".
- **`verify.js` must pass.** On a mismatch, fix the line range; never edit the quoted text.
- **Warn before sharing.** The page embeds real source, paths and line numbers, and `meta.repos`
  contains local paths. Tell the user what's in it.
