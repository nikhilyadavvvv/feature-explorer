# Feature Architecture Explorer

**[→ nikhilyadavvvv.github.io/feature-explorer](https://nikhilyadavvvv.github.io/feature-explorer/)**

Turn a feature branch into a single self-contained HTML page that explains what was built,
where each piece lives, how the pieces interact, and what the code actually does — with the
real source, at the real line numbers, annotated line by line.

It is meant for the moment someone says *"read through this branch and tell me how it works."*

**[→ Look at the demo](demo/demo.html)** — a one-commit fix in
[sindresorhus/ky](https://github.com/sindresorhus/ky), 14 nodes across types, option
normalisation, the retry decision and the tests. Open it in a browser; there is no build step.

---

## The part that makes it trustworthy

Anyone can ask an LLM to draw an architecture diagram. The problem is you cannot tell whether
what it drew is real, and a confidently wrong diagram is worse than no diagram.

Two mechanisms deal with that:

**Snippets are correct by construction.** You never paste code into the spec. You give a file
and a line range; `build.js` reads those lines off disk. Text and line numbers cannot drift,
because nobody retyped them.

```json
{ "from": 48, "to": 54, "n": "The fix. Defaults first, caller options over them, then methods is recomputed last…" }
```

**And then it's checked anyway.** `verify.js` re-parses the *built page* and diffs every
displayed line against the working tree, exiting non-zero on any mismatch. Run it before you
share a page, and again after anyone hand-edits one.

```
$ node verify.js demo/demo.html demo/ky-retry-methods.spec.json
data block parses: OK
structure: 14 nodes, 16 edges — OK

code lines checked: 138   mismatches: 0
✓ VERIFIED — every displayed line matches the working tree
```

On the first page built this way, that check caught five real defects — four line ranges taken
from diff hunks instead of the file, and one line that had been paraphrased rather than quoted.
It is the difference between a document you trust and one you spot-check forever.

## What you get in the page

- **An architecture graph** whose nodes are meaningful units — functions, routes, handlers,
  services, stores, config, types, tests — grouped into subsystems, with labelled directional
  edges (calls / data flow / HTTP / store operation), and `⟨inf⟩` on anything inferred rather
  than read from a literal call.
- **Feature Flow** — the primary execution path numbered and highlighted, everything else dimmed.
- **A node inspector** — change status, why the file is part of the feature, clickable
  relationships (called by / calls / reads / store operations), and the real source.
- **Line-by-line explanation** of intent, not syntax. "Prevents the request from being retried
  when the backend marks the failure as non-recoverable," not "this is an if statement."
- **Non-contiguous excerpts stay honest** — gaps are marked `⋮` and line numbers are never
  renumbered or stitched together.
- Changed-files panel grouped by subsystem, client-side search, status and subsystem filters,
  collapsible groups, pan/zoom, breadcrumb navigation. Dark, keyboard-friendly, no network calls.

## Install

```bash
git clone https://github.com/<you>/feature-explorer.git
```

Requires Node (any version with `fs`/`path` — no dependencies, no install step).

Optionally, as a Claude Code skill so you can invoke it by name:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/feature-explorer" ~/.claude/skills/feature-explorer
```

Then, in Claude Code: `/feature-explorer`

Using a different agent (Cursor, Copilot, Aider, Codex, plain ChatGPT with file access)? Point
it at [`PROMPT.md`](PROMPT.md), which is the same procedure without the Claude-specific wrapper.

## Use

The agent does the analysis and writes a spec; the two scripts do the rest.

```bash
node build.js  my-feature.spec.json  my-feature.html   # reads the real lines, validates structure
node verify.js my-feature.html       my-feature.spec.json
open my-feature.html
```

`build.js` refuses to build a spec that is structurally broken — dangling edge endpoints, a node
in no group, overlapping boxes, a line range past end-of-file — so those never reach the page.

Rebuild the demo yourself:

```bash
./demo/fetch.sh                                                    # clones ky into demo/.cache
node build.js  demo/ky-retry-methods.spec.json demo/demo.html
node verify.js demo/demo.html demo/ky-retry-methods.spec.json
```

## Honest limitations

- **It needs an agent.** The explanations are the value, and they come from a model reading the
  implementations. This is not a static-analysis tool, and a pure parser could not produce the
  "why" — so there is no fully automatic mode.
- **The graph layout is authored, not computed.** You place nodes on a column grid (`x = 40 + n·310`).
  Auto-layout was deliberately avoided: force-directed graphs of real codebases are unreadable,
  and a deliberate left-to-right flow is most of what makes the page legible. `build.js` catches
  overlaps for you.
- **Accuracy of the *explanations* is not machine-checkable.** `verify.js` proves the code shown
  is real; it cannot prove a note describes it correctly. Review the notes on anything load-bearing.
- **Large features need editorial judgement.** Past roughly 80 nodes the graph stops orienting
  and starts overwhelming. Prefer collapsing detail into fewer, better-chosen nodes.
- **A generated page embeds real source code.** That makes it a private artifact by default —
  see below.

## Before you share a page

A built page contains real code, real paths and real line numbers from your working tree. Read
it before publishing, the same way you would read a diff. In particular check for hardcoded IDs
and account numbers, internal hostnames, credential and setting names, and comments describing
security weaknesses — all of which turn up in ordinary code and are fine internally, but are not
things you want on a public URL.

`meta.repos` holds local paths and is written into the page, so scrub it if that matters.

## Layout

```
template.html   the renderer — one HTML file, no dependencies, data injected at build time
build.js        spec + working tree → explorer page (reads source lines, validates structure)
verify.js       built page × working tree → pass/fail on every displayed line
SCHEMA.md       the spec format
SKILL.md        the analysis procedure, as a Claude Code skill
PROMPT.md       the same procedure for any other agent
demo/           a worked example built from sindresorhus/ky (MIT) — see demo/ATTRIBUTION.md
index.html      the site above — same theme, no build step, no framework
```

## The site

`index.html` at the repo root is the page above, plus the live demo embedded and the install
steps. It's a fork of nothing but its own colours — plain HTML/CSS/JS, no framework, no build
step, same philosophy as everything else here.

To host your own after forking: **Settings → Pages → Source: Deploy from a branch → Branch:
`main`, folder `/ (root)` → Save.** `.nojekyll` is already committed so GitHub serves the files
as-is instead of running them through Jekyll, which would otherwise rewrite `demo/demo.html`'s
URL and quietly break the embed.

## License

MIT — see [LICENSE](LICENSE). The demo embeds excerpts of `sindresorhus/ky`, also MIT;
attribution in [`demo/ATTRIBUTION.md`](demo/ATTRIBUTION.md).
