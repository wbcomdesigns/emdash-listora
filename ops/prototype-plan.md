# Listora on EmDash: prototype plan

WordPress `wb-listora` is not reused. This is a new TypeScript plugin plus site pages. Installing the plugin alone does not give a directory. Each site still needs a listings collection, public pages, and a sandbox runner.

The TypeScript plugin itself is planned in `ops/typescript-plugin-plan.md`. The full Listora catalog map is `ops/feature-catalog-emdash.tsv`. Presentation bar is `ops/ux-plan.md`. Order of work is `ops/quality-plan.md`. This file is the site-install and local engine lab for slice A.

The current `/listings/` pages prove the engine. They do not meet Listora presentation quality. Do not ship them as the product UI.

The working prototype (Free, seeded, locally proven) is `ops/autonomous-local-plan.md`. This file stays the site-install note.

## Who does what

| Actor | Does this | When |
| --- | --- | --- |
| Wbcom (us) | Plugin engine, Block Kit queue, site kit (collection seed + page templates), registry publish, local lab | Once, then slice by slice |
| Site engineer | Turn on sandbox, install plugin, create `listings` collection, add pages, add menu | Every EmDash site that wants Listora |
| Site admin | Set moderation, review the queue, publish or reject | After the engineer finishes |

A sandboxed plugin cannot ship Astro pages. That is why the site engineer step exists.

## What we build (product)

Prototype scope is directory listings only. Claims, reviews, credits, maps, facets, and BuddyNext stay out.

### Already built (local lab)

- Sandboxed plugin `@wbcomdesigns/listora` 0.1.0
- Routes: `health`, `listings`, `submit`, `admin`
- Block Kit queue: approve, reject, settings
- Local site kit on `~/code/emdash-local`: `listings` collection, taxonomies, `/listings/`, `/listings/[slug]/`, `/listings/submit/`

### Still to build before a second site can copy this

1. **Site kit package** (not the plugin bundle)
   - `listings` collection JSON (fields below)
   - taxonomy stubs: `listing_category`, `listing_tag`, `listing_location`, `listing_feature`
   - three Astro pages copied from the local lab
   - menu items: Listings, Add a listing
2. **Install note** for the registry listing: sandbox required, collection required, pages required
3. **Registry publish** of `@wbcomdesigns.bsky.social/listora` after `emdash-plugin login`
4. **Second-site dry run**: apply the site kit on a clean EmDash site, not only `emdash-local`

### Not in the prototype

- Claims, reviews, credits SDK, Stripe/PayPal
- Faceted search JS, maps, calendar, owner dashboard
- BuddyNext / BuddyPress
- Import of existing WordPress `listora_listing` posts (later, as a migration script)

## What each site must do

Do these in order. Later steps fail if an earlier one is missing.

### 1. Site already on EmDash

The site must be an EmDash Astro site with admin and a sandbox runner. WordPress cannot install this plugin.

Node local / Node Docker:

```js
sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox"
```

Cloudflare Workers: follow [plugin sandbox](https://docs.emdashcms.com/deployment/plugin-sandbox/). Without a runner, registry install returns `SANDBOX_NOT_AVAILABLE`.

### 2. Install the plugin

Pick one path.

- **Registry (goal after publish):** Admin -> Registry -> `@wbcomdesigns.bsky.social/listora` -> Install. Consent to `content:read`, `content:write`, `content:publish`, `schema:read`.
- **Prototype / local:** npm `file:` or later npm package, then `sandboxed: [listora]` in `astro.config.mjs` (this is what `emdash-local` does today).

Enable the plugin if it is installed but disabled.

### 3. Create the `listings` collection

The plugin writes into a site collection named `listings`. If that collection is missing, submit returns `LISTINGS_COLLECTION_MISSING`.

Required fields (match this contract):

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string, required | Used as the listing name |
| `excerpt` | text | Card summary |
| `description` | text | Detail body |
| `listing_type` | string, indexed | Default `business` |
| `phone` | string | |
| `website` | url | |
| `email` | string | |
| `address` | string | |
| `city` | string, indexed | |
| `state` | string | |
| `country` | string, indexed | |
| `postal_code` | string | |
| `lat` | number, indexed | |
| `lng` | number | |
| `is_claimed` | boolean, indexed | Default false. Claims UI is not in v0.1 |
| `featured_image` | image | Optional |
| `timezone` | string | Optional |

URL pattern: `/listings/{slug}`. Supports drafts.

Optional taxonomies on `listings`: `listing_category`, `listing_tag`, `listing_location`, `listing_feature`.

How: paste the site-kit seed, or create the collection in Admin -> Content Types.

### 4. Add public pages

Copy the site-kit Astro pages into the site theme:

- `src/pages/listings/index.astro`
- `src/pages/listings/[slug].astro`
- `src/pages/listings/submit.astro`

Style them with that site's tokens. The plugin does not render these.

### 5. Add navigation

Primary menu:

- Listings -> `/listings`
- Add a listing -> `/listings/submit`

### 6. Admin settings and first publish

1. Open `/_emdash/admin/plugins/listora/queue`
2. Keep **Require moderation** on for the prototype
3. Submit a test listing on `/listings/submit/`
4. Confirm it is not on `/listings/` yet
5. Approve in the queue
6. Confirm it appears on `/listings/` and `/listings/{slug}/`

## Local testing (current lab)

Lab: `~/code/emdash-listora` + `~/code/emdash-local` on http://localhost:4321

### Start

```bash
cd ~/code/emdash-listora
npm install --legacy-peer-deps
npm test
npm run build

cd ~/code/emdash-local
npm run dev
```

After a plugin rebuild, restart `astro dev` so workerd loads `plugin.mjs`.

### Pass / fail

| Check | Pass |
| --- | --- |
| Plugin load | Dev log: `Loaded sandboxed plugin listora:0.1.0` |
| Health | `GET /_emdash/api/plugins/listora/health` -> `listingsCollection: true` |
| Archive | `/listings/` returns 200, published cards only |
| Submit form | `/listings/submit/` creates a draft, shows the review message |
| Submit stays private | New title is absent from `/listings/` |
| Queue | `/_emdash/admin/plugins/listora/queue` lists the draft |
| Approve | Review -> Approve and publish |
| Public after approve | Title appears on `/listings/` and its detail URL |
| Reject | Review -> Reject leaves it off the public list |

Dev bypass: http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin

### Proven on this lab

Submit **Maple Bookshop** from the form, approve in Listora, then live at `/listings/maple-bookshop/`.

## Prototype sequence

1. Keep the local lab as the source of truth (done).
2. Extract the site kit from `emdash-local` so the next site is copy, not rewrite.
3. Publish the plugin to the registry when the kit + install note exist.
4. Repeat the pass/fail table on a second local or staging EmDash site (registry install, not `file:`).
5. Only then offer Listora to a real EmDash site.
6. Next product slices (claims, reviews) get their own plan. Do not start them in this prototype.

## Fast answers

**Can a site only install the plugin?** No. They also need sandbox, `listings` collection, and three pages.

**Do they install WordPress Listora?** No. That plugin never runs on EmDash.

**Who builds the pretty directory UI?** We ship a starter kit. Each site restyles it.

**When is local testing enough to call the prototype done?** When the pass/fail table is green on `emdash-local` and once more on a clean second site using the kit (not hand-edited lab files).
