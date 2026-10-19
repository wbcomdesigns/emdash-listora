#!/usr/bin/env bash
# The one list of kit files: "<path in this repo> <path in the site>", one pair per line.
# apply-kit.sh copies them, add-to-site.sh backs up a changed one, kit-sums.sh hashes them.
# ListoraLayout.astro is not listed: it is copied once and never replaced (apply-kit.sh).
# Usage: kit-files.sh [<plugin dir>]   (lists what exists in that checkout)
set -euo pipefail
PLUGIN="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cat <<'MAP'
site-kit/listora-ui.css src/styles/listora-ui.css
site-kit/lib/listora.ts src/lib/listora.ts
site-kit/lib/listora-strings.ts src/lib/listora-strings.ts
site-kit/pages/listings/index.astro src/pages/listings/index.astro
site-kit/pages/listings/[slug].astro src/pages/listings/[slug].astro
site-kit/pages/listings/submit.astro src/pages/listings/submit.astro
site-kit/pages/listings/calendar.astro src/pages/listings/calendar.astro
site-kit/pages/listings/import.astro src/pages/listings/import.astro
site-kit/pages/account/index.astro src/pages/account/index.astro
MAP
(cd "$PLUGIN" && find site-kit/blocks -type f | sort | while read -r f; do echo "$f src/listora-block/${f#site-kit/blocks/}"; done)
(cd "$PLUGIN" && find site-kit/public -type f | sort | while read -r f; do echo "$f ${f#site-kit/}"; done)
