# QA catalog

**Included in Free**

QA for Listora for EmDash lives at repo level in [`docs/qa/`](https://github.com/wbcomdesigns/emdash-listora/tree/main/docs/qa). This page is the handbook pointer. Do not start a Pro plan from here.

## Open these

| File | Use |
| --- | --- |
| [README](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/README.md) | Front door |
| [qa-catalog.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/qa-catalog.md) | What gets checked, in order |
| [owner-readiness.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/owner-readiness.md) | EmDash site-owner install journey |
| [code-completion.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/code-completion.md) | Engine, kit, host: done / thin / missing |
| [screen-checklist.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/screen-checklist.md) | Browser ticks at 1440 and 390 |
| [cover-before-next-release.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/docs/qa/cover-before-next-release.md) | Close these before testers use `0.2.1` |

## Current readiness (2026-10-13)

The plugin engine runs in the lab. A second EmDash site owner cannot get a public directory from Registry install alone.

- Registry `0.1.0` is published. The public listing still waits on approval.
- Admin queues and routes exist.
- `/listings/` pages and the `listings` collection live on the lab, not in a drop-in kit.

Treat owner-ready as: clean site → install → copy kit → collection → `/listings/` works → submit → approve → card on the archive.

## Run

```bash
npm test
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Then walk the screen checklist as visitor, owner, and admin.
