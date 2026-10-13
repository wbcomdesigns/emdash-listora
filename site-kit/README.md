# Listora site kit

The plugin is the engine. This folder is what an EmDash site owner copies so visitors get `/listings/`.

Install `@vapvarun.bsky.social/listora` first (or the local package). Then apply this kit. The plugin alone does not create pages.

## Apply on a site

On the lab, prefer `./scripts/apply-kit.sh` (or `./scripts/setup-lab.sh` the first time). Manual copy from the site root (`src/` is the Astro app):

```bash
K=path/to/listora/site-kit

# The one file that connects the Listora pages to your design (see below)
mkdir -p src/layouts src/styles src/lib src/pages/listings src/pages/account public/vendor
cp $K/layouts/ListoraLayout.astro src/layouts/ListoraLayout.astro

cp $K/listora-ui.css src/styles/listora-ui.css
cp $K/lib/listora.ts src/lib/listora.ts
cp $K/pages/listings/*.astro src/pages/listings/
cp $K/pages/account/index.astro src/pages/account/index.astro

# The map library, served from your own site (no outside host)
cp -R $K/public/vendor/. public/vendor/
```

## Connect it to your design

Every Listora page is wrapped in `src/layouts/ListoraLayout.astro`, and that file hands the page to your site's own layout. It expects `src/layouts/Base.astro` taking `title` and `description`, which is what the EmDash templates ship. If your layout has another name or other props, change that one file. No Listora page needs editing, and a kit update never replaces it.

Colours and fonts come from your site: the kit reads `--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-brand`, `--color-on-brand` and `--font-body` when they exist, and falls back to its own neutral set when they do not.

Proven on two sites: the EmDash `starter` template and a clean `portfolio` template site, as guest, member and admin, in light and dark, at 1440 and 390.

Collection: create a `listings` collection with the same fields the lab seed uses, or run `site-kit/seed/listings.mjs` the way the lab reset does.

Demo rows: Admin → Get started → **Load sample directory** (12 NYC listings, reviews, a claim). The lab seed still loads the larger 33-listing pack. Import fixture: `site-kit/seed/import/sample.csv`.

Add four menu links: `/listings/`, `/listings/submit/`, `/listings/calendar/`, `/account/`.

`astro.config.mjs` must load the sandbox runner and the plugin. See [Install](../docs/website/getting-started/install.md).

## Before you add it to a live site

- **EmDash version.** Built and tested on EmDash 1.2. Update the site first.
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
- Admin → Get started, then Listora queue, reviews, claims

## Lab prove

```bash
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```
