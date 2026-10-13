# Autonomous local prototype

This is the runbook. The agent follows it without stopping for permission between drops. The owner is only needed at the stop gates listed at the end.

Goal: a **100% working Free prototype** on `http://localhost:4321`. Not a JSON engine. Not one cafe. A directory that looks and behaves like WordPress Listora Free 1.9.0, with seeded realistic data.

Sources of truth (code wins over catalog):

- `ops/listora-as-built.md` (what Free already is)
- `ops/free-first-plan.md` (what we ship, what we park)
- `ops/ux-plan.md` (when a screen is done)
- `ops/seed-inventory.tsv` (what data must exist)

Lab: `~/code/emdash-listora` + `~/code/emdash-local`.

## What 100% working means

The prototype is done when all of these are true on a reset lab (wipe DB, reseed, restart, prove):

1. All six Free drops from `ops/free-first-plan.md` are implemented.
2. Seeded data covers every Free listing type and every public / owner / admin screen.
3. A visitor can search, open a card, see hours and map, read reviews, favorite, claim, contact, and submit a new listing through the 5-step wizard.
4. An owner can use the dashboard (listings, reviews, claims, favorites, profile).
5. An admin can approve or reject listings, reviews, and claims in Block Kit.
6. Side-by-side vs WP Listora Free passes at 1440 and 390 for archive, card, detail, submit, search, map, dashboard.
7. `npm test` in the plugin is green. `scripts/prove-lab.sh` exits 0.
8. Pro rows stay off. Gutenberg, WP-CLI, credits, Google Maps stay out.

A 200 on `/listings/` is not 100%. One listing is not 100%.

## Seed (realistic, deterministic)

Port WordPress Listora's **general demo pack** (20 NYC listings) plus one listing for each type the general pack skips. Do not invent a second city of fake names. Screenshot parity needs The Golden Fork to sit next to The Golden Fork.

### Counts (minimum)

| Kind | Count | Why |
| --- | --- | --- |
| Published listings | 25+ | Grid, search, map, calendar, featured all have work to do |
| Featured | 3 | Featured carousel + badge |
| Claimed | 4 | Claim CTA hidden; owner name shows |
| Unclaimed | rest | Claim CTA shows |
| Pending (queue) | 2 | Moderation is not empty |
| Draft | 2 | Wizard save-draft + dashboard drafts |
| Rejected | 1 | Queue history |
| Expired | 1 | Renewal path (Drop 5) |
| Reviews (after Drop 4) | 40+ | 2-6 on several listings, mixed stars |
| Pending review | 1 | Review queue |
| Pending claim | 1 | Claims queue |
| Favorites (demo member) | 4 | Dashboard favorites |
| Hours rows | every restaurant, hotel, business | Open/Closed badge |
| Services rows | every business, healthcare, hotel | Detail services |
| Events with dates | 2+ | Calendar page |
| Jobs | 2+ | Job type fields |
| All 10 types | at least 1 each | Type chips and type editor |

Ten types: `business`, `restaurant`, `real-estate`, `hotel`, `event`, `job`, `healthcare`, `education`, `place`, `classified`.

General pack already has restaurant, real-estate, hotel, business. Add event, job, healthcare, education, place, classified from those WP packs (one or two each).

### Places and taxonomies

Keep NYC from the WP pack so lat/lng and map clusters are real:

- Manhattan, Brooklyn, plus a few other boroughs already in the pack
- Categories from the general pack (Fine Dining, Casual, Services, Retail, Apartment, House, ...)
- Features: WiFi, Parking, Outdoor Seating, Credit Cards, Wheelchair, Pet Friendly, AC, Delivery, Live Music, Pool
- Tags: cuisine and neighbourhood tags from the pack

Lab leftovers (Lotus Leaf Cafe, Lucknow) are replaced. One demo city.

### Media

Vendor images once into `site-kit/seed/media/` (JPEG, from the same Unsplash photo ids Listora already uses). Prove scripts must not hit Unsplash. Offline reset.

### Where seed lives

