## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare: not supported yet.** On Cloudflare Workers EmDash gives each plugin call 10 requests to the site. From 0.7.0 every page, action and task of this plugin fits in that limit by its tests, but it has not yet passed a walk on a Cloudflare site, so treat Cloudflare as not supported until it does. Node sites are not affected.

Stop the dev server and start it again. **Registry** now shows in the admin menu.

**2. The plugin is the engine. Visitor pages come from its site kit.** A registry plugin cannot add pages to your site. Until you copy the kit, its addresses (for example `/listings/`) show your site's 404 page. That is expected. The kit copy below takes one command.

**3. You need Node 22.16 or later** for the `npx emdash seed` step.

Checked on EmDash 1.3.1 with the `blog` template on Node.

## Install

1. Admin, Registry, search **Listora**, Install, then accept the permissions.
2. From your site's root folder:

   ```bash
   kit="$(mktemp -d)" &&
     git clone --depth 1 \
       --branch v0.7.0 \
       https://github.com/wbcomdesigns/emdash-listora \
       "$kit/emdash-listora" &&
     "$kit/emdash-listora/scripts/add-to-site.sh" .
   ```

3. Run the printed seed command. Restart the dev server.
4. Add the printed menu links in Admin, Menus.
5. Open Listora, Get started.

After each update, rerun step 2 with the new tag.

Full guide: https://github.com/wbcomdesigns/emdash-listora/blob/v0.7.0/docs/website/getting-started/install.md
