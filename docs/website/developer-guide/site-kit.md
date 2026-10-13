# Site kit

**Included in Free**

Copy these into an EmDash site after the plugin is installed.

| Path | Role |
| --- | --- |
| `site-kit/listora-ui.css` | Tokens and directory chrome |
| `site-kit/seed/listings.mjs` | Collection fields, taxonomies, 33 NYC listings |
| `site-kit/seed/import/sample.csv` | Import fixture |
| `site-kit/README.md` | Which lab pages exist today |

Lab pages (not yet first-class kit files):

- `src/pages/listings/index.astro`
- `src/pages/listings/[slug].astro`
- `src/pages/listings/submit.astro`
- `src/pages/listings/calendar.astro`
- `src/pages/account/index.astro`

Moving those pages into the kit is the first UX job. See [What to improve next](../ux/next-work.md).

Rules for new CSS:

- Tokens only (`--listora-*`). No new raw hex.
- Logical properties. No `margin-left` / `margin-right`.
- Root wrap: `.listora-block`.
- Lucide icons, stroke 1.75.
- Tap target 44px.
