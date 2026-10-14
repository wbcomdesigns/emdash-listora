# QA checklist

**Included in Free**

One living list of flow-level cases for Listora on EmDash. Walk all of it before every release. When you add or fix behaviour, add or change its case in the same pull request. There are no per-release QA files.

Last walk: 2026-10-14, version 0.5.0, as guest, subscriber and admin.

How it was walked: an independent pass (not the person who built it) ran the cases in a browser on the starter-template lab and the portfolio-template lab and looked at a screenshot of every screen, at 1440, 768 and 390 in light and dark, plus keyboard, right-to-left and the accessibility tree. It found 22 points. Each real one was fixed and re-checked in the browser, and the cases it did not reach were then walked by the builder: G-23, M-6, A-16, A-41, A-49, A-52, A-53, and the new cases G-35 to G-37, M-40 to M-43.

Covered by an automated test only, because the lab cannot produce the state by hand: A-12 (no collection), A-17, A-20 and A-29 (scheduled tasks and mail), A-13, A-14, A-32, A-33, A-36 and A-37 (stale or rejected items). A-42 was walked when photos were built and not again in this pass.

Not done: a pass with a real screen reader, swipe on a real phone, a measured contrast figure for every text and background pair (judged by eye in both themes), and a preview on a live site (see Known gaps).

## Setup

```bash
./scripts/reset-lab.sh            # clean seed data
./scripts/prove-lab.sh --all      # route-level smoke, must pass first
./scripts/lab-role.sh subscriber  # walk member cases as the lowest signed-in role
./scripts/lab-role.sh admin       # switch back for admin cases
```

Sign in on the lab: `http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/account/`. For guest cases use a private window.

Three roles, always in this order: **guest**, **member** (subscriber role), **admin**. A case proven only as admin is not proven. Name test data `QA-RFT ...` and reset the lab afterwards.

"Auto" names the test in `tests/plugin.test.ts` or the `prove-lab.sh` check that covers the route. Auto covers the engine only. The browser step is still required for every case with a screen.

## Guest

| ID | Steps | Expected | Auto |
| --- | --- | --- | --- |
| G-1 | Open `/listings/` | Cards, type chips, featured row, count. No sideways scroll at 390 | prove: archive |
| G-2 | Type in Search listings and in City | Icons sit left of the text and do not overlap the placeholder. Results update | prove: search |
| G-3 | Click a type chip, then Grid / List, then the sort menu | Results filter and reorder. The active control is clearly marked | |
| G-4 | Open a listing | Cover, badges, rating with review count, hours, map, tabs. Published reviews only | prove: detail, reviews |
| G-5 | View page source of a listing | The site's own block, plus the listing block and the rating block, which share one `@id` so they read as one listing. `@type` matches the listing type (Hotel, Event, JobPosting and so on). No value is `null` | prove: detail JSON-LD |
| G-6 | Open `/listings/does-not-exist/` | The site's 404 page with a 404 status, not a redirect | |
| G-7 | Open `/listings/calendar/` | Upcoming events only, soonest first. Past events are absent | prove: calendar |
| G-8 | Click Save on a listing | "Sign in to continue" with a sign-in link. Nothing is saved | refuses guests on every member route |
| G-9 | Open `/listings/submit/` | Sign-in prompt. No form in the page | refuses guests |
| G-10 | Open `/account/` | Sign-in prompt. No dashboard data in the page | prove: guests refused |
| G-11 | Send a contact message from a listing | "Message sent." A ninth message inside an hour is refused | |
| G-13 | Open `/listings/` on a directory with more than 24 listings | 24 cards, "Page 1 of N", Next works, the filters stay applied on page 2 |
| G-14 | Type a search that matches more than 24 listings | The first 24 show with "Page 1 of N" and Next, which keeps the search |
| G-15 | Watch the network panel on the archive and a listing page | The map script and style load from `/vendor/leaflet/` on the site. Nothing from unpkg |
| G-16 | Check response headers of `/account/` and `/listings/submit/` | `Cache-Control: private, no-store` |
| G-17 | Open the archive | Rated listings show stars and a number on the card after load. Unrated ones show nothing |
| G-18 | Open `/listings/` | A Category row and a City row of chips, each with a count. Only categories and cities that have live listings |
| G-19 | Click a category chip | Only that category's listings, the count matches the chip, the chip is marked active, the featured row is hidden. Click it again to clear |
| G-20 | With a category active, type a search | The category stays applied and the page does not reload |
| G-21 | Click a city chip | The city fills the location box and the list narrows to it |
| G-22 | Change the site time zone in EmDash Settings, General, then open the directory, a listing and the calendar | Open and Closed badges, the "today" row in the hours table and event times all follow the new zone. Live search cards show the same badges as the page |
| G-23 | A site with no time zone set | Pages work and use UTC |
| G-24 | A listing with no photo, on a card, on its page and in live search | A coloured panel with an icon for its type. No photograph. Readable in light and dark. The network panel shows no image from another website |
| G-25 | A listing with a photo: view the page source | `og:image` and the structured data image are the listing's own photo, as a full address. A listing with no photo has no share image |
| G-26 | Type in the search box | Results change without a reload and keep each listing's real photo. The address bar shows the search. The map shows only the listings in the results |
| G-27 | Open the plain directory | No listing in the Featured row appears again in the list below. The count still says how many listings there are in all, and the last page is reachable |
| G-28 | Sort by Rating | Highest rated first, across pages |
| G-29 | Block the page request (go offline) and type a search | "Search is not available right now", and the busy state clears |
| G-30 | Search in list view, and inside a category | The view and the category stay |
| G-31 | Request the `reviews` route for a listing directly | Each review has only: id, author, stars, title, body, date, owner reply and its date. No email, no member id | owner reply to a review |
| G-32 | A listing with photos | Thumbnails under the cover. A thumbnail opens a large view saying "Photo 1 of N" |
| G-33 | In the large view: Right and Left arrow keys, Esc, the Close button, a click on the dark area, a sideways swipe on a phone | Arrows and swipe move between photos. Esc, Close and the dark area close it. Focus returns to the thumbnail |
| G-34 | The same at 390 in dark | The large view fits the screen with no sideways scroll |
| G-35 | Open an event, a home, a restaurant and a job listing | The extra details of that type show under the summary with plain labels: Starts and Ends as a date and time in the site's zone, Bedrooms, Bathrooms, Price, Cuisine, Salary and so on. A listing with none shows nothing there |
| G-36 | View source of an event listing | The Event block has `startDate`, `endDate` when set, and `location` with the address |
| G-37 | A listing with a street address and no map position | A Location card with the address, and no empty map |
| G-12 | Request `import`, `dashboard`, `favorites`, `privacy` routes directly | 401 each | prove: guests refused |

