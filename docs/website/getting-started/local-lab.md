# Run the local lab

**Included in Free**

The lab is how we prove a change. A green route test is not enough. Open the screens.

```bash
cd ~/code/emdash-listora
npm install --legacy-peer-deps
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

`reset-lab.sh` wipes `~/code/emdash-local/data/emdash.db`, rebuilds the plugin, starts Astro, hits health, then calls the dev-bypass so the 33 listings land.

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
cd ~/code/emdash-local
npx astro dev stop
npm run dev
```
