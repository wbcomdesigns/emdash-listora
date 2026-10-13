#!/usr/bin/env bash
# Adds the directory pages to an EmDash site. Safe to run again after a plugin update:
# it replaces Listora's own files and never touches src/layouts/ListoraLayout.astro once it exists.
set -euo pipefail

PLUGIN="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$(cd "${1:-.}" && pwd)"

if ! ls "$SITE"/astro.config.* >/dev/null 2>&1 || ! grep -q "emdash" "$SITE"/astro.config.*; then
	echo "$SITE is not an EmDash site (no astro.config that loads emdash)." >&2
	echo "Usage: $0 /path/to/your/site" >&2
	exit 1
fi

first_run=1
[[ -f "$SITE/src/layouts/ListoraLayout.astro" ]] && first_run=0

"$PLUGIN/scripts/apply-kit.sh" "$SITE" >/dev/null
seed="$(node "$PLUGIN/scripts/site-seed.mjs" "$SITE")"

cat <<DONE
Done in $SITE

  Pages    src/pages/listings/ (directory, one listing, add a listing, calendar, import and export)
           src/pages/account/  (owner dashboard)
  Styles   src/styles/listora-ui.css, src/lib/listora.ts, public/vendor/
  Layout   src/layouts/ListoraLayout.astro $([[ $first_run == 1 ]] && echo "(new)" || echo "(yours, left as it is)")
  Block    src/listora-block/ (optional Listings block for post text, off until you add it to astro.config.mjs)
  Seed     ${seed#"$SITE/"} (the listings collection, no content)

Left for you:

  1. Create the listings collection (skips anything that already exists):
       cd "$SITE" && npx emdash seed .emdash/listora-seed.json --no-content
     Add -d <file> if your database is not ./data.db. On a hosted site, create it in
     the admin instead: Content Types, New, slug "listings" (the guide lists the fields).
  2. Open src/layouts/ListoraLayout.astro. If your site's layout is not
     src/layouts/Base.astro taking title and description, point it at yours.
  3. In the admin, Menus: add /listings/, /listings/submit/, /listings/calendar/, /account/.
  4. Start the site and open /listings/, /listings/submit/, /listings/calendar/, /account/.

Guide: $PLUGIN/docs/website/getting-started/install.md
DONE