## Member (subscriber role)

| ID | Steps | Expected | Auto |
| --- | --- | --- | --- |
| M-1 | Sign in, open `/account/` | "Signed in as" your name. Counts for listings, reviews, claims, favorites | prove: dashboard |
| M-2 | Walk all five steps of Add a listing and submit | "Your listing is in review". It is not on `/listings/` yet | |
| M-3 | Open My listings | The new listing with "Awaiting approval". No link until it is public | |
| M-4 | Write a review on a listing | "Your review will appear once it is approved". It is not in the list yet | keeps a new review pending |
| M-5 | Write a second review on the same listing | It replaces the first. Still one review from you | |
| M-6 | Put `<b>` and `<img onerror>` in a review, get it approved, reload | Shown as plain text. No script runs | |
| M-7 | Click Save, then click again | Button reads Saved, then Save. Favorites tab shows the listing name as a link | ignores a member id sent in the request |
| M-8 | Claim an unclaimed listing | "Claim sent for review". Claims tab shows the listing name and "Awaiting approval" | |
| M-9 | Profile tab, Export my data | JSON with only your reviews, claims and favorites | erases only the caller's own data |
| M-10 | Request `import` and the `admin` route directly | 403 each | |
| M-11 | Submit nine listings inside an hour | The ninth is refused with a clear message. Works again after an hour | limits a member to eight writes |
| M-12 | Send another member's id in a request body | Ignored. You only ever see and change your own rows | ignores a member id sent in the request |
| M-14 | Call review, claims or favorites with the id of a draft or missing listing | "That listing is not available." Nothing is stored | refuses member actions on a listing that is not public |
| M-15 | Profile tab, Delete my data: click once, then again | First click asks you to click again and deletes nothing. Second click deletes your reviews, claims and saved listings, and the counts drop to zero |
| M-16 | Open `/account/?tab=messages` as the member who added a listing, after a visitor messaged it | The message, the sender's name and a mail link, the date. Markup in a message shows as text. Another member sees none. After a claim by someone else is approved, the messages move to that member | notifies the current owner from the hourly task |
| M-17 | With expiry on, open My listings | Each live listing shows "Expires <date>". Renew shows when expired or inside 30 days. Renew confirms "Renewed until <date>". A failed request says so and the button works again | dates a listing on approval |
| M-18 | Call `renew` for someone else's listing | Refused | same test |
| M-19 | Add a listing and pick a category on step 4 | The list shows the site's own categories plus "No category". After approval the listing page shows the category as a link, and the directory count for it goes up by one | |
| M-20 | Add an event: the Starts and Ends fields | Date-and-time pickers. The help says the site's time zone. After approval the calendar shows the time exactly as entered |
| M-21 | Open Messages as a listing owner with two new messages | The tab shows 2. Each message carries the word New and a Mark as done button |
| M-22 | Mark one as done, reload | The count drops to 1, the message moves to the bottom without the New mark, and stays so after reload. Mark as new puts it back |
| M-23 | Block the request and press Mark as done | A message says it could not be done, and the button works again |
| M-24 | Call `message` for a message on someone else's listing, or with a made-up id | The same "not available" answer for both | notifies the current owner from the hourly task |
| M-25 | My listings, a live listing: press Edit | The add-a-listing form opens as "Edit your listing", filled in, on Basics, with the type locked and no category field |
| M-26 | Change the title and phone, send | "Your changes are waiting for approval." My listings shows "Changes waiting for approval" and "Edit again". The public page is unchanged | owner edits a live listing |
| M-27 | Send the form without changing anything | "Nothing was different, so there is nothing to approve." | same test |
| M-28 | Open `/listings/submit/?edit=` with someone else's listing or a made-up id | No form. "That listing is not available to edit." | same test |
| M-29 | Reviews tab as a listing owner | "Reviews of your listings" lists published reviews of your listings with the reviewer's name, stars and date. "Reviews you wrote" sits below |
| M-30 | Press Reply, write a reply, send | "Waiting for approval" with your text under the review. The button becomes "Change your reply". The public page does not show it yet | owner reply to a review |
| M-31 | Block the request and send a reply | An error under the form, and the button works again |
| M-32 | Call `reply` for a review on someone else's listing, a made-up id, or a review that is not published | The same "not available" answer | same test |
| M-33 | My listings on a site with photos on | Each of your listings shows "Photos: 0 of N" and Add a photo, including a listing still awaiting approval |
| M-34 | Add a JPEG, then a PNG | "Photo added." Each shows by its file name as "Waiting for approval". No picture and no file address is shown for a waiting photo | owner photos |
| M-35 | Add a file that is not a picture but is named .jpg | "Use a JPEG, PNG or WebP photo." | same test |
| M-36 | Reach the limit | Add a photo goes away. The route refuses a further upload | same test |
| M-37 | Remove a waiting photo | It goes and the count drops. An approved photo has no Remove | same test |
| M-38 | Call `photo` for someone else's listing or a made-up id | Refused | same test |
| M-39 | Open `/listings/import/` as a member, and call `import`, `export` and `admin` | The page says it is for site admins. All three routes answer 403 | `prove-lab.sh` |
| M-40 | Save a listing, reload its page, then open `/listings/` | The button still reads Saved and is pressed, and the heart on its card is on. A guest who never signed in makes no request for this | |
| M-41 | Send `submit` without the confirm tick, with a listing type that does not exist, or with a website that is not a web address | Each is refused with a plain reason. On the form, a bad web address is caught on the Details step | owner reply to a review |
| M-42 | Review a listing you own | Refused: "You cannot review your own listing." | owner reply to a review |
| M-43 | Open the add-a-listing form | Country and State start empty. The preview shows the type by name. After Continue, focus is on the new step's heading |
| M-13 | Dashboard at 390 | Tabs are one sideways-scrolling row. Content starts above the fold | |

