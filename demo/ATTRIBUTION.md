# Demo attribution

`demo/demo.html` is generated from **[sindresorhus/ky](https://github.com/sindresorhus/ky)**,
branch `fix-methods`, commit `bf0aeb7` (merge-base with `main`: `4b6cd2f`).

ky is MIT licensed, Copyright (c) Sindre Sorhus. The demo page embeds excerpts of its source
(138 lines across `source/` and `test/`) for the purpose of demonstrating this tool. The full
license text is available in the upstream repository at
<https://github.com/sindresorhus/ky/blob/main/license>.

Neither ky nor its author endorses this tool. The branch was chosen because it is a small,
self-contained, real fix that happens to span types, runtime normalisation and tests — which
exercises the explorer well.

Reproduce it:

```bash
./demo/fetch.sh
node build.js  demo/ky-retry-methods.spec.json demo/demo.html
node verify.js demo/demo.html demo/ky-retry-methods.spec.json
```
