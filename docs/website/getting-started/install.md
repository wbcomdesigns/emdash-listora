# Set up Listora on your site

This takes a developer about ten minutes. The plugin gives you the directory engine and the admin screens. Your site's own pages (`/listings/` and the rest) come from a kit of files that one command copies in, because an EmDash plugin cannot add pages to a site by itself.

You need: an EmDash 1.2 site with a sandbox runner (Node `@emdash-cms/sandbox-workerd` locally, Cloudflare `sandbox()` in production), and Node 22.16 or later.

## 1. Install the plugin

In the admin: Registry, search `@vapvarun.bsky.social/listora`, review what it asks for, Install.

## 2. Run the setup command

```bash
git clone --depth 1 https://github.com/wbcomdesigns/emdash-listora
emdash-listora/scripts/add-to-site.sh /path/to/your/site
```

It copies the directory pages, styles and scripts into your site, writes a small seed file for the listings collection, and prints what is left. It is safe to run again after every plugin update: it replaces Listora's own files and never touches `src/layouts/ListoraLayout.astro` once that file exists.

## 3. Create the listings collection

```bash
cd /path/to/your/site
npx emdash seed .emdash/listora-seed.json --no-content
```

This adds the `listings` collection, its fields and four taxonomies (categories, features, locations, tags). It skips anything that already exists and adds no content. Add `-d <file>` if your database is not `./data.db`.

On a hosted site whose database you cannot reach from the command line, create the collection in the admin instead: Content Types, New, slug `listings`, then add the fields listed in `.emdash/listora-seed.json`. We have only proven the command on a local SQLite site.

## 4. Point the layout at your site

Open `src/layouts/ListoraLayout.astro`. It wraps every Listora page in `src/layouts/Base.astro` with `title` and `description`, which is what the EmDash templates ship. If your layout has another name or other props, change that one file.

Colours and fonts come from your site: the kit reads `--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-brand`, `--color-on-brand` and `--font-body` when they exist, and uses its own neutral set when they do not.

## 5. Add the menu links

In the admin, Menus, add: `/listings/`, `/listings/submit/`, `/listings/calendar/`, `/account/`.

## 6. Check four addresses

Start the site and open each one:

| Address | You should see |
| --- | --- |
| `/listings/` | The directory, empty until you add a listing |
| `/listings/submit/` | A sign-in prompt, or the add-a-listing form when signed in |
| `/listings/calendar/` | The events calendar |
| `/account/` | A sign-in prompt, or the owner dashboard when signed in |

To see it full first, open the admin, Listora, Listings queue, and choose **Load sample directory** (12 sample listings with reviews). Then set your options under Listora, Settings. Import and export is at `/listings/import/` for site admins.

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

## Good to know

- **Email.** Notices to owners need email set up on your site. Without it, messages still arrive in the owner's account.
- **Photos.** Owner photos need the `gallery` field, which the seed above creates. Settings shows a notice if it is missing.
- **Caching.** Public directory data is cached for 30 seconds.
- **Updating.** After a plugin update, run the setup command again to refresh the kit files.

## Working on the plugin itself

See [Set up a new machine](new-machine.md) and [Local lab](local-lab.md).