```text
site-kit/seed/
  listings.json          collection fields + taxonomies + entries
  reviews.json           Drop 4+
  claims.json            Drop 4+
  favorites.json         Drop 5+
  media/                 vendored photos
```

`emdash-local/seed/seed.json` imports or copies the listings collection from the kit. The lab does not grow a second handwritten catalog.

Grow seed **with the drop that can store it**. Do not put reviews in seed before Drop 4 exists.

## Autonomous loop (do not ask between these)

For every drop:

```text
1. IMPLEMENT   plugin routes/storage + matching screens in the same drop
2. SEED        add only the fields and rows this drop can render
3. RESET       wipe local SQLite, apply seed, rebuild plugin, restart astro
4. UNIT        cd ~/code/emdash-listora && npm test && npm run build
5. PROVE       scripts/prove-lab.sh --drop N   (API + Playwright)
6. LOOK        screenshots 1440 and 390 vs WP, write ops/reports/drop-N.md
7. NEXT        if prove exits 0, start drop N+1 with no pause
```

Restart `astro dev` after every plugin rebuild (workerd caches `plugin.mjs`).

Do not ship a drop that is routes-only. Do not start Drop N+1 if Drop N prove failed.

## Lab scripts (build these in Drop 1, reuse forever)

| Script | Job |
| --- | --- |
| `scripts/reset-lab.sh` | Stop astro, delete local DB, rebuild plugin, start astro, wait for health |
| `scripts/prove-lab.sh --drop N` | Unit + health + drop-N HTTP and Playwright checks. Exit 1 on first fail |
| `scripts/prove-lab.sh --all` | Drops 1 through current, then the 100% table |
| `scripts/screenshots.sh` | Archive, detail, submit, search, dashboard at 1440 and 390 |

Playwright talks to `http://localhost:4321`. Dev bypass for admin:

`/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`

## Per-drop prove (local, automated)

### Drop 0 (already true, re-check after reset)

- Plugin log: `Loaded sandboxed plugin listora`
- `GET /_emdash/api/plugins/listora/health` -> `listingsCollection: true`
- Seed has more than one published listing after we replace Lotus Leaf

### Drop 1: A-UI

Implement: `listora-ui.css` tokens, rebuild `/listings/`, `/listings/[slug]/`, `/listings/submit/`.

Seed: 25+ published listings from the general pack + missing types. Photos, type, city, excerpt, address. 2 pending, 2 drafts. No reviews yet.

Prove:

- `/listings/` 200, grid of cards (photo, type badge, location), not title+excerpt
- At least 20 cards visible or paginated with a count
- `/listings/the-golden-fork/` 200, sections, address, hours placeholder
- Submit is a stepped wizard (type, basic, details, preview)
- `POST /submit` creates a draft; title absent from `/listings/`
- Queue lists the draft; approve; title appears
- Empty state on a filtered-to-nothing view (or a dedicated empty fixture)
- `web-page-spec` required items on archive, detail, submit (`<title>`, h1, viewport, meta description)
- Screenshots vs WP card / detail / submit at 1440 and 390

### Drop 2: Kit + types

Implement: extract `site-kit/`, type editor, taxonomies on submit, gallery, hours, services, featured, honeypot, JSON-LD.

Seed: hours on restaurants/hotels/businesses, services on businesses, featured flags, type-specific fields (cuisine, price, beds).

Prove:

- Type chips or type filter on archive
- Restaurant detail shows restaurant fields, not hotel fields
- Hours render; Open/Closed computed in listing timezone
- JSON-LD on detail parses
- Featured badge on the 3 featured cards
- Honeypot submit is rejected
- A clean copy of `site-kit/` is the only listing UI the lab uses (no leftover blog `<style>` islands)

### Drop 3: Search + map + calendar

Implement: facets, suggest, geo radius, OSM on archive and detail, event calendar, grid updates without full reload.

Seed: real lat/lng from the pack, 2+ events with dates.

Prove:

- `GET search?q=fork` returns The Golden Fork
- Type facet `restaurant` hides hotels
- Near Me / radius with a known Manhattan point returns nearby cards
- Map shows markers; detail has a map
- `/listings/calendar/` shows the seeded events
- Search does not full-page reload (Playwright: URL or grid node updates, page did not navigate)

