# Set up Listora on your site

This takes a developer about ten minutes. The plugin gives you the directory engine and the admin screens. Your site's own pages (`/listings/` and the rest) come from a kit of files that one command copies in, because an EmDash plugin cannot add pages to a site by itself.

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
2. From your site's root folder, get the kit for the version you just installed and copy it in:

   ```bash
   git clone --branch v0.6.2 --depth 1 https://github.com/wbcomdesigns/emdash-listora /tmp/emdash-listora
   /tmp/emdash-listora/scripts/add-to-site.sh .
   ```

   The script copies the directory pages, styles and scripts, never replaces `src/layouts/ListoraLayout.astro` once it exists, keeps a dated backup of `src/lib/listora-strings.ts` if you changed it (`listora-strings.ts.bak-YYYYMMDD`), writes the seed for the listings collection, and prints the exact commands and menu links. If your site already has its own page at one of the kit's addresses (an `/account/` page, for example), it stops, names the file and copies nothing.

3. Create the listings collection with the command it printed. It needs Node 22.16 or later:

   ```bash
   npx emdash seed .emdash/listora-seed.json --no-content
   ```

   This adds the `listings` collection, its fields and four taxonomies (categories, features, locations, tags). It skips anything that already exists and adds no content. Add `-d <file>` if your database is not `./data.db`. On a hosted site whose database you cannot reach from the command line, create the collection in the admin instead: Content Types, New, slug `listings`, then add the fields listed in `.emdash/listora-seed.json`.

4. There is nothing to paste into your templates: every Listora page is a whole page. Stop the dev server and start it again.
5. In Admin, Menus, add `/listings/` (Listings), `/listings/submit/` (Add a listing), `/listings/calendar/` (Calendar) and `/account/` (Account).
6. Open the admin, Listora, Get started. When the pages work, press **Visitor pages are set up**.

After every plugin update, run step 2 again with the new tag. The phrases visitors read live in `src/lib/listora-strings.ts`; see [Reword the directory](../customize/wording.md).

## Point the layout at your site

Open `src/layouts/ListoraLayout.astro`. It wraps every Listora page in `src/layouts/Base.astro` with `title` and `description`, which is what the EmDash templates ship. If your layout has another name or other props, change that one file.

Colours and fonts come from your site: the kit reads `--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-brand`, `--color-on-brand` and `--font-body` when they exist, and uses its own neutral set when they do not.

## Check four addresses

Start the site and open each one:

| Address | You should see |
| --- | --- |
| `/listings/` | The directory, empty until you add a listing |
| `/listings/submit/` | A sign-in prompt, or the add-a-listing form when signed in |
| `/listings/calendar/` | The events calendar |
| `/account/` | A sign-in prompt, or the owner dashboard when signed in |

To see it full first, open the admin, Listora, Get started, and choose **Load sample directory** (12 listings with reviews, plus two waiting in the Listings queue so you can try an approval). Then set your options under Listora, Settings. Import and export is at `/listings/import/` for site admins.

## Optional: a Listings block inside post and page text

The setup command also copies a small block into `src/listora-block/`. It does nothing until you switch it on in `astro.config.mjs`:

```js
import { listoraBlock } from "./src/listora-block/descriptor.mjs";

emdash({
	plugins: [listoraBlock()],
	// ...the rest of your options
});
```

Restart the site. In any post or page, type `/listings` in the text, choose **Listings**, and fill in the form: a heading, a listing type, a category name, a city and how many to show (all optional). The block draws that many listing cards at that spot. If nothing matches, the block shows nothing.

This part runs as trusted site code, not inside the plugin sandbox, which is why it lives in your site and is switched on by hand. EmDash does not let a registry plugin add blocks to text. The plugin works the same with or without it.

## In the browser console

A guest's first visit to `/listings/` or to a listing shows one `401` from the `favorites` request, the check for listings the visitor saved. That is expected: the page is fine, and the browser does not ask again until the visitor signs in.

## Good to know

- **Email.** Notices to owners need email set up on your site. Without it, messages still arrive in the owner's account.
- **Photos.** Owner photos need the `gallery` field, which the seed above creates. Settings shows a notice if it is missing.
- **Caching.** Public directory data is cached for 30 seconds.
- **Updating.** After a plugin update, run the setup command again to refresh the kit files.

## Working on the plugin itself

See [Set up a new machine](../../dev/new-machine.md) and [Local lab](../../dev/local-lab.md).
