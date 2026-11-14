# Plan: Listora on EmDash 1.5.0, release 0.7.0, scope 0.8.0

Status: AUDITED 2026-11-13. An independent audit found 4 blockers and 7 should-fix items; all are folded in below. This plan is written for the wbcomplugins.com review site, a software directory of WordPress plugins, EmDash plugins and tools.

Owner asks (2026-11-13):

- Support the latest EmDash, and bump the version after testing on it.
- Then improve Listora for what wbcomplugins needs: custom listing types, number sorts, software listings. Everything stays general for any directory owner.

## A. Where things stand (checked 2026-11-13)

| Thing | State |
| --- | --- |
| Listora published | 0.6.3 (2026-10-19), tested on EmDash 1.3.x |
| Listora 0.7.0 | Built on branch `0.7.0`, PR #86 open, `package.json` already 0.7.0. Milestone issues #83, #84, #85 are open. Not walked, merged or tagged. Its manifest adds the `directory` collection and new indexes on submissions, reviews, contacts, ratings, notice_queue, rating_queue and rates |
| Listora dependencies | peer `emdash >=1.2.0`. Dev: `emdash ^1.3.1`, `@emdash-cms/plugin-cli 0.13.3` (latest 0.13.6), `@emdash-cms/plugin-test ^0.2.8` (latest 0.2.12) |
| Test sites | `~/code/emdash-lab-all` (Node, port 4340) on `emdash ^1.3.1`. `~/code/emdash-plugin-testbed` (Cloudflare) on `emdash ^1.3.0` with `@emdash-cms/cloudflare ^1.3.0`. Both run the sandbox runner |
| EmDash latest | 1.5.0 (2026-11-11), `@emdash-cms/sandbox-workerd` 0.9.7 |
| Kit fetch helper | `listoraFetch` / `send` in `site-kit/lib/listora.ts` |
| Open owner decision | #83: does a listing a member adds count as claimed? (`SUBMITTER_IS_OWNER`, default true) |
| Repo plan files | `PLAN.md` is the 0.5.0 plan. `SCOPE.md` does not exist yet |

### EmDash 1.4 and 1.5 changes that touch Listora

| # | Change | What it means for Listora | Action |
| --- | --- | --- | --- |
| 1 | 1.4 #4394: `ctx` operations run over an RPC that lasts only for the invocation. Publish after-hooks stay deferred. A same-entry action during an after-hook can fail with `CONTENT_ACTION_REENTRANT`. It also fixes content create, publish and taxonomy writes across Cloudflare isolates | Every `ctx` call must be awaited. A Cloudflare site on 1.3 is still broken for Listora | Grep for un-awaited `ctx.` calls. Add `waitForDeferredTasks()` in tests. Install guide: "Cloudflare: EmDash 1.4 or later" |
| 2 | 1.4 #4286: two concurrent saves of the same entry, one now returns `409 CONFLICT` | `patchListing` (`src/lib/listings-query.ts:55-59`) updates and then publishes. If the publish fails with REENTRANT or 409, the listing keeps a draft and returns `busy` forever | Retry the publish once, then report a clear state the admin can resolve. Add a test |
| 3 | 1.5 #4277: KV storage migration, a coordinated upgrade (not rolling) | Listora uses `ctx.kv` (`state:sweep`, member email, locks) | Steps in B3 and B5: back up, stop, upgrade `emdash` and the sandbox runner together, build without starting, `emdash migrate` by hand, resolve KV conflicts, then start |
| 4 | 1.5 #4582: `@emdash-cms/cloudflare` takes `emdash` as an exact peer | The testbed must bump both together | B5 |
| 5 | 1.5 #4095: state-changing routes return `503 STORAGE_INDEXES_NOT_READY` until the declared indexes exist | 0.7.0 adds indexes, and so will 0.8.0 | The kit's `send` shows a plain "try again in a moment" message on 503. The 0.7.0 changelog and CF-1 cover the wait |
| 6 | 1.5 #4358: `plugin:install` can run again, and the test host runs install and activate itself | `scheduleAll` re-runs with `null` settings and reschedules `upgrade`. Budget numbers may shift | Test: two installs leave one schedule per task and no duplicated data. Re-record the budget |
| 7 | 1.5 #4403: a failed `plugin:activate` leaves the plugin disabled | `scheduleAll` has no catch (`src/plugin.ts:43`) | Check whether activate can throw. If it can, catch the error and log it, and add a test |
| 8 | 1.5 #4715: plugin storage unique indexes are scoped, and migration 095 needs a maintenance window | Listora declares no `uniqueIndexes` | None for Listora. A fleet note for site upgrades |
| 9 | 1.5 #4637 / #4695: save hooks carry `editedBy`, and co-editing is off by default | `afterSave` reads `status` and `draftRevisionId` | Note only |
| 10 | 1.5 #3716: sites created through setup start in staging (noindex) until they go live | Fresh labs show the tag. wbcomplugins must be taken live at launch | Note in the site launch checklist |
| 11 | 1.5 #4641: `astro.config.mjs` options are type-checked | A lab with a wrong option stops building | Fix the lab config if it fails |
| 12 | 1.5 #4483: Zod pinned to 4.6.7 | — | Bump plugin-cli and plugin-test |

