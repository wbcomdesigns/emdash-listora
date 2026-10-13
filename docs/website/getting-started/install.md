# Install the plugin

**Included in Free**

Two install paths. Use the lab path while you change code. Use the registry path on a real EmDash site after the listing is approved.

## Lab (developers)

The plugin is a local package. From the site:

```bash
# site: ~/code/emdash-local
# plugin: ~/code/emdash-listora (often linked as node_modules/@wbcomdesigns/listora)
```

`astro.config.mjs` must load the sandbox runner and the plugin:

```js
import emdash from "emdash/astro";
import listora from "@wbcomdesigns/listora";

export default defineConfig({
  integrations: [
    emdash({
      sandboxed: [listora],
      sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",
    }),
  ],
});
```

No runner means EmDash skips sandboxed plugins and registry install fails.

After a DB wipe, open the dev-bypass once so seed listings actually insert:

`http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`

Health check: `http://localhost:4321/_emdash/api/plugins/listora/health`

## Registry (a site owner)

1. Site has a sandbox runner (Node workerd locally, Cloudflare `sandbox()` in production).
2. Admin → Registry.
3. Search `@vapvarun.bsky.social/listora`.
4. Review capabilities, then Install.

Until the labeler approves `0.1.0`, the public page stays empty:

https://plugins.emdashcms.com/plugins/@vapvarun.bsky.social/listora

After install:

1. Open Admin → Get started.
2. Create a `listings` collection on the site if the page says it is missing.
3. Click **Load sample directory**. That writes 12 NYC listings, reviews, favorites, and a pending claim. It does not run on health. Empty production stays empty until you click.
4. Apply `site-kit/` (CSS, `lib/listora.ts`, pages, four menu links). The plugin alone does not create `/listings/` pages.

Exact copy commands: [site-kit/README.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/site-kit/README.md). The lab can still use `site-kit/seed/listings.mjs` for the larger 33-listing pack.
