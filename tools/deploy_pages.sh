#!/usr/bin/env bash
# Build the web version and publish dist/ to the gh-pages branch of origin (GitHub Pages).
#   tools/deploy_pages.sh            build, then publish
#   tools/deploy_pages.sh --no-build publish the dist/ that is already there
# The site is served at https://<user>.github.io/<repo>/ ; vite's base is './' so the build is path-agnostic.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--no-build" ]; then
  npm run build
fi
[ -f dist/index.html ] || { echo "dist/index.html missing: build first" >&2; exit 1; }

remote=$(git remote get-url origin)
sha=$(git rev-parse --short HEAD)
name=$(git config user.name)
email=$(git config user.email)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r dist/. "$tmp"
# Without this file GitHub runs Jekyll, which drops files and folders that start with an underscore.
touch "$tmp/.nojekyll"

cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $sha"
git push -q -f "$remote" gh-pages
echo "published $sha to gh-pages"
