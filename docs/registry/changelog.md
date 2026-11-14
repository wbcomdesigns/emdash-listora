## 0.8.0

Listing types you can edit, custom fields and a Software type. No new permissions. Copy the kit again after you update, from your site's root folder:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.8.0 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

After the update the site shows "finishing an update" for a short time while new indexes build. The data then catches up by itself in the background within hours; no admin visit needed.

- New: a Listing types admin page; add types, rename, recolour or hide built-ins.
- New: custom fields per type on the forms, listing page, cards and CSV.
- New: types without a place hide the map, city, address and hours.
- New: a Software type with an Install box, live GitHub stars and filter chips.
- New: sort a type by its number or date fields; Managed by its author badge.
- Improve: the directory pages through the index; keywords use EmDash search; listings show under every category.
- Fix: Calendar only for events; sample load no longer duplicates.
- Compat: needs EmDash 1.2.0 or later.

## 0.7.1

- Fix: the first visitor after an update starts the data upgrade.
- Fix: import on a slow site goes on where it stopped.
- Fix: Messages says when the site cannot send email.

## 0.7.0

Fits Cloudflare's 10 requests per plugin call.

- New: Listing changes and Listing photos admin pages.
- Improve: a stored directory index and exact ratings.

Older versions: https://github.com/wbcomdesigns/emdash-listora/blob/main/CHANGELOG.md