### Drop 4: Trust

Implement: reviews, claims, member blocking. No photo reviews.

Seed: 40+ reviews, 1 pending review, 4 claimed, 1 pending claim.

Prove:

- Detail shows average + list + form
- Helpful / report / owner reply persist
- Pending review is not public
- Claim CTA on an unclaimed listing; hidden on a claimed one
- Admin review queue and claims queue have rows
- Blocked member cannot review

### Drop 5: Owner

Implement: dashboard, favorites, duplicate check, renewal, privacy export/erase.

Seed: 4 favorites, 1 expired listing, drafts owned by the demo member.

Prove:

- `/account/` Overview counts match seed
- My Listings, Reviews, Claims, Favorites, Profile all have data
- Duplicate title on submit warns with a link
- Favorite from detail appears on Favorites
- Expired listing offers renew
- Export returns the member's listings and reviews

### Drop 6: Contact + mail + import

Implement: contact form, email log (or draft if host mail missing), CSV / JSON / GeoJSON import-export.

Seed: one import fixture file in `site-kit/seed/import/sample.csv`.

Prove:

- Contact on a claimed listing stores or logs a message
- Import of `sample.csv` creates the expected new listings (draft or pending)
- Export of published listings is valid JSON or CSV
- If host email is missing: templates exist, send is skipped, prove records `MAIL_UNAVAILABLE` and still exits 0 for the rest

## 100% table (prove --all)

| Journey | Seeded start | Pass |
| --- | --- | --- |
| Visitor browses | 25+ cards | Grid + list, count, sort |
| Visitor searches | Golden Fork in index | Suggest + results + map |
| Visitor opens listing | Golden Fork | Gallery, tabs, hours, map, actions |
| Visitor reviews | Published listing | Stars + text appear after approve |
| Visitor claims | Unclaimed listing | Claim in admin queue |
| Visitor favorites | Any published | Shows in dashboard |
| Visitor submits | Wizard | Draft, then live after approve |
| Owner dashboard | Demo member | Five tabs with real numbers |
| Admin queue | 2 pending listings | Approve / reject |
| Calendar | 2 events | Month or agenda shows them |
| Import | sample.csv | New rows exist |
| Empty | Impossible filter | Icon + title + body + CTA |
| Mobile | Same journeys | 390px, 44px taps, no horizontal scroll |
| Dark | Same journeys | Tokens, not raw hex |

## Stop gates (only times the agent pauses)

1. **Prove failed.** Fix, reset, re-prove. Do not skip.
2. **Side-by-side fail.** Archive/card/detail/submit is not recognisably Listora. Fix UI, do not invent a new look.
3. **Host identity.** Dashboard / favorites / owner edit need a signed-in EmDash user. If sandbox cannot attach a member, stop and report the exact missing host API. Do not fake a user table.
4. **Host email.** Drop 6 mail send. Templates still ship. Do not block the rest of Drop 6.
5. **Owner says stop or change scope.**

Do not pause to ask "should I start Drop 2". The answer is yes after Drop 1 prove exits 0.

## Reset recipe

```bash
cd ~/code/emdash-listora && npm test && npm run build
cd ~/code/emdash-local
npx astro dev stop || true
# wipe the local SQLite / data dir the lab uses (script documents the path)
./scripts/reset-lab.sh
# wait until GET /_emdash/api/plugins/listora/health is 200
cd ~/code/emdash-listora && ./scripts/prove-lab.sh --drop "$DROP"
```

After a plugin rebuild, always restart. A stale workerd is a false fail.

## Parked (never in this prototype)

Google Maps, Places, credits, plans, coupons, Needs, compare, saved searches, photo reviews, lead forms, SEO landings, Gutenberg, WP-CLI, BuddyPress, app-password login.

## Start (no further plan needed)

Drop 1: port tokens, rebuild the three public screens, replace Lotus Leaf with the 25+ listing seed, write `reset-lab.sh` and `prove-lab.sh --drop 1`, make that script exit 0, then continue.
