## Before you install

**1. Your site needs a sandbox runner.** Registry plugins run in a sandbox. Until the site has one, Admin, Plugins shows "No plugins configured" and there is no Registry in the menu.

- **Node:** in your site, run `npm install @emdash-cms/sandbox-workerd workerd`, then add `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",` inside `emdash({ ... })` in `astro.config.mjs`.
- **Cloudflare: supported on EmDash 1.4 or later.** On Cloudflare Workers EmDash gives each plugin call a fixed number of requests to the site (10 up to EmDash 1.4, 30 from 1.5). Every page, action and task of this plugin stays within 10, and it is walked on a Cloudflare site for each release. Node sites are not affected.

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
       --branch v0.8.0 \
       https://github.com/wbcomdesigns/emdash-listora \
       "$kit/emdash-listora" &&
     "$kit/emdash-listora/scripts/add-to-site.sh" .
   ```

3. Run the printed seed command. Restart the dev server.
4. Add the printed menu links in Admin, Menus.
5. Open Listora, Get started.

After each update, rerun step 2 with the new tag.

Full guide: https://github.com/wbcomdesigns/emdash-listora/blob/v0.8.0/docs/website/getting-started/install.md
