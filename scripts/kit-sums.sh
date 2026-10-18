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
if [[ "${1:-}" == "--check" ]]; then
	if ! cmp -s "$out" site-kit/kit.sums; then
		echo "site-kit/kit.sums is out of date: run scripts/kit-sums.sh" >&2
		exit 1
	fi
	echo "site-kit/kit.sums is up to date"
	exit 0
fi
cp "$out" site-kit/kit.sums
echo "Wrote site-kit/kit.sums ($(wc -l <site-kit/kit.sums | tr -d ' ') lines)"
