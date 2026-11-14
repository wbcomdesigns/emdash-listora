#!/usr/bin/env bash
set -euo pipefail

PLUGIN="${LISTORA_PLUGIN:-$(cd "$(dirname "$0")/.." && pwd)}"
LAB="${1:-${LISTORA_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-local}}"

if [[ ! -d "$LAB/src" ]]; then
	echo "No EmDash site found at $LAB (it has no src folder)." >&2
	exit 1
fi

# A site may already have its own page at one of these addresses (an /account/ page is common).
# A file that is not Listora's is never replaced: say which ones are in the way and stop.
FORCE="${2:-}"
blocked=()
for target in src/styles/listora-ui.css src/lib/listora.ts src/lib/listora-strings.ts src/pages/listings/index.astro "src/pages/listings/[slug].astro" \
	src/pages/listings/submit.astro src/pages/listings/calendar.astro src/pages/listings/import.astro src/pages/account/index.astro; do
	if [[ -f "$LAB/$target" ]] && ! grep -qi "listora" "$LAB/$target"; then blocked+=("$target"); fi
done
if (( ${#blocked[@]} )) && [[ "$FORCE" != "--force" ]]; then
	echo "These files already exist in $LAB and are not Listora's, so nothing was copied:" >&2
	printf '  %s\n' "${blocked[@]}" >&2
	echo "Move or rename them, or run again with --force to replace them." >&2
	exit 1
fi

mkdir -p "$LAB/src/layouts"
# The owner edits this file to point at their own layout, so never overwrite it.
[[ -f "$LAB/src/layouts/ListoraLayout.astro" ]] || cp "$PLUGIN/site-kit/layouts/ListoraLayout.astro" "$LAB/src/layouts/ListoraLayout.astro"
# Every other kit file, from the one list in kit-files.sh. The optional in-text Listings block
# (src/listora-block/) does nothing until astro.config.mjs lists it (see the install guide).
# A shared Wbcom file (wbcom-kit.ts) is used by every Wbcom plugin kit on the site. It is copied only
# when the site's copy is missing or has a lower number on its first line ("wbcom-shared: N").
shared_version() { local v; v="$(sed -n '1s/.*wbcom-shared: *\([0-9]*\).*/\1/p' "$1" 2>/dev/null)"; echo "${v:-0}"; }
"$PLUGIN/scripts/kit-files.sh" "$PLUGIN" | while read -r from to; do
	mkdir -p "$(dirname "$LAB/$to")"
	if [[ "$(basename "$from")" == wbcom-* && -f "$LAB/$to" ]] && (( $(shared_version "$PLUGIN/$from") <= $(shared_version "$LAB/$to") )); then
		continue
	fi
	cp "$PLUGIN/$from" "$LAB/$to"
done

echo "Copied site-kit into $LAB"
