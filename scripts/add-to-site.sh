#!/usr/bin/env bash
# Adds Listora's visitor pages (the site kit) to an EmDash site. Run it from a checkout of the
# release tag that matches the plugin version installed on the site:
#
#   kit="$(mktemp -d)" && git clone --branch v<version> --depth 1 https://github.com/wbcomdesigns/emdash-listora "$kit/emdash-listora" && "$kit/emdash-listora/scripts/add-to-site.sh" .
#
# Safe to run again after every plugin update: it replaces Listora's own files, never touches
# src/layouts/ListoraLayout.astro once it exists, and backs up a wording file you changed.
set -euo pipefail

PLUGIN="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$(cd "${1:-.}" && pwd)"
VERSION="$(node -p 'require(process.argv[1]).version' "$PLUGIN/package.json")"

if ! ls "$SITE"/astro.config.* >/dev/null 2>&1 || ! grep -q "emdash" "$SITE"/astro.config.* || [[ ! -d "$SITE/src" ]]; then
	echo "$SITE is not an EmDash site (no src folder, or no astro.config that loads emdash)." >&2
	echo "Run this from your site's root folder: $0 ." >&2
	exit 1
fi

# The kit must match the installed plugin. A checkout of main can be ahead of the registry.
tag="$(git -C "$PLUGIN" describe --tags --exact-match 2>/dev/null || true)"
if [[ "$tag" != "v$VERSION" ]]; then
	echo "Note: this checkout is not the release tag v$VERSION. Use the tag of the version installed on your site:" >&2
	echo '  kit="$(mktemp -d)" && git clone --branch v<version> --depth 1 https://github.com/wbcomdesigns/emdash-listora "$kit/emdash-listora" && "$kit/emdash-listora/scripts/add-to-site.sh" .' >&2
fi

first_run=1
[[ -f "$SITE/src/layouts/ListoraLayout.astro" ]] && first_run=0

# A wording file the owner changed is kept as a dated copy before the new one replaces it.
strings="$SITE/src/lib/listora-strings.ts"
backup=""
if [[ -f "$strings" ]] && ! cmp -s "$strings" "$PLUGIN/site-kit/lib/listora-strings.ts"; then
	backup="$strings.bak-$(date +%Y%m%d)"
	[[ -e "$backup" ]] && backup="$strings.bak-$(date +%Y%m%d-%H%M%S)"
	cp "$strings" "$backup"
fi

"$PLUGIN/scripts/apply-kit.sh" "$SITE" "${2:-}" >/dev/null
seed="$(node "$PLUGIN/scripts/site-seed.mjs" "$SITE")"

cat <<DONE
Copied the Listora $VERSION site kit into $SITE

  Pages    src/pages/listings/ (directory, one listing, add a listing, calendar, import and export)
           src/pages/account/  (owner dashboard)
  Styles   src/styles/listora-ui.css, src/lib/listora.ts, public/vendor/
  Wording  src/lib/listora-strings.ts
  Layout   src/layouts/ListoraLayout.astro $([[ $first_run == 1 ]] && echo "(new)" || echo "(yours, left as it is)")
  Block    src/listora-block/ (optional Listings block for post text, off until you add it to astro.config.mjs)
  Seed     $seed
DONE
if [[ -n "$backup" ]]; then
	echo
	echo "  Your changed wording was saved as ${backup#"$SITE/"}. Copy your phrases back into src/lib/listora-strings.ts."
fi
cat <<DONE

Left for you:

  1. Create the listings collection (Node 22.16 or later; it skips anything that already exists):
       cd "$SITE" && npx emdash seed .emdash/listora-seed.json --no-content
     Add -d <file> if your database is not ./data.db. On a hosted site, create it in the
     admin instead: Content Types, New, slug "listings" (the install guide lists the fields).
  2. Templates: nothing to paste. Every Listora page is a whole page. It uses your layout
     through src/layouts/ListoraLayout.astro, which expects src/layouts/Base.astro taking
     title and description (the EmDash templates). If yours differs, change that one file.
  3. Stop the dev server and start it again, so the new pages load.
  4. In the admin, Menus: add these links to your menu.
       /listings/            Listings
       /listings/submit/     Add a listing
       /listings/calendar/   Calendar
       /account/             Account
  5. Open /listings/, /listings/submit/, /listings/calendar/ and /account/.

Install guide: https://github.com/wbcomdesigns/emdash-listora/blob/v$VERSION/docs/website/getting-started/install.md
DONE
