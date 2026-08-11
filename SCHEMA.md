# Spec format

One JSON file. `build.js` expands line ranges into real source, validates the structure, and
injects the result into `template.html`.

```jsonc
{
  "meta": { … },        // title, repos, overview, stats, optional bands + readingOrder
  "files": [ … ],       // the changed-files panel
  "groups": [ … ],      // subsystem boxes on the graph
  "edges": [ … ],       // relationships
  "nodes": [ … ]        // the graph nodes + source + explanations
}
```

Only `meta.repos` and `nodes` are strictly required, but a page without `groups` and `edges` is
just a code viewer. `legend` is optional and defaults to the standard status/edge legend.

---

## meta

```jsonc
"meta": {
  "title": "ky · fix uppercase retry.methods",     // page heading + <title>
  "repos": { "ky": ".cache/ky" },                  // REQUIRED: label → path (see below)
  "branches": [ { "repo": "ky", "branch": "fix-methods (vs main, merge-base 4b6cd2f)" } ],
  "overview": "<p>HTML allowed…</p>",              // 2–5 sentences, generated from the code
  "stats": [ { "k": "files", "v": "3" } ],         // header chips, free-form
  "bands": [                                        // optional subsystem filters
    { "k": "retry", "label": "Retry decision", "groups": ["gRetry"] }
  ],
  "readingOrder": [                                 // optional guided path in the sidebar
    { "id": "methodCheck", "label": "the comparison", "note": "the line the fix exists to satisfy" }
  ]
}
```

**`meta.repos`** maps the label shown in the UI to a path on disk. Relative paths resolve against
the spec file's directory, so a spec can travel next to a checkout. Every `node.repo` must be a
key here. Multi-repo features simply list more than one.

> These are local paths and they are written into the built page. Scrub them before publishing if
> that matters.

`bands` and `readingOrder` are omitted entirely for small features — the controls then don't render.

## files

Drives the left panel. Grouped by `g`, in the order they first appear.

```jsonc
{
  "p": "source/utils/normalize.ts",   // path, relative to its repo root
  "r": "ky",                          // repo label
  "s": "M",                           // A added · M modified · U untracked · S supporting · I infra
  "u": 1,                             // optional: committed but ALSO has uncommitted edits
  "g": "Option normalisation",        // sidebar section
  "why": "Where the fix lives. …",     // why this file is part of the feature — required, in prose
  "n": ["normalizeRetry", "defaultRetry"]   // nodes to focus when clicked
}
```

## groups

```jsonc
{ "id": "gNorm", "t": "Option normalisation", "n": ["normalizeRetry", "defaultRetry", "retryMethods"] }
```

Every node must be in **exactly one** group. `build.js` enforces this. Group boxes are computed
from member positions, and groups collapse to a single box when clicked.

## edges

Positional arrays: `[from, to, label, kind, flow, "inf"?]`

```jsonc
["kyCtor", "normalizeRetry", "normalizeRetryOptions(options.retry)", "call", 1],
["methodCheck", "normalizeRetry", "reads normalised methods", "data", 1],
["cacheModel", "loadMem", "next event on this instance", "data", 1, "inf"]
```

| position | meaning |
|---|---|
| 0, 1 | source and target `node.id` |
| 2 | label — be specific (`POST /api/x`, `bulk upsert`), not `uses` |
| 3 | `call` · `data` · `http` · `db` |
| 4 | `1` if part of the primary flow, else `0` |
| 5 | `"inf"` if inferred rather than read from a literal call |

A self-edge (`from === to`) renders as a small loop — useful for recursion.

## nodes

```jsonc
{
  "id": "normalizeRetry",                       // unique
  "x": 350, "y": 190,                           // grid: x = 40 + n*310, y in steps of 80–100
  "label": "normalizeRetryOptions()",           // ≤ 23 chars shows fully
  "sub": "source/utils/normalize.ts:28",        // ≤ 25 chars
  "kind": "function",                           // see below
  "st": "M",                                    // same vocabulary as files[].s
  "u": 1,                                       // optional: has uncommitted edits
  "file": "source/utils/normalize.ts",          // default file for this node's segments
  "repo": "ky",                                 // must be a key in meta.repos
  "flow": 3,                                    // optional: position in the primary flow
  "lines": "28–54",                             // optional: derived from segments if omitted
  "summary": "…HTML allowed…",                  // what it does and why it exists
  "segs": [ … ]
}
```

**`kind`** is shown as the node's category label and is free-form, but these are meaningful:
`entry` `function` `handler` `route` `gate` `service` `store` `config` `type` `test` `script`
`infra` `external`. `store` gets a taller box and a distinct colour; `test` gets a dashed
outline.

**`st`** drives the colour bar: `A` green · `M` amber · `U` violet · `S` grey · `I` blue.

### segs — source + explanation

```jsonc
"segs": [
  { "from": 48, "to": 54, "n": "The fix. Defaults first, caller options over them, then …" },
  { "from": 8, "to": 12, "f": "source/utils/normalize.ts", "r": "ky", "n": "…" },
  { "l": [[321, "if (!this.#options.retry.methods.includes(…))"]], "n": "escape hatch — avoid" }
]
```

- `from` / `to` — inclusive line range, read from disk at build time. **Use this.**
- `f` / `r` — optional per-segment file / repo override, for a node whose explanation spans
  files (e.g. an external package documented via its call sites).
- `n` — the explanation. Intent and consequence, not syntax. HTML allowed.
- `l` — literal `[[lineNo, text], …]`. Only for content not on disk; it defeats the whole
  correct-by-construction property, and `verify.js` will hold you to it anyway.

Segments need not be contiguous or ordered — the page marks gaps with `⋮` and preserves true line
numbers. Never fake contiguity.

---

## What build.js rejects

- invalid JSON, or a spec containing the literal `</script>`
- a `repo` not present in `meta.repos`, or a root that doesn't exist
- a missing file, a range past end-of-file, `to < from`, `from < 1`
- duplicate node ids; a node missing `id`, `label`, or numeric `x`/`y`
- an edge referencing an unknown node
- a node in two groups, or in none
- overlapping node boxes
- a file entry referencing an unknown node

## What verify.js rejects

Every displayed line, diffed against the working tree — plus duplicate ids and dangling edges.
Exit code 0 means the page is faithful to the code on disk. Anything else: do not publish.
