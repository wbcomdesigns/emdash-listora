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

mkdir -p "$LAB/src/layouts" "$LAB/src/styles" "$LAB/src/lib" "$LAB/src/pages/listings" "$LAB/src/pages/account"

# The owner edits this file to point at their own layout, so never overwrite it.
[[ -f "$LAB/src/layouts/ListoraLayout.astro" ]] || cp "$PLUGIN/site-kit/layouts/ListoraLayout.astro" "$LAB/src/layouts/ListoraLayout.astro"
cp "$PLUGIN/site-kit/listora-ui.css" "$LAB/src/styles/listora-ui.css"
cp "$PLUGIN/site-kit/lib/listora.ts" "$LAB/src/lib/listora.ts"
cp "$PLUGIN/site-kit/lib/listora-strings.ts" "$LAB/src/lib/listora-strings.ts"
cp "$PLUGIN/site-kit/pages/listings/index.astro" "$LAB/src/pages/listings/index.astro"
cp "$PLUGIN/site-kit/pages/listings/[slug].astro" "$LAB/src/pages/listings/[slug].astro"
cp "$PLUGIN/site-kit/pages/listings/submit.astro" "$LAB/src/pages/listings/submit.astro"
cp "$PLUGIN/site-kit/pages/listings/calendar.astro" "$LAB/src/pages/listings/calendar.astro"
cp "$PLUGIN/site-kit/pages/listings/import.astro" "$LAB/src/pages/listings/import.astro"
cp "$PLUGIN/site-kit/pages/account/index.astro" "$LAB/src/pages/account/index.astro"
# The optional in-text Listings block. It does nothing until astro.config.mjs lists it (see the install guide).
mkdir -p "$LAB/src/listora-block"
cp "$PLUGIN"/site-kit/blocks/* "$LAB/src/listora-block/"

mkdir -p "$LAB/public/vendor"
cp -R "$PLUGIN/site-kit/public/vendor/." "$LAB/public/vendor/"

echo "Copied site-kit into $LAB"