## Admin

| ID | Steps | Expected | Auto |
| --- | --- | --- | --- |
| A-1 | Admin, Listora queue | Stats, pending table, settings form. No error banner | renders the queue |
| A-2 | Approve a pending listing | Toast "Listing published". It appears on `/listings/` and in the member's My listings as Approved with a link | |
| A-3 | Turn Require moderation off, submit as a member | The listing is public at once. Turn moderation back on | |
| A-4 | Add a word to Spam keywords, save, submit a listing with that word as a member | Submission rejected. Restore the keywords | |
| A-5 | Open Reviews with at least one pending review | Table loads. Shows listing name, stars, author and the full review text | renders valid Block Kit |
| A-6 | Approve a review | Toast. The listing rating and review count change on the public page | |
| A-7 | Reject a published review's rewrite | The rating drops it | |
| A-8 | Load Reviews, have the member rewrite the review, then click Approve | Refused: "changed after this page loaded". Still pending | refuses to approve a review that was rewritten |
| A-9 | Decide the same claim twice from two tabs | Second decision refused: "already handled" | refuses a second decision |
| A-10 | Approve a claim | Listing shows as claimed with the claimant as owner. It appears in the claimant's My listings | |
| A-11 | A member erases their data after a review of theirs was approved, then you open any Listora admin page | The listing rating no longer counts that review | marks the listing on erase |
| A-13 | Edit a published listing in admin and save without publishing. Then approve a review on it | The unfinished edit stays unpublished. The rating changes after you publish the listing and open a Listora admin page | updates the live rating on approval and leaves a listing with unpublished edits alone |
| A-14 | Same listing: approve a claim on it | Refused with "has unpublished edits". The claim stays pending | |
| A-15 | Open Messages after a visitor sent one | Listing name, sender, the full message, date. Mark as handled removes it from the list |
| A-16 | Open Messages with none waiting | Empty state |
| A-17 | Messages, Owner column | "Notice goes out within the hour" for a new message on a listing with an owner. After the hourly task: "Owner notified", or "Owner not notified" when there is no owner account or no mail provider. One mail per owner per hour, to their account address, with nothing the visitor typed | notifies the current owner from the hourly task |
| A-18 | Turn off "Email the listing owner when a message arrives" and save | Stays off after reload. New messages are stored and marked Owner not notified |
| A-19 | Set "Listings expire after this many days" to 10, save, reload | Shows 10. A listing approved after that carries a date 10 days ahead | dates a listing on approval |
| A-20 | A listing past its date, after the daily check | Gone from the directory and search. Its page says it has expired | marks a listing past its date as expired |
| A-21 | Open Settings | Three groups (Submissions, Listing lifetime, Messages), a line under each heading saying what each option does, a Save button per group | settings page and dashboard card |
| A-22 | Change one option in each group, save, reload | Each stays as saved | same test |
| A-23 | Enter a negative number or text for the days and save | Refused with a message. The saved value is unchanged | same test |
| A-24 | Open the Listings queue | Only counts and the waiting list. No settings form | same test |
| A-25 | Open the EmDash dashboard | A "Listora: waiting for you" card with the four counts and a link to each list. "Nothing is waiting." when all are zero | same test |
| A-26 | With more than 25 listings waiting, open the Listings queue | 25 rows, "Showing 25 of N", Load more adds 25. Approve or reject one further down: the list stays where it was | long admin lists |
| A-27 | Type part of a listing name in "Find in this list" and press Find | Only matching rows, with a line saying how many. Text that matches nothing says "Nothing matches". Reopening the page clears the search | same test |
| A-28 | Settings, Listing lifetime: turn "Email the owner 7 days before" off and save, reload | Stays off. Turn it back on the same way |
| A-29 | A listing expiring within 7 days, after the daily check | Its owner gets one email, to their account address, with no listing name and no link. A second run sends nothing. After a renewal the next date is warned once. Nothing is sent when the switch is off | warns the owner once per expiry date |
| A-30 | Listings queue with an owner's change waiting | A "Changes to live listings" block: the listing name, one line per changed field with before and after, a long change written out in full, Approve and publish, Reject. The dashboard card counts it under Changes |
| A-31 | Approve a change | "Change published." The public page shows the new values. The block goes |
| A-32 | Reject a change | "Change rejected." The public page is unchanged |
| A-33 | The owner sends a newer change after you opened the page, then you approve the old one | Refused: "That item changed after this page loaded." | owner edits a live listing |
| A-34 | Reviews page with an owner reply waiting | An "Owner replies waiting" block: the listing, the review in full, the reply in full as exact text, Approve the reply, Reject the reply. The dashboard card counts it under Replies |
| A-35 | Approve the reply | "Reply published." The listing page shows it under the review as "Reply from the owner" with the date |
| A-36 | The owner rewrites a published reply; reject the rewrite | The earlier reply stays on the page | owner reply to a review |
| A-37 | A change or reply whose sender no longer owns the listing (a claim was approved since) | A warning on the change, and approving is refused | owner edits a live listing |
| A-38 | Listings queue with photos waiting | A "Photos waiting" block: the picture at a size you can judge, the listing, the date, the owner's file name, Approve the photo, Reject and delete. The picture's size shows when EmDash reports it. The dashboard card counts Photos |
| A-39 | Approve a photo | "Photo added to the listing." The listing page shows it. The first photo becomes the cover when there was none |
| A-40 | Reject a photo | "Photo rejected and deleted." The file is gone from the media library |
| A-41 | Settings, Photos: set the number to 0, then back | 0 turns Add a photo off everywhere. A site with no Photos field shows a notice saying how to add it |
| A-42 | Edit a listing in EmDash and add rows to its Photos field | They show in the listing's gallery like owner photos |
| A-43 | Settings, Import and export: follow the link | `/listings/import/` opens with Export and Import panels |
| A-44 | Download listings | A file `listings-<date>.csv` downloads with the column names first and one row per published listing |
| A-45 | Choose a CSV with good rows, a row with no title, an unknown type and a bad latitude, then Check file | "N of M rows are ready", each bad row listed with its row number and reason. Nothing is created yet |
| A-46 | Import N listings as drafts | "N listings added as drafts". They are in the Listings queue, not on the site |
| A-47 | Check the same file again | The imported rows are listed as already in the directory and skipped |
| A-49 | On a new template site, follow `docs/website/getting-started/install.md` and nothing else | `/listings/`, `/listings/submit/`, `/listings/calendar/` and `/account/` all open. Running the command again leaves `ListoraLayout.astro` as it was |
| A-50 | With the block switched on: in a post, type `/listings`, choose Listings | A form with Heading, Listing type (Any type chosen), Category name, City, How many. Insert works straight away |
| A-51 | Insert it mid-article with type Restaurant and 3, save, publish | The post shows the heading and three restaurant cards at that spot, linking to each listing. Looks right at 1440 and 390, light and dark. The article's contents list gains the heading only |
| A-52 | A block whose filters match nothing | Nothing is drawn on the page |
| A-53 | A site without the block switched on | `/listings` offers no Listings block, and nothing else changes |
| A-54 | On a standard blog site, install Listora from the registry (admin, Registry, Install), copy the kit with the setup command, then as a subscriber add a listing, review, save and message | Each works. The kit reaches Listora at its registry id (`r_2oeji6rfeg7ovdex`), not at `/listora/`. Tests: `tests/kit-fetch.test.ts` |
| A-48 | A file over 100 rows, an empty file, a file with no title column | A plain message, nothing imported |
| A-12 | Get started on a site with no listings collection | Clear "create the collection first" message, no crash | tells the owner to create the listings collection first |

