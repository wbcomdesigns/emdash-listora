# Plugin routes

**Included in Free**

Base: `/_emdash/api/plugins/listora/<name>`. Public routes are internet-facing. Validate input.

| Route | Public | Job |
| --- | --- | --- |
| `health` | yes | Version, collection present, pending count, demo seed |
| `types` | yes | 10 listing types |
| `listings` | yes | Published listings, filters |
| `search` | yes | Query, type, geo, suggest |
| `submit` | yes | Create draft or pending row |
| `duplicate` | yes | Title clash |
| `reviews` | mixed | List and write |
| `claims` | mixed | List and write |
| `favorites` | mixed | Toggle |
| `dashboard` | no | Owner counts |
| `contact` | yes | Lead + email log |
| `import` | no | CSV / JSON / GeoJSON |
| `privacy` | no | Export or erase member rows |
| `renew` | no | Listing renew |
| `admin` | no | Block Kit pages |

Hook: `content:afterSave` indexes a listing save into `storage.events`.

Tests live in `tests/plugin.test.ts` (health, submit title, admin queue, types, honeypot, empty search, seeded reviews). Add a test when you add a route.

`listPublished` wraps `content.list` in try/catch. An empty test D1 has no `ec_listings` table.
