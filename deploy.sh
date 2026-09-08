#!/usr/bin/env bash
# Build the game and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")"
npm run build
cd dist
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.email="${GIT_AUTHOR_EMAIL:-olliemackman@gmail.com}" -c user.name="${GIT_AUTHOR_NAME:-Oliver Mackman}" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q -f https://github.com/olliemackman-web/tycoon-shooter.git gh-pages
rm -rf .git
echo "Deployed: https://olliemackman-web.github.io/tycoon-shooter/"
