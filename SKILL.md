---
name: feature-explorer
description: Analyse the feature on the current branch and generate an interactive HTML architecture explorer with real source code and line-by-line explanations. Use when asked to explain, document, review or hand over a branch's implementation, to produce an architecture diagram or code walkthrough of recent work, or to onboard someone onto a feature. Read-only — never modifies the repository.
---

# Feature Architecture Explorer

Produce a self-contained HTML page that lets someone with no prior knowledge of the branch
understand: what was built, where each piece lives, how the pieces interact, and what the code
actually does.

You write a **spec** (JSON). Two scripts in this skill's directory do the rest:

```bash
node build.js  <spec.json> <out.html>     # reads real source lines, validates structure
node verify.js <out.html>   <spec.json>   # diffs every displayed line against disk
```

(Equivalent as `npx feature-explorer build/verify …` if you're following this procedure without
a local clone — e.g. it was fetched via `npx feature-explorer init --full` rather than symlinked
into `~/.claude/skills`.)

**You never transcribe source code into the spec.** You give line ranges; `build.js` reads the
lines off disk. This is not a convenience — it is what makes the output trustworthy, and it
removes the single largest source of error (right-looking code at wrong line numbers).

---

## 0. The repository is read-only

There may be important uncommitted work in the tree. Leave it exactly as you found it.

Never run: `add · commit · checkout · switch · restore · reset · clean · stash · merge · rebase ·
cherry-pick · revert · pull · push · fetch · apply`. Never modify, reformat or "fix" a source
file, never install or upgrade anything, never run a formatter or a linter with `--fix`, never
touch a tracked file, never stage or unstage anything, never edit `.gitignore`.

Do not modify something intending to restore it afterwards.

Before running any command, ask: *can this alter a tracked file, the index, refs, dependencies or
configuration?* If yes or unsure, don't.

**Output location is not yours to decide.** Write the spec JSON to
`.feature-explorer/<branch-slug>.spec.json` (create the directory yourself —
`mkdir -p "$(git rev-parse --show-toplevel)/.feature-explorer"` — since you write this file
before calling `build`), then:

```bash
npx feature-explorer build .feature-explorer/<branch-slug>.spec.json
```

**No second argument.** Left to itself, `build` writes to `.feature-explorer/<name>.html` at the
repository root — resolved from `git rev-parse --show-toplevel`, so it's correct regardless of
which subdirectory you were invoked from — and opens the result automatically. That is a
deliberate design decision, not a default you're free to improve on: computing your own output
path, or routing the file through whatever internal artifact/canvas storage your own tooling
normally uses for generated content, is exactly the failure mode this exists to prevent. The page
is the deliverable; a human has to find and open it without first learning your tool's storage
conventions.

`.feature-explorer/` is **not** tracked: don't `git add` it, and don't edit `.gitignore` to cover
it either — that's still editing a tracked file. If `git check-ignore .feature-explorer` fails
(no existing rule covers it), say so in your final report and leave the decision to the user.

"Read-only" means precisely this: no tracked file is touched, nothing is staged, no commit/branch/
ref changes. A new *untracked* directory sitting in the working tree satisfies that — `git status`
in the target repo shows it as untracked, never as modified, and it costs the user one `rm -rf
.feature-explorer` to remove entirely.

After `verify.js` passes, try to open the page for them: `open <path>` (macOS), `xdg-open <path>`
(Linux), `start <path>` (Windows) — best-effort, swallow the error if there's no display. Either
way, end by printing the exact absolute path.

Confirm all of this at the end: where you wrote it, whether it's covered by an existing
`.gitignore` rule, whether you opened it, and that no tracked file, stage, branch, commit or ref
changed.

## 1. Establish scope with as little git as possible

```bash
git branch --show-current
git status --short
git merge-base <base> HEAD          # only if you actually need the divergence point
git diff --name-status <merge-base> HEAD
git diff --numstat                  # uncommitted work
```

That is normally all you need. Don't gather git statistics for decoration.

**The working tree is the source of truth.** A file with uncommitted edits must be explained as
it exists on disk right now. Git tells you *what changed*; the filesystem tells you *what it is*.
Never check out an older version to read it.

Classify each file: `A` added · `M` modified · `U` untracked/uncommitted · `S` pre-existing
supporting code · `I` infrastructure. Mark files that are committed *and* have uncommitted edits
with `"u": 1` — that distinction matters to a reviewer.

