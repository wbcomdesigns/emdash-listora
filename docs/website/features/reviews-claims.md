# Reviews and claims

**Included in Free**

Stored in plugin storage, not as host content. That keeps moderation off the `listings` collection.

## Reviews

- Route: `reviews`
- Seed: 13 reviews on the NYC pack
- Detail page lists reviews for the current listing id or slug
- Admin: `/_emdash/admin/plugins/listora/reviews`

## Claims

- Route: `claims`
- Seed: one pending claim
- Detail page has a claim action
- Admin: `/_emdash/admin/plugins/listora/claims`

## Favorites and blocking

- `favorites` keyed by member and listing
- `blocked` collection for member blocking
- Lab favorite button passes `data-slug` because host ids are ULIDs

## What is still thin

WordPress reviews have a distribution bar, helpful votes, report, and owner reply. Claims have a fuller owner flow. The engine accepts the writes. The presentation is a first pass on the detail page.
