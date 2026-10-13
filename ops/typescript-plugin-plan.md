# TypeScript plugin plan: `@wbcomdesigns/listora`

`wb-listora` stays the WordPress product. EmDash cannot load PHP, Gutenberg, the credits SDK, cron-as-Action-Scheduler, or BuddyNext.

`@wbcomdesigns/listora` is a new sandboxed TypeScript plugin. The product target is **the whole Listora feature catalog** ([listora.org feature catalog](https://listora.org/docs/overview/feature-catalog/)), not a directory-only subset.

It copies the catalog **contract**. It does not copy PHP classes. Gutenberg blocks become site pages. Credits become a compose plugin. BuddyPress and WP licence/CLI stay WordPress-only.

Row-by-row map: `ops/feature-catalog-emdash.tsv` (76 catalog features). Site install steps: `ops/prototype-plan.md`. Presentation bar: `ops/ux-plan.md`. Order of work: `ops/quality-plan.md`.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Product scope | Every catalog row has a verdict. We implement all `SANDBOXED` rows in this plugin |
| Runtime | Stay sandboxed unless a slice needs React admin, Portable Text, or `page:fragments` |
| One plugin | No Free/Pro PHP pair. Pro catalog rows are settings gates or a later compose plugin |
| Content home | Site collection `listings` plus taxonomies |
| Plugin storage | Operational: submissions, events, then claims, reviews, favorites, leads, needs, audit, analytics |
| Admin UI | Block Kit |
| Bundle cap | 256 KB. Split compose plugins if a slice blows the cap |
| WP relationship | Catalog + TSV only. No shared runtime |
| Skip forever | BuddyPress, WP-CLI, WP licence/auto-update, App Sign-In with a WordPress password, `wb_listora_*` PHP hooks, Gutenberg |

## Catalog coverage

Source: `listora-site` `docs/overview/feature-catalog.md`. Every row is in the TSV.

| Verdict | Count (approx) | Who builds it |
| --- | --- | --- |
| SANDBOXED | most product logic | This TypeScript plugin, slice by slice |
| COLLECTION | types, taxonomies, listing fields | Site collection + plugin writes |
| THEME / kit | pages, maps UI, infinite scroll, quick view, crumbs | Site kit, restyled per site |
| HOST | SEO tags, sitemap, roles, registry updates | EmDash core |
| COMPOSE | credits, plans, coupons, payment webhooks | Later credits plugin Listora calls |
| SKIP | WP-only surfaces | Never this repo |

"We need all features" means the TSV is the backlog. v0.1 is only slice A, already running on the local lab.

## Current v0.1 (slice A, lab-proven)

| Surface | Status |
| --- | --- |
| `health` | Collection present + pending count |
| `listings` | Published list |
| `submit` | Creates a draft |
| `admin` `/queue` | Approve, reject, moderation settings |
| `content:afterSave` | Event index |

Still missing from the catalog: types editor, taxonomies on submit, media, hours, services, search, reviews, claims, dashboard, email, spam layers, monetize, needs, import.

## Slices (catalog -> TypeScript)

Implement in this order. Each slice adds routes/storage/tests, then a lab pass. PHP is spec only.

### A. Directory core (done)

Catalog: Frontend Submission, Moderation Queue, Directory Page (data side).

Routes: `health`, `listings`, `submit`, `admin`.

### B. Types, fields, richness, quality

Catalog: Listing Types, Type Editor, Categories, Locations, Amenities, Tags, Custom Fields, Photos & Video, Business Hours, Services, Featured, Lifecycle, Audit Log, Spam Protection, Rate Limiting, Schema mapping (data).

- `admin` `/types` Block Kit
- `listing_types` in settings
- taxonomy assign on submit (`taxonomies:write` if needed)
- listing fields: gallery, video, hours, services, social, featured, expired_at, status extras
- honeypot + keyword list + URL density + IP window on public writes
- `storage.audit`

### C. Owner and member tools

Catalog: Duplicate Check, Listing Renewal, Favorites, User Dashboard (API), Privacy Tools, Moderators (host roles).

- `submit/check-duplicate`
- `submit/{id}` owner edit (needs EmDash user)
- `favorites`
- `me/listings` dashboard payload
- export/erase for a user

### D. Claims and badges

Catalog: Business Claims, Verification Badges.

- `storage.claims`, routes `claim`, admin `/claims`
- `is_claimed`, `badges`

### E. Reviews and blocking

Catalog: Reviews System, Multi-Criteria Reviews, Photo Reviews, Member Blocking.

- `storage.reviews`, `storage.blocks`
- public review + list, owner reply, report, moderate in queue
- photo reviews need `media:write`

### F. Discovery

Catalog: Search & Filters, Advanced Search, Saved Searches, Compare, Calendar (data), OpenStreetMap/Google (coords + Places import), Google Places Import.

- `search` (text, facets, geo, sort, custom fields)
- `storage.saved_searches` + alert cron
- `compare`
- Places import only with `network:request`

Infinite Scroll and Quick View are **THEME**: site calls `search`/`listings` cursors.

### G. Contact, email, analytics, automation

Catalog: Contact Form, Lead Forms, Email Templates, Email Log, Digest, Draft Reminder, Analytics, Automation Triggers, Outgoing Webhooks.

- `contact`, `lead`
- templates + `storage.email_log` if host email is wired
- `storage.analytics` ingest
- emit catalogued events; Pro webhooks HMAC to `allowedHosts`

### H. Needs marketplace

Catalog: Needs Marketplace.

- `storage.needs` or site collection `needs`
- post need, respond, match by type + location
- dashboard tab data

### I. Import and export

Catalog: Import & Export. WP-CLI is SKIP (use admin + node scripts).

- CSV / JSON / GeoJSON
- later: WP `listora_listing` migrator and competitor scripts

### J. Monetize (compose, not this bundle)

Catalog: Credit System, Pricing Plans, Coupons, Payment Webhooks.

Hold-and-commit lives in a credits compose plugin. This plugin only checks "may publish / may feature / may renew".

## Site kit (not `plugin.ts`)

These catalog rows are pages or host features. Ship them as copy-paste kit, not inside the 256 KB bundle.

Directory Page, Setup Wizard, Gutenberg Blocks, Template Overrides, OSM/Google map chrome, Infinite Scroll, Quick View, SEO Landing Pages, JSON-LD render, OG, Breadcrumbs, Sitemap, Coming Soon, White Label, Installation.

## Never port into this plugin

Installing Pro, License Management, Auto-Updates, BuddyPress, App Sign-In, WP-CLI, Hooks & Filters as PHP, Extending with Pro as a second PHP plugin.

## Working rule

When someone asks for a Listora feature on EmDash:

1. Find the catalog name in `ops/feature-catalog-emdash.tsv`.
2. Follow `verdict` and `plugin_slice`.
3. If `SANDBOXED`, write TypeScript against the contract. Do not copy PHP.
4. If `COLLECTION` or `THEME`, change the site kit.
5. If `COMPOSE`, do not grow this bundle.
6. If `SKIP` or `HOST`, stop.

A slice is not done when the route returns JSON. Pair it with the screens in `ops/ux-plan.md` and the drop list in `ops/quality-plan.md`.

## Gates

```bash
cd ~/code/emdash-listora
npm test
npm run typecheck
npm run build
```

Restart `~/code/emdash-local` after every plugin rebuild. Lab pass/fail for slice A is in `ops/prototype-plan.md`. Each new slice adds route tests plus one browser path.

Publish to the registry only after slice B exists and a second site can apply the kit. Do not wait for J to publish A+B.
