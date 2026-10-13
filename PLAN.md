# Listora 0.5.0 plan

Scoped with the owner on 2026-10-13. Every task is a GitHub issue under the `0.5.0` milestone. Work them in the order below. One rule sits over all of it: **no half-cooked features**. If a site owner with no technical help cannot use a thing from start to finish, it is not built or shipped in that form.

## Decisions

| Question | Decision |
| --- | --- |
| Who adds photos | Members upload, the admin approves |
| Photo limit | Set on the Settings page. Starts at 5 photos, 5 MB each |
| Gallery | Large photo with thumbnails, click to enlarge |
| Listing with no photo | Built-in panel in the site's colours, or the owner's own default image. No stock photos |
| Time zone | One site setting |
| Owner edits a listing | Yes. Changes wait for approval |
| Owner replies to a review | Yes. Replies wait for approval |
| Expired listing | Leaves the directory. Its page stays and says expired |
| Warning before expiry | One email, 7 days before |
| Owner's messages | Read, mark as done, count of new. No delete |
| Message notice timing | Hourly, fixed |
| Featured listings | Shown once, in the top row |
| Where the admin approves | One place: the existing queue, items labelled |
| Long admin lists | Next and Previous, plus find by name |
| Import and export | Real files only. Duplicates skipped and listed. Parked if not reliable |
| Setup | One-page developer guide and one command |
| Preview check | A preview copy of knowxtheme.com |
| Version | 0.5.0 |

## Already built (PR #37, not merged)

#23 kit on any site, #20 owner messages and hourly notice, #26 expiry and renew, #24 category and city filters.

## Order of work

| Step | Issue | Task |
| --- | --- | --- |
| 1 | #27 | Settings page, and the queue page without settings |
| 2 | #39 | Site time zone |
| 3 | #38 | Placeholder and default image |
| 4 | #44 | Featured listings shown once |
| 5 | #45 | Admin tables: paging and find by name |
| 6 | #43 | Owner inbox: count and mark as done |
| 7 | #42 | Email before expiry |
| 8 | #40 | Owner edits a listing, with approval |
| 9 | #41 | Owner reply to a review |
| 10 | #25 | Photos: uploads with approval, gallery |
| 11 | #46 | Import and export as real files (prove first, park if not reliable) |
| 12 | #47 | Setup guide and one command |
| 13 | #48 | Full QA, preview on knowxtheme.com, release |

Steps 1 to 7 are small and independent. Steps 8 to 10 share one pattern: a member sends something, it waits in plugin storage, the admin approves it in the queue. Build that pattern once in step 8 and reuse it.

## Rules every task follows

- A member route never writes to a listing. What a member sends waits in plugin storage until an admin decides.
- Every admin decision carries the version the admin saw.
- Mail goes only to an account address, with no link and nothing a visitor or member typed.
- Each task is done when its tests pass and it has been walked in a browser as guest, subscriber and admin, including a failed request, at 1440 and 390, in light and dark.
- Each task adds its cases to `docs/qa/QA_CHECKLIST.md`.
- Nothing is published until step 13.

## Parked

#28 type editor, reminders, health check (milestone Later). Per-listing time zone. Data and map export formats. File import from the media library.
