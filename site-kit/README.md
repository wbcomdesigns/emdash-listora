# Listora site kit

The plugin is the engine. This folder is what an EmDash site owner copies so visitors get `/listings/`.

Install `@vapvarun.bsky.social/listora` first (or the local package). Then apply this kit. The plugin alone does not create pages.

## Apply on a site

From your site's root folder, with the tag of the Listora version installed on the site:

```bash
kit="$(mktemp -d)" &&
  git clone --depth 1 \
    --branch v0.6.2 \
    https://github.com/wbcomdesigns/emdash-listora \
    "$kit/emdash-listora" &&
  "$kit/emdash-listora/scripts/add-to-site.sh" .
```

It copies everything in this folder to the right place, writes a seed for the listings collection, keeps a dated backup of the wording file only if you changed it, and prints the seed command (Node 22.16 or later), the menu links to add in Admin, Menus, and the restart step. Run it again with the new tag after each plugin update: it never replaces `src/layouts/ListoraLayout.astro` once it exists. The full steps, starting with what the site needs before you install, are in [Set up Listora on your site](../docs/website/getting-started/install.md).

## Connect it to your design

Every Listora page is wrapped in `src/layouts/ListoraLayout.astro`, and that file hands the page to your site's own layout. It expects `src/layouts/Base.astro` taking `title` and `description`, which is what the EmDash templates ship. If your layout has another name or other props, change that one file. No Listora page needs editing, and a kit update never replaces it.

Colours and fonts come from your site: the kit reads `--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-brand`, `--color-on-brand` and `--font-body` when they exist, and falls back to its own neutral set when they do not.

Every phrase a visitor sees is in `site-kit/lib/listora-strings.ts` (copied to `src/lib/listora-strings.ts`). Change it there, then rebuild. Running the setup command again replaces that file. If you changed it, your copy is saved next to it as `listora-strings.ts.bak-YYYYMMDD` first; an untouched file is replaced without a backup. The steps are in [Reword the directory](../docs/website/customize/wording.md).

Checked on EmDash 1.3.1 with the `blog` template on Node. The Cloudflare lines follow EmDash's own guide; we have not run them on a Cloudflare site yet.

Collection: `npx emdash seed .emdash/listora-seed.json --no-content` in your site (Node 22.16 or later), after the setup command.

Sample rows: Admin, Listora, Get started, **Load sample directory** (12 NYC listings with reviews and a claim, plus two waiting for approval).

In Admin, Menus, add four links: `/listings/`, `/listings/submit/`, `/listings/calendar/`, `/account/`.

Import and export: `/listings/import/` is for site admins only (everyone else sees a short notice), so it needs no menu link. Settings in the admin links to it. A sample spreadsheet is at `/vendor/listora-sample.csv`.

`astro.config.mjs` must load the sandbox runner and the plugin. See [Install](../docs/website/getting-started/install.md).

## Before you add it to a live site

- **EmDash version.** Checked on EmDash 1.3.1. Update the site first.
- **Maps.** Leaflet ships in `site-kit/public/vendor/leaflet/`, so a site that only allows its own scripts and styles needs no change. Map tiles are images from `tile.openstreetmap.org`.
- **Caching.** `/account/` and `/listings/submit/` differ per visitor and send `Cache-Control: private, no-store`. If your site's Worker adds its own cache rules, make sure these two paths stay uncached.
- **Slugs.** A page with the slug `listings` or `account` would be hidden by the kit pages. Rename it first.
- **Sign-in.** The sign-in links go to `/_emdash/admin/login`. If your admin lives on another host, change `signInUrl()` in `src/lib/listora.ts`.
- **Members.** Turn on member sign-up in EmDash, or only your own staff can add listings and reviews.
- **Permissions.** The plugin can create, change and publish content. It only ever touches the `listings` collection.
- **Try it on a preview first.** Deploy a preview version, walk `docs/qa/QA_CHECKLIST.md` there, then go live.

## Who can do what

Guests browse, search and message a listing. Adding a listing, reviewing, saving, claiming and `/account/` need a signed-in EmDash account. Guests get a sign-in link that returns them to the page they were on.

## What you should see

- `/listings/` command search, sideways type chips, featured track, cards
- `/listings/{slug}/` cover, tabs, review / contact / claim
- `/listings/submit/` five-step wizard
- `/listings/calendar/` events
- `/account/` owner dashboard (no Credits tab)
- Admin, Listora: Get started, Listings queue, Listing reviews, Claims, Messages, Settings

A guest's first visit to `/listings/` or a listing logs one `401` from the `favorites` check in the browser console. That is expected.

## Working on this plugin

Lab only, never on a real site:

```bash
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```
