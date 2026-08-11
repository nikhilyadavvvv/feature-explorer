#!/usr/bin/env bash
# Fetch the repository the demo analyses, so `demo.html` can be rebuilt and verified
# from scratch by anyone. Clones into demo/.cache/ky (gitignored) and checks out the
# feature branch, because the explorer describes the WORKING TREE, not a commit range.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="$DIR/.cache/ky"
BRANCH="fix-methods"

if [ -d "$CACHE/.git" ]; then
  echo "· ky already cloned at demo/.cache/ky"
else
  echo "· cloning sindresorhus/ky → demo/.cache/ky"
  mkdir -p "$(dirname "$CACHE")"
  git clone --quiet https://github.com/sindresorhus/ky.git "$CACHE"
fi

git -C "$CACHE" fetch --quiet origin "$BRANCH" main
git -C "$CACHE" checkout --quiet "$BRANCH"

echo "· branch:     $(git -C "$CACHE" branch --show-current)"
echo "· merge-base: $(git -C "$CACHE" merge-base main HEAD)"
echo
echo "Now rebuild and verify the demo:"
echo "  node build.js  demo/ky-retry-methods.spec.json demo/demo.html"
echo "  node verify.js demo/demo.html demo/ky-retry-methods.spec.json"
