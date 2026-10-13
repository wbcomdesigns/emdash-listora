# Listora site kit

Copy these into an EmDash site after the sandboxed plugin is installed.

- `listora-ui.css` - `--listora-*` tokens, directory chrome, and form primitives (label, helper, error, type cards, form section, empty). See `docs/website/how-to/form-presentation.md`.
- `seed/listings.mjs` - collection fields, taxonomies, 33 NYC listings
- `seed/import/sample.csv` - Drop 6 import fixture

Pages live on the lab as:

- `src/pages/listings/index.astro`
- `src/pages/listings/[slug].astro`
- `src/pages/listings/submit.astro`
- `src/pages/listings/calendar.astro`
- `src/pages/account/index.astro`

Reset and prove from the plugin repo:

```bash
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```