## Presentation, every screen

Screens: archive, detail, submit, calendar, account, and the three admin pages. Check each at 1440, 768 and 390, in light and in dark (switch the system setting, do not force a class).

| ID | Check | Expected |
| --- | --- | --- |
| P-1 | Sideways scroll | None at any width |
| P-2 | Dark mode | All text readable. No white panels on a dark page, no dark text on dark |
| P-3 | Text contrast | Body text 4.5:1, large text 3:1 against its background |
| P-4 | Tap targets | Buttons, chips, tabs and inputs at least 40px tall |
| P-5 | Keyboard | Tab reaches every control. Focus ring is visible. Tabs and the wizard work from the keyboard |
| P-6 | Empty, error and busy states | Each list has an empty state with a next step. Failed requests show a message, never a blank area |
| P-7 | Names, not ids | No screen shows a raw id where a listing or member name belongs |
| P-8 | Images | No broken images. Covers keep their shape while loading |
| P-9 | Second site | On a site that is not the starter (see `ops/handoff.md`), the five pages render inside that site's layout and follow its colours and fonts. Add a listing and a review as a subscriber, approve both as admin, and see them live |

## Known gaps (do not fail a release on these, do not hide them)

- The directory reads at most 500 listings. Public reads are cached for 30 seconds, so a change can take that long to show
- The scheduled tasks (hourly owner notice, daily expiry and warning) are proven by automated tests, not by waiting for a real schedule. No real mail provider has been tested: the lab prints mail
- Owner photos are proven on local storage only, not on Cloudflare R2
- A photo waiting for approval sits in the media library. Its address is never shown to anyone, but the file can be fetched by someone who has that address
- EmDash's own admin tables do not fit a phone: at 390 the Decision column is off screen and has to be scrolled to. A plugin cannot change that screen
- The fields in the "Insert Listings" dialog are drawn by EmDash's editor and have no accessible names. A plugin cannot change that dialog
- The contact limit is per visitor IP. On a host that passes no IP, every visitor shares one limit of 8 messages an hour
- Rewriting a published review takes it off the page until it is approved again
- The spreadsheet export carries the main details of each listing (14 columns). Categories, hours, photos and the extra fields of each type are not in it, so it is not a full backup
- An admin list holds up to 300 waiting items, 25 at a time with Load more
- Categories on the add-a-listing form are not narrowed by listing type
- Primary button text in dark mode follows the site theme's own colours
- Not checked on a live site. Our live sites run EmDash 1.1 and this plugin needs 1.2, and a preview copy shares the live database, so it was proven on three local template sites (starter, portfolio, blog) and no live site was touched
