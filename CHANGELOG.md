# Changelog

Versions match `package.json`, the git tag, and the EmDash registry release. Newest first. Never publish a version that is not on `origin/main`.

## [Unreleased]

## [0.5.3] - 2026-10-14

Copy the kit again (`scripts/add-to-site.sh`) after you update.

- Security - A listing's website is only ever a full http or https address. The directory never draws a website link that could run code, the CSV import refuses such a row, and an edit request drops it.
- Security - The directory's server-side calls run inside EmDash itself, with no web request, so a visitor can never make the site call another address.

## [0.5.2] - 2026-10-14

Copy the kit again (`scripts/add-to-site.sh`) after you update.

- Fix      - The directory offers a type filter only for the types its listings use, and hides the row when there is only one, so a visitor never picks a type with no listings.

## [0.5.1] - 2026-10-14

Fixes the site pages on a site that installed Listora from the registry. Copy the kit again (`scripts/add-to-site.sh`) after you update.

- Fix      - The directory pages can reach Listora on a registry install. EmDash gives a registry plugin its own id, so adding a listing, reviews, saving, messages and the account page all failed there; they worked only where Listora was installed from local files.
- Improve  - The registry banner is the full name with margins, so nothing is cut off on a phone.

## [0.5.0] - 2026-10-14

Owner tools, photos, expiry, import and export, and a one-command setup. New permissions: sending email, reading and assigning categories, and adding files to the media library. Run `scripts/add-to-site.sh` again after you update.

- New      - Optional Listings block for post and page text: a row of listing cards filtered by type, category or city. It is site code you switch on in `astro.config.mjs`; the registry plugin is unchanged.
- New      - One setup command (`scripts/add-to-site.sh`) adds the directory pages to a site and writes a seed for the listings collection, with a one-page install guide.
- New      - Import and export at `/listings/import/` for site admins: download your listings as a spreadsheet, or add up to 100 at a time from a CSV. The file is checked first, bad rows and duplicates are listed, and imported listings wait in the queue as drafts.
- New      - Settings has its own page, in groups, with a line saying what each option does. The Listings queue page shows only what is waiting.
- New      - A card on the EmDash dashboard shows how many listings, reviews, claims and messages are waiting, with a link to each.
- New      - Browse by category and by city on the directory page, with a count on each. A category on a listing page links to its filtered list.
- New      - The add-a-listing form offers the site's own categories and saves the choice on the listing. Needs one new permission: reading and assigning categories.
- New      - Owners can edit their own listing from their account. The public listing stays as it is until you approve the change, and you see each changed field, before and after, in the Listings queue.
- New      - Photos. An owner adds photos to their listing from their account (JPEG, PNG or WebP, 5 MB each, up to the number you set). Each photo waits in the Listings queue, where you see the picture and approve or reject it. The listing page shows the photos as thumbnails that open a large view, with keyboard and swipe. The first approved photo becomes the cover when the listing has none. Needs one new permission: adding files to the media library.
- New      - You can also add photos yourself: edit the listing and use its Photos field.
- New      - A listing owner can reply once to each review of their listing. The reply shows under the review, marked "Reply from the owner", after you approve it.
- New      - Messages tab in the owner's account: the member who added or claimed a listing reads the messages visitors send about it.
- New      - The owner's Messages tab shows how many are new, marks new ones in words, and lets the owner mark a message as done or as new again.
- New      - Once an hour the owner gets a short email saying messages are waiting. It goes to their account email and carries no visitor text. Needs a mail provider on the site and one new permission: sending email. A setting turns it off.
- New      - Listing expiry. Set how many days a listing stays live (0 means never). A daily check takes expired listings out of the directory, and the owner can renew from their account.
- New      - Seven days before a listing expires, its owner gets one short email telling them to sign in and renew. A setting turns it off.
- New      - A listing page shows the extra details of its type under the summary: an event's start and end, a home's bedrooms, bathrooms and price, a restaurant's cuisine, a job's salary and so on. Before, the form asked for them and no page showed them.
- Improve  - Admin lists show plain dates and type names, and the setup note leaves the Listings queue once the directory is ready.
- Improve  - The admin lists (listings, reviews, claims, messages) show 25 at a time with Load more, and a box to find an item by its text. A decision keeps your place in the list.
- Improve  - Search results that appear as you type are now the same cards as the rest of the page, so they keep each listing's real photo. The address bar follows the search, so a result page can be shared, and a search inside a category no longer reloads the page.
- Improve  - Featured listings appear once, in the top row, not again in the list below.
- Improve  - Sorting by rating works across every page of results.
- Improve  - A listing with no photo shows a panel in your site's colours with an icon for its type. Stock photos are gone, and no image is loaded from another website.
- Improve  - Opening hours, "Open now" and event times use your site's own time zone from EmDash's settings. Before, every site was treated as New York.
- Improve  - The event start and end fields are proper date-and-time pickers.
- Improve  - "Delete my data" says exactly what it removes and what it keeps, and now also removes replies and anything still waiting for approval. "Download my data" gives a real file.
- Improve  - The kit works on any EmDash site: one file, `ListoraLayout.astro`, connects the pages to your own layout. Proven on a second site that is not the starter.
- Improve  - A new listing is checked on the server as well as in the form: the confirm tick, the listing type and the website address.
- Improve  - A listing owner can no longer review their own listing.
- Improve  - Dates in the account read in the site's time zone, the same as everywhere else.
- Improve  - The account Overview counts are links to their tabs.
- Improve  - Keyboard and screen reader use: the listing tabs are one tab stop, each form step announces itself, and side panels use proper heading levels.
- Improve  - The setup command never replaces a page that is your own: it names the file and stops.
- Fix      - A listing's own photo is now the image used when its page is shared and in its search engine data. Before, a stock photo was used.
- Fix      - An event time entered without a zone is shown as entered, not shifted.
- Fix      - A wrong number of days for expiry is refused with a message. Before, it was quietly saved as 0, which switched expiry off.
- Fix      - Renew now works and has a button. Before, it saved a change that never went live.
- Fix      - The category picked on the form was never sent. The form listed five fixed categories that may not exist on the site.
- Fix      - The hourly limits on messages, claims and reviews hold when requests arrive at the same moment.
- Fix      - An event's search engine data now carries its start date, end date and location.
- Fix      - A saved listing stays marked as saved after a reload, on its own page and on the directory.
- Fix      - A listing with a street address and no map position now shows its address.
- Fix      - The spreadsheet export no longer puts an apostrophe in front of a negative map position.
- Fix      - The add-a-listing form no longer starts with United States and New York filled in, and its preview shows the listing type by name.
- Fix      - The claim form no longer promises an email. The decision shows in the member's account.
- Security - A member's account id no longer appears in anything a visitor or another member can see. Review ids are replaced by opaque handles.
- Security - The public list of reviews now returns named fields only. Before, it also carried the reviewer's email when one was given.
- Security - An owner's change is shown to you as exact text and applied from the same source, hidden characters are removed, and a change or reply cannot be approved once its sender no longer owns the listing.
- Security - Listing text written into a page's search engine data can no longer break out of it, and an image address that is not a normal web address or a path on the site is dropped.
- Dev      - Removed "Near me". EmDash blocks location access on every page, so it could not work on any EmDash site.

