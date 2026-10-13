# Free first: can we do it

Yes. Cover WordPress Listora **Free** on EmDash until it is stable. No Pro plan in this pass.

What Free actually ships is in `ops/listora-as-built.md` (read from wb-listora 1.9.0). That file wins over the marketing catalog when they differ.

The engine already works on localhost:4321. The gap is Listora presentation plus the rest of Free (search, reviews, claims, dashboard, map). We do not need PHP. We do not need Pro credits.

## Cut

**In:** catalog tier `Free` or `Free + Pro`, Free baseline only.

**Skip (no Pro plan in this pass):** Google Maps, Places import, advanced search, saved searches, infinite scroll, quick view, compare, multi-criteria reviews, photo reviews, SEO landing pages, lead forms, needs, verification badges, BuddyPress, credits, plans, coupons, payment webhooks, moderators, audit log, analytics, digest, coming soon, outgoing webhooks, white label, licence.

**Never:** Gutenberg, WP-CLI, WP App Sign-In, PHP hooks.

## What we already have (Free)

- Submit -> draft -> queue approve -> public listing
- Health, published list API, Block Kit listing queue
- Lab pages that prove the loop (not Listora-quality UI)

## Free drops (do in this order)

Each drop ships plugin work **and** the matching screens. No JSON-only drop.

### Drop 1: A-UI (next, do this now)

Rebuild the three public screens to Listora chrome, still on current routes.

- Directory: cards with photo, type, location (grid + list if cheap)
- Detail: gallery or image, sections, address, hours placeholder
- Submit: stepped wizard (type, basic, details, preview), field errors
- Port `--listora-*` tokens into one `listora-ui.css` on the lab

Pass: side-by-side vs WP Free card/detail/submit at 1440 and 390.

### Drop 2: Kit + types (slice B, Free)

- Extract `site-kit/` so a second site copies it
- Listing types + type editor
- Categories, locations, amenities, tags on submit
- Photos, hours, services, featured (admin-set), lifecycle
- Honeypot + keyword list + rate limit
- JSON-LD on detail

### Drop 3: Search + map + calendar (slice F, Free only)

- Facets: type, category, feature, location, rating later
- Geo radius / Near Me using lat/lng
- OSM map on archive and detail (no Google)
- Event calendar page
- Search updates the grid without a full reload

### Drop 4: Trust (slices D + E, Free)

- Reviews: stars, text, helpful, report, owner reply, moderate
- Claims: "is this your business", queue
- Member blocking
- No photo reviews, no multi-criteria, no verification badges

### Drop 5: Owner (slice C, Free)

- Duplicate check
- Renewal without credits
- Favorites
- Dashboard: Overview, My Listings, Reviews, Claims, Favorites, Profile
- Privacy export/erase

### Drop 6: Contact + mail + import (slices G + I, Free)

- Contact form (not lead forms)
- Email templates + log + draft reminder (if host email exists)
- CSV / JSON / GeoJSON import-export
- Automation events in storage (no outgoing webhooks)

## Local lab

Keep `~/code/emdash-listora` + `~/code/emdash-local`.

After Drop 1, the public pages must look like Listora Free, not the blog. After Drop 2, a clean second site applies the kit.

## Why this is doable

- Sandbox + collection + submit/queue are already proven
- Free UI is a known set of blocks we can rebuild as Astro
- Pro money and Google and Needs are the hard dependencies. We are not taking those yet
- Bundle stays small if credits stay out

## Risk (honest)

- EmDash user identity is required for dashboard, favorites, owner edit, claims. If that is awkward in the sandbox, those screens wait behind a signed-in host user
- Email needs the host email callback. If missing, templates wait
- Maps are page JS + OSM tiles, not the plugin bundle

None of that blocks Drop 1.

## Start

Run `ops/autonomous-local-plan.md`. Do not wait for a go between drops.

Drop 1 first: port Listora tokens, rebuild archive / detail / submit, replace the single Lotus Leaf seed with the 25+ listing inventory, write `reset-lab.sh` and `prove-lab.sh --drop 1`. When that script exits 0, start Drop 2.
