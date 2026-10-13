# QA catalog

**Included in Free**

What gets checked before a screen, route, or version is done. Process lives here. Status lives in [code-completion.md](code-completion.md) and [owner-readiness.md](owner-readiness.md).

No Pro rows. If a check would add Compare, Needs, credits, Google Maps, lead forms, verification, saved searches, or quick view, mark **Skip** and stop.

## Priority

1. **Site owner can install and open a directory.** Registry, capabilities, collection, pages, first listing.
2. **Visitor can search, open, review, contact.** Browser at 1440 and 390.
3. **Owner can submit, claim, renew, see their dashboard.**
4. **Admin can moderate listings, reviews, and claims.**
5. **Code quality.** `npm test`, `npm run validate`, `npm run build`. Secondary. Green tests do not replace the browser.

For each core path, confirm the code flow and walk it in the browser. A gap on either side is a fail.

## Order

```
0  BOOT
1  SITE OWNER READY
2  PRESENTATION AND FLOW
3  PRODUCT COMPLETENESS
4  ENGINE AND WIRING
5  CODE QUALITY
6  DOCS AND RELEASE
```

A SKIPPED check needs a written reason. Silent skip is a fail.

## 0. Boot

| Check | Runner | Pass |
| --- | --- | --- |
| Manifest valid | `npm run validate` | `emdash-plugin.jsonc` matches routes, storage, settings, admin pages |
| Types and tests | `npm test` | 7+ tests pass |
| Bundle under cap | `npm run build` | Under 256 KB uncompressed, 128 KB per file, 20 files |
| Lab up | `./scripts/reset-lab.sh` then open `:4321` | Health `ok`, `listingsCollection` true |
| Prove | `./scripts/prove-lab.sh --all` | Archive, detail, submit, calendar, account, search, types, reviews, dashboard, import |

## 1. Site owner ready

Walk as an EmDash site owner, not a plugin author. Full list: [owner-readiness.md](owner-readiness.md).

| Check | Pass |
| --- | --- |
| Sandbox runner declared on the site | Without it, registry install is skipped |
| Plugin found in Registry | `@vapvarun.bsky.social/listora` |
| Consent is honest | Only `content:read`, `content:write`, `content:publish`, `schema:read`. No surprise hosts |
| After install, admin pages exist | Queue, Reviews, Claims |
| Settings exist | Moderation, default type, spam keywords |
| `listings` collection exists | Fields match `site-kit/seed/listings.mjs` |
| Public pages exist | `/listings/`, detail, submit, calendar, account |
| CSS is the kit | `.listora-block` and `--listora-*`, not the blog theme |
| First listing can go public | Submit, moderate if required, open on the archive |

If any of those fail on a **second** EmDash site (not only `emdash-local`), the plugin is not owner-ready.

## 2. Presentation and flow

Walk [screen-checklist.md](screen-checklist.md). Viewports 1440 and 390. Light and dark.

| Check | Pass |
| --- | --- |
| Archive | Command search, type chips, sort, grid/list, cards, empty, OSM |
| Detail | Breadcrumb, cover, header, actions, tabs, hours, map, forms |
| Submit | Type / Basics / Details / Categories / Preview. Field errors. One primary |
| Calendar | Event dates visible |
| Account | Overview, listings, reviews, claims, favorites, profile. No Credits tab |
| Admin | Empty primitive, one primary, approve/reject works |
| Forms | Labels, 44px taps, helper/error `aria-describedby`. See form-presentation |
| No Pro chrome | No Compare, Needs, credits, verification, lead-form extras |

## 3. Product completeness

Click every visible control once. Dead button is a fail.

Three entry points for each public job:

| Job | Visitor | Owner | Admin |
| --- | --- | --- | --- |
| Find a listing | `/listings/` search | same | Queue lists it |
| Open a listing | Card or map | same | n/a |
| Submit | `/listings/submit/` | same | Approve |
| Review | Detail Reviews tab | Dashboard reviews | Reviews queue |
| Contact | Detail Contact tab | Email log later | n/a |
| Claim | Detail Claim | Dashboard claims | Claims queue |
| Save | Card heart or detail Save | Dashboard favorites | n/a |

## 4. Engine and wiring

| Check | Pass |
| --- | --- |
| Routes match `docs/website/developer-guide/routes.md` | Every public write validates input |
| Storage collections match the manifest | submissions, events, reviews, claims, favorites, contacts, email_log, blocked |
| Hook `content:afterSave` | Writes `storage.events` |
| Missing collection | `listPublished` returns `[]`, does not crash |
| Honeypot | `company_website` rejects submit and contact |
| Duplicate | Title clash warned before create |
| Expired | `listing_status=expired` stays off the public grid |
| Search | `q`, `location`/`city`, `listing_type`, `sort`, `lat`/`lng`/`radius` |
| Favorites | POST/DELETE with `listingId` |
| Privacy | Export and erase member rows |
| Renew | Extends `expires_at`, no credits |

## 5. Code quality

Automatic. Do not spend review time here if green.

- `npm run validate`
- `npm test`
- `npm run build`
- No Node built-ins in plugin runtime
- No AI co-author on commits
- No em-dashes in docs or comments

## 6. Docs and release

| Check | Pass |
| --- | --- |
| Website docs | `docs/website/` matches the screen or route you changed |
| This catalog | Status pages updated in the same PR |
| Changelog | `[Unreleased]` has the why |
| Version | Bump only when publishing. Never reuse a version |
| Registry | Do not publish until a visitor can see the difference |

## Personas

| Persona | Start | Must finish |
| --- | --- | --- |
| Visitor | `/listings/` | Search, open, review or contact |
| Owner | `/listings/submit/` then `/account/` | Submit, see the row, renew or export |
| Admin | `/_emdash/admin/plugins/listora/queue` | Approve a listing, a review, a claim |

## Skip (Pro)

Google Maps, credits, plans, coupons, Needs, Compare, quick view, SEO landings, coming soon, BuddyPress, photo reviews, multi-criteria reviews, verification, lead forms, saved searches, infinite scroll, Places import.
