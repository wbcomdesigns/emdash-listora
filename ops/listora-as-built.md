# What WordPress Listora already has (as built)

Read from `wb-listora` **1.9.0** on buddynext-dev, not from memory. This is the contract we copy for EmDash Free.

Path: `Local Sites/buddynext-dev/app/public/wp-content/plugins/wb-listora`

Pro is a separate add-on. Free already contains most directory jobs. Pro adds money, Google, Needs, extra review/search chrome.

## Product shape

- CPT: `listora_listing`
- REST: `listora/v1`
- Interactivity store: `listora/directory`
- Meta prefix: `_listora_`
- CSS prefix: `listora-` tokens in `src/variables/`
- Feature flags: option `wb_listora_features` via `wb_listora_feature_enabled()`

## Free feature toggles (code)

From `includes/class-features.php`. All default **on**.

| Key | What it gates |
| --- | --- |
| `submission` | Frontend submit form |
| `reviews` | Stars + review form on detail |
| `claims` | Claim an unclaimed listing |
| `favorites` | Save listings |
| `contact_form` | Email the owner. Stands down if Pro lead form is on |
| `renewal` | Owner renews expired listings |
| `owner_name` | "Listed by" on card and detail |
| `report_listings` | Flag a listing |
| `schema` | JSON-LD |
| `opengraph` | Social tags |
| `breadcrumbs` | Detail crumbs + BreadcrumbList |
| `sitemap` | Listings in WP sitemap |

Pro registers more keys onto the same Settings -> Features screen.

## Taxonomies on `listora_listing`

| Taxonomy | Role |
| --- | --- |
| `listora_listing_type` | Type. Admin UI is the type editor, not the WP term screen |
| `listora_listing_cat` | Hierarchical category, per-type |
| `listora_listing_tag` | Flat tags |
| `listora_listing_location` | Hierarchical place |
| `listora_listing_feature` | Amenities |
| `listora_service_category` | Service catalogue grouping |

## Ten default listing types

From `Listing_Type_Defaults`: `business` (default), `restaurant`, `real-estate`, `hotel`, `event`, `job`, `healthcare`, `education`, `place`, `classified`.

Each type has: name, Schema.org type, Lucide icon, color, field groups, categories. Fields are typed (`text`, `phone`, `map_location`, hours, and so on) with flags: required, searchable, filterable, show_in_card, schema_prop.

A restaurant never sees hotel fields. Type is chosen first on submit.

## Custom tables (Free activator)

`listora_geo`, `listora_search_index` (FULLTEXT), `listora_field_index`, `listora_reviews`, `listora_review_votes`, `listora_favorites`, `listora_claims`, `listora_hours`, `listora_services`, `listora_analytics`, `listora_email_log`, `listora_payments`, `listora_space_listings` (BuddyNext showcase).

Search is not `WP_Query` + meta. It uses the denormalized search index (type, status, title, text, rating, featured, claimed, lat/lng, and so on).

Geo is its own table (lat, lng, address, city, state, country, postal, geohash, timezone).

## Eleven Free blocks (the real UI)

These are the presentation we must match:

1. `listing-search` - command search, Near Me, type chips, facets
2. `listing-grid` - grid/list, sort, count, skeletons
3. `listing-card` - photo, type, location, rating, features, owner
4. `listing-detail` - gallery, tabs, sidebar, map, hours Open/Closed, Share / Favorite / Claim / Compare
5. `listing-reviews` - summary, list, form, helpful, report, reply
6. `listing-map` - OSM, clusters, overflow, search on drag
7. `listing-submission` - 5-step wizard, draft, duplicate check (login required since 1.3.0)
8. `listing-categories` - icon grid + counts
9. `listing-featured` - carousel
10. `listing-calendar` - events
11. `user-dashboard` - Overview, My Listings, Reviews, Claims, Favorites, Profile; Credits tab when Pro

Pro adds comparison, needs-grid, post-need, moderator-queue, credit-purchase.

## REST in Free (`listora/v1`)

Controllers registered in `class-plugin.php`:

- Listings (CRUD + `/listings/{id}/detail` card|detail)
- Search (`/search`, `/search/suggest`, `/search/map-clusters`)
- Listing types
- Reviews
- Favorites
- Claims
- Submit (`POST /submit`, check-duplicate, verify email, `PUT /submit/{id}`)
- Dashboard (stats + member listings/reviews/claims/profile)
- Settings
- Import/export
- Services per listing
- Account deactivate / reactivate / delete (App Store)
- Auth app-password (mobile)
- Space listings (BuddyNext)

Pro hooks `wb_listora_rest_api_init` for extra routes.

## Submit wizard (Free UX)

Steps: Choose Type -> Basic Info -> Type Fields -> Categories -> Preview. Back, Save draft, Continue, Submit. Duplicate check as you type the title. Edit from dashboard uses the same form.

## Other Free systems already in code

- Moderation: draft / pending / publish; queue in admin
- Member blocking and member suspension
- Featured duration + expiry cron
- Per-role listing limits
- Hours table (split shifts, timezone, Open/Closed on detail)
- Services table (name, price, duration)
- Analytics lite: bot-filtered views on `listora_analytics` (Pro can take over the table)
- Contact form on detail
- Report listings
- Claim proofs (capability-checked downloads)
- Email log table + member notification prefs (approve/reject/expire/review/claim/draft)
- Action Scheduler bundled
- Credits SDK files live under `libs/` for Pro/compose; Free does not sell credits
- Privacy exporters/erasers
- WP-CLI, setup wizard, demo packs
- Site Health checks
- Theme isolation (`.listora-block`, full-width body class)

## Free vs Pro (so we do not over-build)

Already in Free: directory, types, taxonomies, submit, search index, OSM map, reviews (single 1-5), claims, favorites, dashboard, contact, hours, services, import, schema, spam/rate tools, analytics-lite views.

Pro-only (park): Google Maps/Places, saved searches, advanced search, infinite scroll, quick view, compare, multi-criteria + photo reviews, SEO landing pages, lead forms, needs, verification UI, credits/plans/coupons/payments, moderators, audit log, digest, coming soon, outgoing webhooks, white label, BuddyPress activity.

Skip on EmDash: Gutenberg, WP-CLI, app-password WP login, BuddyNext space listings, PHP hooks.

## What this means for the EmDash port

1. Copy **toggles + types + tables + block screens**, not PHP classes.
2. Search must be a real index or `content.list` with the same filters. Title-only archive is not Listora.
3. Card and detail have a fixed chrome (type, location, rating, hours badge, actions). The lab pages are missing that.
4. Submit is a typed wizard, not one flat form.
5. Dashboard is a first-class Free screen.
6. `listora_space_listings` and App Auth stay WordPress.

Use this file plus `ops/feature-catalog-emdash.tsv` when adding a slice. If they disagree, this file (the code) wins.
