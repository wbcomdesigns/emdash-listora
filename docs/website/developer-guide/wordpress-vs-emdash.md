# WordPress Listora versus this plugin

**Included in Free**

WordPress Listora 1.9.0 (`wb-listora`) is the product we are matching. Read [ops/listora-as-built.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/listora-as-built.md) before you invent a field or a screen.

## Same jobs

- 10 default listing types
- Faceted search, map, calendar
- Frontend submit with moderation
- Reviews, claims, favorites
- Owner dashboard
- CSV / GeoJSON import
- Admin queues

## Different machinery

| WordPress | EmDash |
| --- | --- |
| CPT `listora_listing` | Host collection `listings` |
| REST `listora/v1`, IAPI `listora/directory` | Plugin routes under `/_emdash/api/plugins/listora/` |
| 11 Gutenberg blocks | Astro pages plus site-kit CSS |
| `wb_listora_features` | Manifest settings plus parked Pro |
| wp-admin CSS | Block Kit (Kumo). Match IA, not pixels |
| `$wpdb`, WP-CLI | `ctx.content`, `ctx.storage`, `ctx.kv.set` |

`ctx.kv.put` does not exist. Use `ctx.kv.set`.

EmDash assigns ULIDs when it seeds content. Demo reviews match a listing by slug as well as id (`the-golden-fork`), because seed ids like `listing-golden-fork` never appear in the host.

## Visual source

Screenshot WordPress Listora on a real site. Do not invent a second look "because Astro". Tokens and class names come from `--listora-*` and `listora-*` blocks. Marketing taste-skill does not apply to directory screens. Public pages follow `ux-foundation` and `web-page-spec`.
