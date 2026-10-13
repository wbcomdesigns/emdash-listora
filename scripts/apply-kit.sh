#!/usr/bin/env bash
set -euo pipefail

PLUGIN="${LISTORA_PLUGIN:-$(cd "$(dirname "$0")/.." && pwd)}"
LAB="${LISTORA_LAB:-$(cd "$PLUGIN/.." && pwd)/emdash-local}"

if [[ ! -d "$LAB/src" ]]; then
	echo "Lab site not found at $LAB. Run scripts/setup-lab.sh first." >&2
	exit 1
fi

mkdir -p "$LAB/src/layouts" "$LAB/src/styles" "$LAB/src/lib" "$LAB/src/pages/listings" "$LAB/src/pages/account"

# The owner edits this file to point at their own layout, so never overwrite it.
[[ -f "$LAB/src/layouts/ListoraLayout.astro" ]] || cp "$PLUGIN/site-kit/layouts/ListoraLayout.astro" "$LAB/src/layouts/ListoraLayout.astro"
cp "$PLUGIN/site-kit/listora-ui.css" "$LAB/src/styles/listora-ui.css"
cp "$PLUGIN/site-kit/lib/listora.ts" "$LAB/src/lib/listora.ts"
cp "$PLUGIN/site-kit/pages/listings/index.astro" "$LAB/src/pages/listings/index.astro"
cp "$PLUGIN/site-kit/pages/listings/[slug].astro" "$LAB/src/pages/listings/[slug].astro"
cp "$PLUGIN/site-kit/pages/listings/submit.astro" "$LAB/src/pages/listings/submit.astro"
cp "$PLUGIN/site-kit/pages/listings/calendar.astro" "$LAB/src/pages/listings/calendar.astro"
cp "$PLUGIN/site-kit/pages/listings/import.astro" "$LAB/src/pages/listings/import.astro"
cp "$PLUGIN/site-kit/pages/account/index.astro" "$LAB/src/pages/account/index.astro"

mkdir -p "$LAB/public/vendor"
cp -R "$PLUGIN/site-kit/public/vendor/." "$LAB/public/vendor/"

echo "Copied site-kit into $LAB"