## B. Step 1: test sites on EmDash 1.5.0

1. Record the current versions of EmDash and every Wbcom plugin on both sites.
2. Back up both sites:
   - `emdash-lab-all`: copy its data folder.
   - Testbed: `wrangler d1 export` of its database.
3. Update `emdash-lab-all` (this is the upgrade test, using the #4277 steps):
   1. Stop the dev server.
   2. Update `emdash`, `@emdash-cms/*` and the sandbox runner together, then `npm install`.
   3. Build without starting.
   4. Run `npx emdash migrate` by hand and read its KV warnings. Resolve any KV conflicts.
   5. Start on port 4340.
4. Make a fresh standard site, required by the release gate and skill section 6.1:
   1. `npm create emdash@latest ~/code/emdash-lab-150 -- --template blog --platform node --pm npm --yes`, plus the sandbox runner.
   2. Look at the bare site (home and a post, 1440 and 390, light and dark) before judging anything.
   3. If the site is in staging, take it live in settings.
5. Testbed (Cloudflare), a drained update:
   1. Bump `emdash`, `@emdash-cms/cloudflare` and the sandbox runner together.
   2. Build, run migrations against its D1, check the KV warnings, then deploy.
   3. This is a test worker, not a customer site. If permissions block the deploy, the owner runs it.
6. Mix check: each other Wbcom plugin on lab-all (Polls, Reviews, KnowX, Roadmap) still loads its admin page and its kit page. Any break becomes an issue on that plugin's repo and is not fixed in this pass.

## C. Step 2: Listora 0.7.0 tested on 1.5.0, then released

1. On branch `0.7.0`, update the dev dependencies: `emdash ^1.5.0`, `@emdash-cms/plugin-cli 0.13.6`, `@emdash-cms/plugin-test ^0.2.12`. The peer stays `>=1.2.0`. The install guide says it was tested on 1.3 and 1.5, and that Cloudflare needs 1.4 or later.
2. Run `npm test` (unit, races, review, budget) and the typecheck. Fix A1, A2, A5, A6 and A7, each with a test. Re-record the budget; nothing may go over 9.
3. Run `bin/gate.sh` from the skill.
4. Update test before publish, on both sites:
   1. Install 0.6.3 from a file, with data.
   2. Install 0.7.0 from a file over it.
   3. Check the index build, the 503 wait and the data.
   A registry install has a different plugin id and separate storage, so the registry update is checked after publish (step 9).
5. Independent Sonnet walk:
   - `docs/qa/QA_CHECKLIST.md` on `emdash-lab-150` and lab-all.
   - CF-2 to CF-13 on the testbed.
   - This branch's build, with the kit copied from the branch.
   - Every screenshot read section by section.
6. Owner decision on #83 before merge.
7. Fixes from the walk land with tests over their blast radius. Re-walk only the screens that changed.
8. Run the automatic security review on the final commit and fix what it finds.
9. Change the Cloudflare line in `docs/website/getting-started/install.md` and `docs/registry/installation.md` to "supported on EmDash 1.4 or later" once the walk passes. The version stays 0.7.0 in the tag, `package.json` and the registry.
10. Merge PR #86 and tag `v0.7.0`. Publish only when the owner says publish.
11. After publish:
    1. Registry install on both sites.
    2. A registry update from 0.6.3 to 0.7.0 (CF-1).
    3. Close milestone 0.7.0.

Under the skill's release rule (owner, 2026-10-20), a release round is one builder, one walk and the automatic security review. That replaces the separate diff review listed in the handoff.

## D. Step 3: 0.8.0 scope (draft; owner decisions, then a new `SCOPE.md` and an updated `PLAN.md`, both LOCKED)

WordPress Listora Free ships "custom listing types with a flexible custom-field system", so a type editor is Free scope. Every item is general for any directory owner.

| # | Feature | Notes |
| --- | --- | --- |
| 1 | Listing type editor (reopen #28) | An admin list of types plus a type form: name, schema type from a fixed list, colour, icon from a list, and whether it has a location. Then a field table and an add-field form: label, kind (text, number, select, link, date), options, required, shown on cards, and sort slot. Admin forms have no repeater (EMDASH-SUPPORT.md:22), so one field is added per submit. All types live in one stored record |
| 2 | Raw type slugs | The index hook stores the listing's own type slug, and names are looked up at read time. Today `listingTypeBySlug` (`src/lib/catalog.ts:61`) turns unknown types into "business". Every read of the types record is budgeted |
| 3 | All places that read the fixed types | `src/lib/types.ts`, `catalog.ts`, `page:metadata`, the kit copy `site-kit/lib/listora.ts:7`, `site-kit/blocks/plugin.ts:22`, the manifest's `default_listing_type` options, `sample-listings`, the submit form, CSV import, the admin queue labels and the `types` route. The 10 built-in types become the starting set |
| 4 | Sort by number fields | Three slots (`n1` to `n3`) per listing, with composite indexes such as `["vis","type","n1"]`. A number sort is offered only once a type is chosen, because `n1` means a different thing per type. The hook fills the slots from the type's field-to-slot map. An outside sync may write them directly |
| 5 | Types without a location | No map, city, location search, hours, directions, Open or Closed, and no address on the submit form |
| 6 | The kit directory reads the index | `site-kit/pages/listings/index.astro:29` reads the collection with a limit of 500. Move it onto the `listings` route (via the kit's route call) with paging, so sorts and every page work at 6,000+ listings |
| 7 | Keyword search through core | Use EmDash core search (`search()`, with collection search on) for keywords. The index handles type, category and sort. Drop the description from the stored `card` to keep rows small (50 ms CPU limit) |
| 8 | Outside-source sync | A developer guide: create, update and publish through the content API, throttle, retry REENTRANT and 409, check the index afterwards. Add a hook budget test and a 6,000-listing filter and sort test. The sweep gets a follow-on run ("sweep-more") so a full repair takes hours, not days |

Owner decisions (2026-11-13):

1. Built-in types: edit and hide, never delete. Custom types can be deleted only while no listing uses them.
2. Field kinds: six. Text, number, choice from a list, link, date, yes/no. No multi-choice (categories and tags cover it).
3. Sort slots: three number or date fields per type (`n1` to `n3`), offered once a type is picked.
4. #83 (0.7.0): a listing a member adds counts as theirs, fixed in code (`SUBMITTER_IS_OWNER`), no admin setting.

### Software type (owner, 2026-11-14)

An 11th built-in type, `software`, for open-source skills, agents, plugins and apps. One type, not one per kind.

- Location-less (item 5): no map, city, hours, directions, Open or Closed, address.
- Structured data: schema.org `SoftwareApplication` (applicationCategory from "What it is", operatingSystem from "Works with", offers from Price, softwareVersion, aggregateRating from reviews).
- Fields (the six kinds): What it is (choice: Plugin, Skill, Agent, MCP server, App, Library, Theme; shown as filter chips), Works with (choice: WordPress, EmDash, Claude Code, Cursor, VS Code, npm, Python, Any), Repository (link, main button), Homepage or docs (link), Install command (text, shown escaped in a code box with Copy, never run), Version (text), License (choice), Price (choice: Free, Freemium, Paid), Open source (yes/no), Stars or installs (number), Last release (date), Released (date).
- Sort slots: stars or installs, last release, released.
- Links from member-submitted listings carry `rel="nofollow ugc"`.
- No `network:request` capability (it would make every site re-approve Listora). Live GitHub stars and latest release come from the site kit in the visitor's browser (GitHub's public API), and wbcomplugins.com's nightly sync writes them into the fields.
- Sample directory gains two or three Software listings so the type shows on a fresh site.
- Kit: a Software card (logo, one line, kind and platform badges, rating, stars, version and last release, View on GitHub) and a listing page section (Install box, Details, screenshots from the photo feature, reviews, poll, Maintained by / Claim).

Not in 0.8.0: per-type moderation, maps for software, paid features, a native (trusted) block.

Upgrade note for 0.8.0: new indexes mean a short wait (503 `STORAGE_INDEXES_NOT_READY`) after updating, and the changelog says so.

## E. Step 4: wbcomplugins.com site

After 0.8.0 is published, build the site from the proposal: EmDash blog starter, Listora plus WB Polls, and the nightly wordpress.org sync. Its plan goes in the site repo's `ops/`.

## F. Order

B, then C. C needs the 1.5.0 sites, and its steps run in order. Writing the D scope can run beside C's walk, since they touch different files. The 0.8.0 build starts on branch `0.8.0` from `main` after 0.7.0 is merged.

## G. Risks

| Risk | Handling |
| --- | --- |
| The 1.5.0 update breaks another Wbcom plugin on lab-all | An issue on that repo. Listora's walk continues if Listora's own pages work |
| KV conflicts in the migration | B3.4: read the warnings and resolve them before starting. The backups come from B2 |
| Testbed deploy blocked by permissions | The owner runs it |
| The deferred-hook change breaks the index under load | Tests from A1 and A2 before the walk |
| Index changes on live sites | The kit shows a plain retry message, and the changelog explains the wait |
| The EmDash fleet sites also need the coordinated 1.5 upgrade (#4277, #4715) | Out of this plan. A separate fleet upgrade following `vapvarun-emdash` `references/updating.md` |

Owner approvals needed: publish 0.7.0, the #83 decision, lock the 0.8.0 scope, publish 0.8.0.
