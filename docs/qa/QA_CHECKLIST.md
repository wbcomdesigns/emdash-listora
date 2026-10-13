# QA checklist

**Included in Free**

One living list of flow-level cases for Listora on EmDash. Walk all of it before every release. When you add or fix behaviour, add or change its case in the same pull request. There are no per-release QA files.

Last walk: 2026-10-13, version 0.3.0, on the lab, as guest, subscriber and admin.

Walked in the browser: G-1, G-2, G-4, G-8 to G-10, M-1 to M-4, M-6 to M-8, M-13, A-1, A-5, A-6, P-1 to P-4 and P-7. Checked at route level only: G-5 to G-7, G-11, G-12, M-5, M-9 to M-12, A-2 to A-4, A-8 to A-11. Not walked yet: G-3, A-7, A-12 in the browser, P-5, P-6 and P-8 by hand.

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
| G-5 | View page source of a listing | One `application/ld+json` block. `@type` matches the listing type (Hotel, Event, JobPosting and so on) | prove: detail JSON-LD |
| G-6 | Open `/listings/does-not-exist/` | The site's 404 page with a 404 status, not a redirect | |
| G-7 | Open `/listings/calendar/` | Upcoming events only, soonest first. Past events are absent | prove: calendar |
| G-8 | Click Save on a listing | "Sign in to continue" with a sign-in link. Nothing is saved | refuses guests on every member route |
| G-9 | Open `/listings/submit/` | Sign-in prompt. No form in the page | refuses guests |
| G-10 | Open `/account/` | Sign-in prompt. No dashboard data in the page | prove: guests refused |
| G-11 | Send a contact message from a listing | "Message sent." A ninth message inside an hour is refused | |
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

## Known gaps (do not fail a release on these, do not hide them)

- Contact messages are stored but not delivered and have no admin screen
- Archive shows at most 80 listings, no paging
- The featured row's listings repeat at the top of the grid
- Primary button text in dark mode follows the site theme's own colours
- Not yet walked: right-to-left layout, a screen reader pass, a clean second-site install
