#!/usr/bin/env bash
# Publish site/ (the Bulssi Studio developer page and app-ads.txt) to the user site repository KYMMMM01/kymmmm01.github.io,
# served at https://kymmmm01.github.io/ (the domain root, which app-ads.txt needs). The game itself stays at /Project1/ (tools/deploy_pages.sh).
#   tools/deploy_site.sh
# The repository must already exist on GitHub (public, empty is fine) and GitHub Pages must serve its main branch.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f site/index.html ] || { echo "site/index.html missing" >&2; exit 1; }
remote="https://github.com/KYMMMM01/kymmmm01.github.io.git"
sha=$(git rev-parse --short HEAD)
name=$(git config user.name)
email=$(git config user.email)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r site/. "$tmp"
touch "$tmp/.nojekyll"

cd "$tmp"
git init -q -b main
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Site $sha"
git push -q -f "$remote" main
echo "published site from $sha to kymmmm01.github.io"
