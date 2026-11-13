# Admin screens

**Included in Free**

Open them from the admin menu, under Listora.

| Page | Where | Job |
| --- | --- | --- |
| Get started | Admin, Listora, Get started | The command that adds the visitor pages, for the installed version, then setup status while something is missing. Once the directory has listings, this page is the queue |
| Listings queue | Admin, Listora, Listings queue | Approve or reject new listings. 25 at a time, with Find, Next and Previous |
| Listing changes | Admin, Listora, Listing changes | Approve or reject the changes owners send for their live listings, each field shown as it is now and after approval |
| Listing photos | Admin, Listora, Listing photos | Approve or reject the photos owners add, with the picture |
| Listing reviews | Admin, Listora, Listing reviews | Moderate reviews, and owners' replies to reviews |
| Claims | Admin, Listora, Claims | Moderate claims |
| Messages | Admin, Listora, Messages | Messages from listing pages. Delete, in the Handle menu, opens the message and asks first |
| Settings | Admin, Listora, Settings | One tab per group, one Save each |

Get started opens with **Set up visitor pages**: the one command that copies the site kit for the installed version, the visitor addresses it adds, and a link to the install guide at that version. Press **Visitor pages are set up** once they work; after that the card is one line with the guide link and **Show the setup steps again**. Below it, Get started shows whether the listings collection exists, whether sample data is loaded, and a confirm button, until the directory has listings. Then the page is the queue, with the same card on top. Load sample is safe to click more than once: it adds 12 published listings and two drafts waiting in the Listings queue. A queue row whose listing was deleted or is in Trash says so and offers only **Remove from the queue**, which asks once. Approve and Reject each apply only while the listing still waits, so a stale click from a second tab is refused with a plain message.

Settings are their own page, in four short tabs that fit a phone: Listings, Lifetime, Photos and Email, each with one Save. The Import and export link sits under the tabs.

Every page and every decision fits Cloudflare's limit of 10 requests per plugin call (0.7.0). That is why owner changes and photos have their own pages: on one page with the new listings, a decision and the page drawn after it did not fit. A decision cut off part way (a failed write, a request running out of time) leaves its item marked "being approved"; the next click on it, five minutes later, puts it back in the list to decide again.

While Listora brings a 0.6.x site's data over to 0.7.0, a banner on every Listora page says so. It runs by itself, a step a minute, and every screen keeps working meanwhile.

Import and export live on the site kit page `/listings/import/`, for site admins only. Export downloads every published listing as a CSV spreadsheet with the main details of each (the page fetches them 700 at a time and joins them into one file). Import checks a CSV first (bad rows with the reason, duplicates by title and city), then adds the good rows as drafts in the Listings queue, up to 100 per file, sent three at a time. Nothing is published by an import. Settings links to the page. It is a site page, not an admin screen, because EmDash admin screens cannot take a file or start a download.

## Not built

- Listing type editor (`/types`)
- Search, maps, and review rules as their own settings tabs
- Analytics
- Email template editor
- Audit log
- A setup wizard. Get started is a checklist plus **Load sample directory**. It does not create the collection or copy the directory pages.
