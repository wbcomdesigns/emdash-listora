# Listora 0.5.0 plan

**Status: LOCKED on 2026-10-13.** The decisions and the order below were agreed with the owner. An agent does not change scope, add options, or reorder steps. If a task cannot be done as written, stop, say why on its issue, and wait for the owner.

Scoped with the owner on 2026-10-13. Every task is a GitHub issue under the `0.5.0` milestone. Work them in the order below. One rule sits over all of it: **no half-cooked features**. If a site owner with no technical help cannot use a thing from start to finish, it is not built or shipped in that form.

## Corrections after reading EmDash's own guides (2026-10-13)

**This section wins over any older line in this file or on an issue.**

- **Time zone (#39):** no plugin setting. Use the time zone and date format in EmDash's own site settings.
- **Import and export (#46):** all inside the admin, no kit address. Export is a raw plugin route that returns a real .csv, behind a Download button. Import reads a spreadsheet the admin uploaded to the media library and picked with the media picker (`media:bytes:read`). Prove both on the lab first; park both if not reliable.
- **Owner alert (#27):** a card on the EmDash dashboard (`admin.widgets`) with what is waiting: listings, reviews, claims, messages. The emails stay as the extra where a site has mail.
- **Search, comments, categories:** EmDash has them. Listora's directory search stays ours because it filters by type, place and distance, which core search does not. Do not add comments of our own anywhere.
- **Visitors first:** contact messages and browsing are visitor features and must work on any hosting. Where EmDash gives no trusted visitor address, limit by browser cookie, not by refusing everyone.
- **Registry install is the whole product.** The in-text block (#50) is an extra for a trusted install.
- **Load the `emdash-plugin-development` skill** before any task.

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

## Already built (PR #49, not merged)

#23 kit on any site, #20 owner messages and hourly notice, #26 expiry and renew, #24 category and city filters.

## Order of work

| Step | Issue | Task |
| --- | --- | --- |
| 1 | #27 | Settings page, and the queue page without settings. **Done 2026-10-13** |
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

## Giving a task to an agent

Tell the agent one thing: "Read `PLAN.md` and `ops/handoff.md` in `~/code/emdash-listora`, then work issue #N."

- **Branch.** All 0.5.0 work lives on the `0.5.0` branch (PR #49 into `main`). An agent branches from `0.5.0` as `0.5.0-<issue number>` and opens a pull request back into `0.5.0`. Nobody commits to `main`.
- **Own lab.** Two agents must not share a lab site: `reset-lab.sh` wipes its database. Each agent creates its own with `LISTORA_LAB=../emdash-lab-listora-<issue> LISTORA_PORT=<free port from 4340 up> ./scripts/setup-lab.sh`, and passes the same two values to every lab script (`LISTORA_BASE=http://localhost:<port>` for `prove-lab.sh`).
- **Can run side by side:** steps 1 to 7, and 11 and 12. They touch different screens. Steps 1, 2 and 3 all add to the Settings page, so step 1 merges first and the other two build on it.
- **One agent, in order:** steps 8, 9 and 10. They share the wait-then-approve pattern.
- **Last, alone:** step 13.
- **An agent stops** when its task passes its own tests and browser walk and its pull request is open. It never merges into `main`, never tags, never publishes.
- **Report on the issue:** what was built, what was walked in the browser and as which role, what was not verified.

## Parked

#28 type editor, reminders, health check (milestone Later). Per-listing time zone. Data and map export formats. File import from the media library.

## Who uses this today (owner, 2026-10-13)

Everyone installing an EmDash plugin today is a developer. So a step that needs a developer (copying the kit, a trusted install to get an in-text block) is acceptable now. The screens the site owner and visitors use after setup still have to be plain and complete: no internal ids, no half-built features. We keep polishing setup as EmDash grows.

After step 12, do #50 (in-text Listings block, prove first).

## Before any task

Read `EMDASH-SUPPORT.md` in `~/code/emdash-plugin-starter` (`wbcomdesigns/emdash-plugin-starter`). If a task depends on a row marked "not proven", prove it on the lab first. If the proof fails, stop and tell the owner on the issue. Do not build around it.
