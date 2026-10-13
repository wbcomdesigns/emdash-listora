# Site owner readiness

**Included in Free**

Checked 2026-10-13 against `0.1.0` and the local lab. This is the EmDash site-owner view, not the plugin-author view.

**Verdict: not owner-ready on a second site.** The isolate works in the lab. Install on a clean EmDash site does not yet produce a public directory.

## What the owner expects

1. Open Admin → Registry.
2. Install `@vapvarun.bsky.social/listora`.
3. Confirm capabilities.
4. See Listora in admin.
5. Open `/listings/` on the site and search.
6. A visitor can submit a listing.
7. The owner can approve it and it appears in the grid.

WordPress Listora does steps 5-7 after activate plus a setup wizard. EmDash cannot. The plugin cannot ship Astro pages. The site kit has to supply them.

## Owner journey (current)

| Step | Needed | Status | Notes |
| --- | --- | --- | --- |
| Site has a sandbox runner | Host | Thin | Lab has it. A new site must add `sandboxRunner` or Cloudflare `sandbox()` or install is skipped |
| Find the plugin in Registry | Registry | Missing | `0.1.0` published. Public listing waits on labeler approval |
| Review capabilities | Manifest | Pass | `content:read`, `content:write`, `content:publish`, `schema:read`. No `allowedHosts` |
| Install | Registry | Thin | Works as a local `file:` / symlink package. Registry path blocked until approval |
| Admin: Get started, Queue, Reviews, Claims | Plugin | Pass | Get started loads 12 sample listings after the collection exists |
| Settings: moderation, default type, spam | Plugin | Thin | Schema declared. Lives on the queue page, not a settings IA |
| `listings` collection with fields | Kit + host | Lab only | `site-kit/seed/listings.mjs` creates it on the lab. Owner has no one-click apply |
| Public pages | Kit | Thin | Pages are in `site-kit/pages/`. Owner must copy them. Not proven on a second site |
| Directory CSS | Kit | Thin | `site-kit/listora-ui.css` exists. Owner must copy it into the site |
| Menu links | Host | Lab only | Lab nav has Listings, Submit, Calendar, Account. A new site does not |
| First listing public | Engine + admin | Pass in lab | Submit → queue approve → archive. Needs pages and collection first |
| Demo data | Plugin + kit | Thin | Admin → Get started → Load sample (12 listings). Lab seed still has 33. Collection must exist first |
| Real member login | Host | Missing | Dashboard uses `demo-member` or `routeCtx.user`. Owner identity is not proven |
| Mail to listing owner | Host | Thin | Contact writes `contacts` and `email_log`. Host mail may be off |

## What install alone gives the owner

After a successful sandbox install, the site has:

- Plugin routes under `/_emdash/api/plugins/listora/`
- Storage collections (reviews, claims, favorites, and the rest)
- Block Kit admin: Get started, Queue, Reviews, Claims
- Three settings

After a successful sandbox install, the site still does **not** have:

- `/listings/`, `/listings/[slug]/`, `/listings/submit/`, `/listings/calendar/`, `/account/`
- A `listings` collection
- Listora CSS
- Menu items
- Seed listings until the owner clicks Load sample (and has a collection)

That gap is why this product is not ready to hand to an EmDash site owner.

## Minimum for owner-ready

Do these before calling Free stable for a second site. Do not start Pro.

1. Registry listing approved, or a documented sideload path that a site owner can follow.
2. Drop-in kit: CSS + Astro pages + collection seed + menu recipe in `site-kit/`.
3. A written owner install: Registry → copy kit → create collection → open `/listings/`.
4. Walk that install on a **clean** EmDash site, not only `emdash-local`.
5. Visitor submit → admin approve → listing on the archive, on that clean site.
6. Empty, error, and populated states on archive, detail, and submit at 1440 and 390.

## Honest line for support

"Install the plugin, then copy the site kit so your EmDash site has `/listings/` pages. The plugin is the engine. It does not create the pages."

That line is true. The kit now contains the pages. A second-site apply is not proven yet. See [cover-before-next-release.md](cover-before-next-release.md) before testers use `0.2.1`.
