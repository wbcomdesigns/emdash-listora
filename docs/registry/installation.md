## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare:** add `import { sandbox } from "@emdash-cms/cloudflare";` and `sandboxRunner: sandbox(),`. It needs the Workers Paid plan and a `worker_loaders` binding named `LOADER` in your Wrangler config. The EmDash Cloudflare templates ship that binding commented out. EmDash's guide: https://docs.emdashcms.com/deployment/plugin-sandbox/#cloudflare-workers

Stop the dev server and start it again. **Registry** now shows in the admin menu.

**2. The plugin is the engine. Visitor pages come from its site kit.** A registry plugin cannot add pages to your site. Until you copy the kit, its addresses (for example `/listings/`) show your site's 404 page. That is expected. The kit copy below takes one command.

**3. You need Node 22.16 or later** for the `npx emdash seed` step.

Checked on EmDash 1.3.0 with the `blog` template, Node and Cloudflare.

## Install

1. Admin, Registry, search **Listora**, Install, then accept the permissions.
2. From your site's root folder:

   ```bash
   kit="$(mktemp -d)" && git clone --branch v0.6.2 --depth 1 https://github.com/wbcomdesigns/emdash-listora "$kit/emdash-listora" && "$kit/emdash-listora/scripts/add-to-site.sh" .
   ```

3. Run the seed command it printed (Node 22.16 or later). Restart the dev server.
4. Add the menu links it printed in Admin, Menus.
5. Open Listora, Get started in the admin.

After every update, run step 2 with the new tag.

Full guide: https://github.com/wbcomdesigns/emdash-listora/blob/v0.6.2/docs/website/getting-started/install.md