## [0.4.1] - 2026-10-13

Found by walking every QA case in the browser as guest, member and admin. Copy `site-kit/` again after you update.

- New      - Delete my data on the account Profile tab. The erase function existed with no button.
- Improve  - Primary buttons stay readable in dark mode, including on hover.
- Improve  - Star glyphs meet contrast in light mode.
- Improve  - Listing tabs respond to the left and right arrow keys.
- Fix      - A failed request no longer leaves a blank area: reviews, the dashboard and search each say what happened.
- Fix      - Search no longer stays stuck in its busy state when a request fails.
- Fix      - The rating in structured data uses the listing's own type (Restaurant, Event, Hotel and so on) and joins the page's own listing block.

## [0.4.0] - 2026-10-13

Bigger directories, a Messages screen, and a kit that suits existing sites. Copy `site-kit/` again after you update, including the new `site-kit/public/vendor/` folder.

- New      - Paging. The archive shows 24 listings per page with Previous and Next, and the directory is no longer cut off at 80 listings.
- New      - Messages admin page. Read what visitors sent from a listing, mark it handled or delete it.
- New      - The map library ships inside the kit, so a site that only allows its own scripts needs no change.
- Improve  - Ratings are kept in the plugin's own storage. Approving a review never touches or republishes the listing.
- Improve  - A rating updates at once when a member rewrites or erases their review.
- Improve  - The account and submit pages tell the site never to cache them, because they differ per visitor.
- Improve  - Public listing reads are cached for 30 seconds, so a busy page does not repeat the same work.
- Fix      - The submit form was missing the Bathrooms field for real estate listings.
- Fix      - A contact message is only accepted for a public listing, and is capped at 1000 characters.
- Dev      - New public route `ratings`. `listings` and `search` take `page` and `per_page` and return `total`, `page`, `pages`.
- Dev      - Tests fail if the listing-type lists in the plugin, the kit, the manifest and the submit page drift apart.

