Setting up takes a developer about ten minutes.

1. Install Listora from the registry and confirm the permissions. Your site needs EmDash 1.2 and a sandbox runner in `astro.config.mjs`. Without a runner, EmDash skips sandboxed plugins at startup.
2. Add the directory pages to your site with one command:

   ```bash
   git clone --depth 1 https://github.com/wbcomdesigns/emdash-listora
   emdash-listora/scripts/add-to-site.sh /path/to/your/site
   ```

3. Create the listings collection: `npx emdash seed .emdash/listora-seed.json --no-content` in your site. It adds no content and skips anything that exists.
4. Add four menu links: `/listings/`, `/listings/submit/`, `/listings/calendar/` and `/account/`.
5. Open the admin, Listora, Listings queue, and load the sample directory to see 12 listings with reviews.

Run the command again after each plugin update to refresh the pages. It never replaces the one file that connects them to your layout.

Full guide: https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/website/getting-started/install.md
