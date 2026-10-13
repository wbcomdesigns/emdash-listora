1. Install Listora from the registry and confirm the permissions.
2. Create a `listings` collection. The kit ships the field list in `site-kit/seed/`.
3. Copy the site kit into your site: `site-kit/listora-ui.css` to `src/styles/`, `site-kit/lib/listora.ts` to `src/lib/`, and `site-kit/pages/` to `src/pages/`.
4. Add four menu links: `/listings/`, `/listings/submit/`, `/listings/calendar/` and `/account/`.
5. Open Admin, then Get started, and load the sample directory to see 12 listings with reviews.

Your site needs a sandbox runner in `astro.config.mjs`. Without one, EmDash skips sandboxed plugins at startup.

Full steps: https://github.com/wbcomdesigns/emdash-listora/blob/main/site-kit/README.md
