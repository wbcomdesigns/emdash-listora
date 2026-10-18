# Code completion

**Included in Free**

Checked 2026-10-13. Engine is the sandboxed plugin. Screens are the lab plus `site-kit/`. Host is EmDash.

Status words: Pass, Thin, Lab only, Missing, Skip.

## Engine (this repo `src/`)

| Job | Route / piece | Status |
| --- | --- | --- |
| Health | `health` | Pass |
| Types | `types` + `src/lib/types.ts` (10 Free types) | Pass |
| Published list | `listings` | Pass |
| Search | `search` (`q`, type, location/city, sort, geo, suggest, map) | Pass |
| Submit | `submit` | Pass |
| Duplicate | `duplicate` | Pass |
| Reviews | `reviews` | Pass |
| Claims | `claims` | Pass |
| Favorites | `favorites` | Pass |
| Contact | `contact` + honeypot | Pass |
| Dashboard | `dashboard` | Thin. Demo member, not proven host auth |
| Import / export | `import` | Site page `/listings/import/`. The link under the Settings tabs goes there. Not an admin screen |
| Privacy | `privacy` | Thin. Route exists. Account UI is first pass |
| Renew | `renew` | Thin. No credits (correct). Account UI is first pass |
| Admin queues | `admin` `/queue` `/reviews` `/claims` | Pass |
| Settings schema | `emdash-plugin.jsonc` | Thin. Three keys on the queue page |
| afterSave index | `content:afterSave` → `storage.events` | Pass |
| Demo seed | `src/lib/demo-seed.ts` | Lab only |
| Type editor | admin `/types` | Missing |
| Settings IA | admin `/settings` | Missing |
| Import admin | admin `/import` | Not an admin page. The site page is `/listings/import/`, linked from Settings |
| Paging / cursor | `listings` `cursor` is null | Thin |

## Site kit

| Job | Path | Status |
| --- | --- | --- |
| Tokens and chrome | `site-kit/listora-ui.css` | Pass (copied into the lab) |
| Collection + NYC seed | `site-kit/seed/listings.mjs` | Lab only |
| Import sample | `site-kit/public/vendor/listora-sample.csv` | Pass |
| Archive page | `site-kit/pages/listings/index.astro` | Thin. In the kit. Apply not proven on a second site |
| Detail page | `site-kit/pages/listings/[slug].astro` | Thin |
| Submit page | `site-kit/pages/listings/submit.astro` | Thin |
| Calendar page | `site-kit/pages/listings/calendar.astro` | Thin |
| Account page | `site-kit/pages/account/index.astro` | Thin |
| Drop-in kit pages | `site-kit/pages/` | Thin. Present. Owner copy required |
| Kit components | `site-kit/components/` | Missing |

## Free screens (lab chrome)

| Screen | Status | Bar still open |
| --- | --- | --- |
| Directory search | Thin | Command bar is in. Map drag does not re-query |
| Directory grid | Thin | Sort and view toggle in. No paging |
| Listing card | Thin | Photo, type, place, rating, owner, amenities, Save. Featured treatment still light |
| Listing detail | Thin | Cover, breadcrumb, actions, tabs, hours, map. No gallery/lightbox |
| Reviews | Thin | List + form. No distribution, helpful, owner reply |
| Map | Thin | OSM on archive and detail. No cluster |
| Submit wizard | Thin | Five named steps, type cards, field errors. Autosave still out |
| Categories | Missing | No icon grid screen |
| Featured | Thin | Static row of three |
| Calendar | Thin | Page exists. Month + phone agenda still thin |
| User dashboard | Thin | One `/account/` page. No real account URLs |
| Admin queues | Thin | Three pages. Empty on queue is tested. Settings IA out |

## Host / registry

| Job | Status |
| --- | --- |
| Sandbox runner on lab | Pass |
| Registry publish `0.1.0` | Pass |
| Registry listing approved | Missing |
| Second-site kit apply | Missing |
| Host member auth on dashboard | Missing |
| Host mail for contact | Thin |

## Tests that exist

`tests/plugin.test.ts`: health identity, submit title required, admin queue empty, Get started, load sample without collection, 10 types, honeypot, empty search without collection, no auto reviews on an empty host.

Add a test when you add a route or a public write rule.

## Do not mark complete

- A route that returns JSON with no owner-facing screen
- A lab page that is not in `site-kit/`
- A screen that fails 390 or has no empty state
- Any Pro catalog row
