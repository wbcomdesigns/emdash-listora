# Site kit

**Included in Free**

Copy these into an EmDash site after the plugin is installed.

| Path | Role |
| --- | --- |
| `site-kit/listora-ui.css` | Tokens and directory chrome |
| `site-kit/lib/listora.ts` | Helpers the pages import |
| `site-kit/lib/listora-strings.ts` | Every phrase a visitor can see |
| `site-kit/pages/` | Archive, detail, submit, calendar, account |
| `site-kit/seed/listings.mjs` | Collection fields, taxonomies, 33 NYC listings |
| `site-kit/pages/listings/import.astro` | Import and export, admins only |
| `site-kit/public/vendor/listora-sample.csv` | Sample spreadsheet for import |
| `site-kit/README.md` | Owner apply commands |

Copy pages to `src/pages/` on the site. They expect `../../layouts/Base.astro`. See [Improve the screens](../how-to/improve-the-screens.md) for chrome still thin after apply.

Rules for new CSS:

- Tokens only (`--listora-*`). No new raw hex.
- Logical properties. No `margin-left` / `margin-right`.
- Root wrap: `.listora-block`.
- Lucide icons, stroke 1.75.
- Tap target 44px.
