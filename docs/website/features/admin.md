# Admin screens

**Included in Free**

Open them from the admin menu, under Listora.

| Page | Where | Job |
| --- | --- | --- |
| Get started | Admin, Listora, Get started | The command that adds the visitor pages, for the installed version, then setup status while something is missing. Once the directory has listings, this page is the queue |
| Listings queue | Admin, Listora, Listings queue | Approve or reject submissions. 25 at a time, with Find and Load more |
| Listing reviews | Admin, Listora, Listing reviews | Moderate reviews |
| Claims | Admin, Listora, Claims | Moderate claims |
| Messages | Admin, Listora, Messages | Messages from listing pages. Delete, in the Handle menu, opens the message and asks first |
| Settings | Admin, Listora, Settings | One tab per group, one Save each |

Get started opens with **Set up visitor pages**: the one command that copies the site kit for the installed version, the visitor addresses it adds, and a link to the install guide at that version. Press **Visitor pages are set up** once they work; after that the card is one line with the guide link. Below it, Get started shows whether the listings collection exists, whether sample data is loaded, and a confirm button, until the directory has listings. Then the page is the queue, with the same card on top. Load sample is safe to click more than once: it adds 12 published listings and two drafts waiting in the Listings queue. A queue row whose listing was deleted offers only **Remove from the queue**.

Settings are their own page, in tabs: Submissions, Listing lifetime, Photos, Messages, and Import and export. Each tab that saves has one Save.

Import and export live on the site kit page `/listings/import/`, for site admins only. Export downloads your published listings (up to 500) as a CSV spreadsheet with the main details of each. Import checks a CSV first (bad rows with the reason, duplicates by title and city), then adds the good rows as drafts in the Listings queue, up to 100 at a time. Nothing is published by an import. Settings links to the page. It is a site page, not an admin screen, because EmDash admin screens cannot take a file or start a download.

## Not built

- Listing type editor (`/types`)
- Search, maps, and review rules as their own settings tabs
- Analytics
- Email template editor
- Audit log
- A setup wizard. Get started is a checklist plus **Load sample directory**. It does not create the collection or copy the directory pages.
