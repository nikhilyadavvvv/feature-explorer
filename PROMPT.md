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
4. `npx feature-explorer build <spec.json> <out.html>` (or `node build.js …` if you cloned the repo)
5. `npx feature-explorer verify <out.html> <spec.json>` — must exit 0.
6. Report what you found, and confirm the repository was not modified.

## Non-negotiable

- **Read-only.** No `add · commit · checkout · switch · restore · reset · clean · stash · merge ·
  rebase · cherry-pick · revert · pull · push · fetch · apply`. No edits, no formatters, no
  installs, nothing staged, no files written inside the repo's source tree. There may be
  uncommitted work in the tree — leave it untouched.
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
