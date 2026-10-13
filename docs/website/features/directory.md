# Browse, search, and maps

**Included in Free**

Visitors open `/listings/`, filter, and open a listing. Data comes from `listings` and `search`. The lab page also filters the host collection in Astro so first paint is not an empty grid.

## What works in 0.1.0

- Command search: keyword, location, Near me, Search
- Type chips for all 10 Free types
- Grid and list toggle, result count, Featured / Rating / Title sort
- Featured row (first three featured listings, not a carousel)
- Cards with photo, type, city, rating, owner, amenity chips, Save
- Detail tabs, hours Open/Closed, services, JSON-LD
- OSM map on archive and detail
- Calendar at `/listings/calendar/`
- Expired listings stay out of the public grid

## What is still thin

Skeletons show while search is busy. Map drag does not re-query yet. Featured is a static row, not a carousel with arrows. Category icon grid is still missing.

Do not add Advanced Search, saved searches, Compare, or quick view. Skip. No Pro plan in this pass.

Treat this page as the job list. Treat [Directory screens](../how-to/directory-screens.md) as the chrome list.
