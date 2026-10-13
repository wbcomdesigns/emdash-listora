# Browse, search, and maps

**Included in Free**

Visitors open `/listings/`, filter, and open a listing. Data comes from `listings` and `search`. The lab page also filters the host collection in Astro so first paint is not an empty grid.

## What works in 0.1.0

- Type chips for all 10 types
- Text search and a Near Me control
- Grid and list toggle, result count
- Featured row (first three featured listings, not a carousel)
- Cards with photo, type, city, rating when those fields exist
- Detail tabs, hours Open/Closed, services, JSON-LD
- OSM map on archive and detail
- Calendar at `/listings/calendar/`
- Expired listings stay out of the public grid

## What is still thin

WordPress search is command-style, with Near Me, advanced facets (category, feature, price, rating), skeletons, and map drag that re-queries. The lab search is a first pass. Cards still miss a full feature chip row and owner treatment. Featured is a static row, not a carousel with arrows.

Treat this page as the job list. Treat [Screen inventory](../ux/screen-inventory.md) as the chrome list.