## [0.3.1] - 2026-10-13

Safety follow-up to 0.3.0. No kit changes: you do not need to copy `site-kit/` again.

- Fix      - Approving a review or a claim no longer publishes unfinished edits that were sitting on the listing. The rating waits and catches up once the listing is published.
- Fix      - A bad record can no longer stop the Listora admin pages from loading.
- Security - Members can only review, save or claim a public listing.
- Security - The member dashboard only shows a listing's name when the listing is public or the member submitted it.

## [0.3.0] - 2026-10-13

Members sign in, the core flows finish, and the directory works in dark mode. Copy `site-kit/` again after you update: the pages and the CSS changed.

- New      - Members act as their signed-in account. Adding a listing, reviewing, saving, claiming and the dashboard need a sign-in. Guests browse and can message a listing.
- New      - `review` route for members. One review per member per listing. Writing again replaces it and sends it back for approval.
- New      - Registry listing has a name, icon, banner, screenshots, long description, install steps and FAQ.
- Improve  - Approving or rejecting a review recalculates the listing rating.
- Improve  - Approving a claim marks the listing as claimed and makes the claimant its owner.
- Improve  - Reviews and Claims tables show the listing name, the star count and the full text being approved.
- Improve  - The member dashboard shows listing names, links and plain status wording, and its tabs scroll in one row on a phone.
- Improve  - A rating catches up after a member rewrites or erases an approved review.
- Improve  - Spam keywords can be edited in Settings.
- Improve  - The submit limit is eight per hour per member instead of a permanent block.
- Improve  - Listing schema uses the listing type's own schema.org type.
- Improve  - Calendar lists upcoming events only, soonest first.
- Fix      - Submitting with Require moderation off publishes the listing instead of leaving it as an unlisted draft.
- Fix      - Reviews and Claims admin pages failed to load once they had a row to show.
- Fix      - The directory was unreadable in dark mode. Kit colours now follow the site theme.
- Fix      - Search icons overlapped the placeholder text.
- Fix      - A missing listing returns a real 404.
- Security - Import, export and the claims list need an admin. A member id sent in a request is ignored.
- Security - Kit pages escape review, listing and dashboard text before showing it.
- Security - A review or claim rewritten after the admin loaded the page cannot be approved without a second look.
- Dev      - `reviews` is read only. `favorites`, `dashboard`, `privacy`, `renew`, `claims` and `submit` are member routes. `import` is admin only.
- Dev      - `docs/qa/QA_CHECKLIST.md` lists the release cases by role. `scripts/lab-role.sh` switches the lab account to a subscriber.
- Dev      - One `api`, `esc` and `notify` helper in `site-kit/lib/listora.ts`. Typecheck runs inside `npm test`.

## [0.2.1] - 2026-10-13

Site-kit chrome. Copy `site-kit/` again after install. Plugin routes stay the same.

- Improve - Type chips and detail tabs stay one row and scroll sideways on a phone.
- Improve - Featured listings use a horizontal track instead of a stacked card grid.
- Improve - Detail cover fills the content width. Title sits beside the sidebar on desktop.
- Improve - Detail sidebar uses owner, contact, hours, map, and claimed cards.
- Improve - Calendar event times use America/New_York. Date-only events stay on that calendar day.

## [0.2.0] - 2026-10-13

First-run Get started plus drop-in site-kit pages so testers see a finished directory.

- New - Get started admin page with Load sample directory (12 NYC listings, reviews, a claim).
- New - Drop-in archive, detail, submit, calendar, and account pages in `site-kit/pages/`.
- New - QA catalog at `docs/qa/` for owner readiness and the screen walk.
- Improve - Directory command bar, location, Near me, sort, card rating, owner, and amenity chips.
- Improve - Health no longer writes demo rows on an empty site.
- Improve - Count copy uses singular for one listing or result.

## [0.1.0] - 2026-10-13

First registry release as `@vapvarun.bsky.social/listora`.

- Sandboxed engine: listings, search, submit, reviews, claims, favorites, dashboard, contact, import, privacy, renew
- Block Kit admin: queue, reviews, claims
- Site kit: `--listora-*` tokens, 33 NYC seed listings, archive / detail / submit / calendar / account screens in the local lab
- Publisher: `did:plc:2o6axbe264shvyedyhycyhya`
