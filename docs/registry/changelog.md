## 0.8.1

Fixes from the QA pass. No new permissions. Copy the kit again after you update, from your site's root folder:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.8.1 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

- Improve: listers choose to show their email; off by default, so existing listings start hidden. Run the printed seed command.
- Improve: the add form starts on your Default listing type.
- Improve: the queue shows where each listing is and who sent it; a waiting claim shows as waiting.
- Fix: long words wrap on the listing page and in admin tables.
- Fix: text over its limit is refused, never cut; the forms show the limit.
- Fix: no upgrade note on a new install; "Listing settings saved."
- Fix: admin lists page with Next page; GitHub numbers show only when ahead of yours.

## 0.8.0

Listing types you can edit, custom fields and a Software type. No new permissions. Copy the kit again after you update.

After the update the site shows "finishing an update" for a short time while new indexes build. The data then catches up by itself in the background within hours; no admin visit needed.

- New: a Listing types admin page; add types, rename, recolour or hide built-ins.
- New: custom fields per type on the forms, listing page, cards and CSV.
- New: types without a place hide the map, city, address and hours.
- New: a Software type with an Install box, live GitHub stars and filter chips.
- New: sort a type by its number or date fields, either way; Managed by its author badge.
- Improve: the directory pages through the index; keywords use EmDash search; listings show under every category, and admin category changes follow within a few hours, or at once with Refresh categories now on the Settings page.
- Fix: Calendar only for events; sample load no longer duplicates; required yes or no takes No.
- Compat: needs EmDash 1.2.0 or later.
