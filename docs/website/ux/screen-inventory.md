# Screen inventory

**Included in Free**

Status is against WordPress Listora chrome, not "the URL loads". Engine column is what `0.1.0` can serve. Chrome column is what a visitor sees in the lab.

| Screen | Engine | Lab chrome | Bar |
| --- | --- | --- | --- |
| Directory search | `search`, `types` | First pass: q, Near Me, type chips | Command search, facets, skeletons |
| Directory grid | `listings` | Grid/list, count, featured row | Sort, paging, skeletons |
| Listing card | listing fields | Photo, type, city, rating when present | Features, owner, featured treatment |
| Listing detail | listings + extras | Tabs, hours, services, JSON-LD, map, actions | Gallery/lightbox, full sidebar |
| Reviews | `reviews` | List + form on detail | Distribution, helpful, reply |
| Map | lat/lng on listings | OSM on archive and detail | Cluster, overflow, search on drag |
| Submit wizard | `submit`, `duplicate` | Five steps | Autosave, live card preview |
| Categories | taxonomies on site | Missing as its own screen | Icon grid, counts |
| Featured | `is_featured` | Static row of three | Carousel, arrows, dots |
| Calendar | event dates | `/listings/calendar/` | Month plus phone agenda |
| User dashboard | `dashboard` | One `/account/` page | Left nav, own data only |
| Admin queues | `admin` | Listings, reviews, claims | Empty states, primary action |
| Admin types | types in code | Missing | Block Kit type editor |
| Admin import | `import` | CSV fixture only | Block Kit import page |

## Parked (Pro)

Compare, Needs, quick view, SEO landings, coming soon. See [Parked Pro work](../features/parked-pro.md).

## Interaction contract (do not drop)

These are why Listora feels finished. A JSON-only pass fails if they are missing.

1. Search updates the grid without a full reload. Keep focus.
2. Submit is a wizard with a live step list and a preview that looks like a card.
3. Duplicate check runs as the title is typed.
4. Hours show Open or Closed in the listing timezone, including overnight ranges.
5. Map drag re-queries. Marker overflow states the cap.
6. Dashboard tabs are real URLs (`/account/listings/`), not JS-only.
7. Empty states use icon, title, body, and a CTA. Never a lone "No listings yet."
8. Every public write has inline field errors, not only a top banner.
