#!/usr/bin/env bash
# Writes site-kit/kit.sums: "<sha256>  <site path>" for every kit file at every released tag
# and in this checkout. add-to-site.sh replaces a site file silently only when its hash is one
# of these for that path; anything else was edited by the owner and is backed up first.
# Run it at every release. `kit-sums.sh --check` fails when the file is out of date.
set -euo pipefail
PLUGIN="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PLUGIN"
sha() { node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(0)).digest("hex"))'; }
map="$(scripts/kit-files.sh "$PLUGIN")"
# --check needs no tags (a shallow clone has none): every kit file in this checkout must be listed.
if [[ "${1:-}" == "--check" ]]; then
	missing=""
	while read -r from to; do grep -qxF "$(sha <"$from")  ${to}" site-kit/kit.sums || missing+="  ${to}"$'\n'; done <<<"$map"
	if [[ -n "$missing" ]]; then
		printf 'site-kit/kit.sums does not list this version of:\n%sRun scripts/kit-sums.sh (in a clone with tags).\n' "$missing" >&2
		exit 1
	fi
	echo "site-kit/kit.sums lists every kit file in this checkout"
	exit 0
fi
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
{
	for tag in $(git tag --list 'v*' --sort=creatordate); do
		while read -r from to; do
			git cat-file -e "${tag}:${from}" 2>/dev/null || continue
			echo "$(git show "${tag}:${from}" | sha)  ${to}"
		done <<<"$map"
	done
	while read -r from to; do echo "$(sha <"$from")  ${to}"; done <<<"$map"
} | awk '!seen[$0]++' >"$out"
[[ -n "$(git tag --list 'v*')" ]] || { echo "No release tags here: fetch them (git fetch --tags --force) before writing kit.sums" >&2; exit 1; }
cp "$out" site-kit/kit.sums
echo "Wrote site-kit/kit.sums ($(wc -l <site-kit/kit.sums | tr -d ' ') lines)"