If the feature spans multiple repositories, treat it as one feature and give each repo an entry
in `meta.repos`.

## 2. Understand the feature before drawing anything

Read the changed files. Then read enough unchanged code to answer: who calls this, what does it
call, what types constrain it, what does it read and write, what happens when it fails.

Reconstruct the actual execution path from the code. Do not invent a tidy layered architecture
because it would graph nicely.

For every changed file, answer **why does this file exist for this feature** in one or two
sentences grounded in what you read. That becomes `files[].why`.

## 3. Choose nodes that carry meaning

A node is worth creating when it helps someone understand the feature: an entry point, a route,
a handler, a service function, a decision gate, a store, an important type, a config module, a
test. Not: local variables, trivial getters, obvious wrappers, every import.

Group nodes into subsystems that reflect *this* project's real structure. Do not force
frontend/backend onto something that isn't.

Mark the primary execution path with `flow: 1, 2, 3…` in order. Keep it to the spine — the path
a reader should follow first, not everything that participates.

## 4. Edges must be earned

An import is not a call. Read the implementation before asserting a relationship.

Use `call` (invocation), `data` (reads / provides / flows to), `http` (network request), `db`
(store operation). Label every edge with something specific: `POST /api/x`, `point read by id`,
`bulk upsert`, `reads normalised methods` — not `uses`.

If a relationship is inferred rather than read from a literal call, pass `"inf"` as the 6th
element so the page marks it. **An honest "inferred" beats a confident fabrication.** If you
cannot support an edge from the source, leave it out.

## 5. Layout

Nodes are placed by hand on a grid; boxes are 186×62 (stores 186×74).

- Columns: `x = 40 + n * 310`. Left-to-right should follow the flow.
- Rows: `y` in steps of 80–100 within a column.
- Put distinct bands (e.g. write path, read path, maintenance) at clearly separated `y`.
- Every node must belong to exactly one group.

`build.js` rejects overlapping boxes and ungrouped nodes, so build early and often.

## 6. Explanations are the deliverable

For each node, write `summary` (what it does and why it exists) plus one `n` note per segment.

Explain **intent and consequence**, never syntax:

- ✗ "This if statement checks a condition."
- ✓ "Prevents a retry when the backend marked the failure non-recoverable."
- ✗ "Returns data."
- ✓ "Returns the normalised checkout object the UI expects, dropping transport metadata."

Say where input came from and where output goes; name side effects, state changes, error paths,
async behaviour and assumptions. Where a comment or a commit explains *why* a line exists, say
so — that context is exactly what a reader cannot recover alone.

Group multi-line expressions into one segment and explain them as a unit. Segments need not be
contiguous; the page marks gaps with `⋮` and keeps true line numbers.

Prefer 3–7 segments on the nodes that matter and 1–2 on supporting ones. Do not annotate every
line of a 200-line function — choose the parts that carry the design.

## 7. Build, verify, and check before sharing

```bash
npx feature-explorer build  <spec.json>              # no second arg — see section 0
npx feature-explorer verify <the path build printed> <spec.json>
```

If you have a local clone, `node build.js <spec.json> <out.html>` runs the identical renderer —
but the CLI's output-location default and auto-open are wrapper behavior, not in `build.js`
itself, so the raw script always needs both arguments.

`verify.js` must exit 0. If it reports a mismatch, the line numbers in the spec are wrong — fix
the range, never the quoted text.

Then read the page as a diff before it goes anywhere: real code, paths and line numbers are
embedded, and ordinary source routinely contains hardcoded IDs, internal hostnames, setting names
and comments describing security weaknesses. Tell the user what the page contains and let them
decide where it can live. `meta.repos` holds local paths and is written into the page.

Open it, and report as described at the end of section 0 — output path, whether it's opened,
whether `.gitignore` already covers it, the verifier result, and that no tracked file changed.

## 8. If tests exist, they are part of the architecture

Give them `"kind": "test"` (the page styles them distinctly) and connect them to what they
verify. Explain the scenario, the inputs, the behaviour exercised, the expected result, and the
regression it protects against. If the branch has no tests, say so plainly rather than implying
coverage.

---

See [`SCHEMA.md`](SCHEMA.md) for the exact spec format and
[`demo/ky-retry-methods.spec.json`](demo/ky-retry-methods.spec.json) for a complete worked example.
