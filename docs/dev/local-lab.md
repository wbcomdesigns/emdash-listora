# Run the local lab

**Included in Free**

The lab is how we prove a change. A green route test is not enough. Open the screens.

On a new laptop, create the host site first: [Set up a new machine](new-machine.md). After that, the daily loop is:

```bash
cd /path/to/emdash-listora
npm install --legacy-peer-deps
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

`reset-lab.sh` rebuilds the plugin, wipes the lab SQLite file (`data/emdash.db` or `data.db`), starts Astro, hits health, then calls the dev-bypass so the 33 listings land. Default lab folder is a sibling named `emdash-local`. Override with `LISTORA_LAB`.

## URLs

| Job | URL |
| --- | --- |
| Directory | http://localhost:4321/listings/ |
| Submit | http://localhost:4321/listings/submit/ |
| Calendar | http://localhost:4321/listings/calendar/ |
| Owner | http://localhost:4321/account/ |
| Admin | http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin |
| Queue | http://localhost:4321/_emdash/admin/plugins/listora/queue |
| Reviews | http://localhost:4321/_emdash/admin/plugins/listora/reviews |
| Claims | http://localhost:4321/_emdash/admin/plugins/listora/claims |

Seed inventory: [ops/seed-inventory.tsv](https://github.com/wbcomdesigns/emdash-listora/blob/main/ops/seed-inventory.tsv). Look for The Golden Fork on the detail page when you check reviews and the map.

## While you edit the plugin

Run `npm run dev` in the plugin folder so `plugin.mjs` rebuilds. Restart the site if workerd still holds an old isolate.

```bash
cd "${LISTORA_LAB:-../emdash-local}"
npx astro dev stop
npm run dev
```
