# QA catalog (repo)

This folder is the Listora for EmDash QA source. It is Free only. There is no Pro plan in this pass.

Use these files before you call a screen done, a route complete, or the plugin ready for an EmDash site owner.

| File | Use |
| --- | --- |
| [qa-catalog.md](qa-catalog.md) | What gets checked, in what order, by whom |
| [owner-readiness.md](owner-readiness.md) | Site-owner install journey and current gaps |
| [code-completion.md](code-completion.md) | Engine, kit, and host: done / thin / missing |
| [screen-checklist.md](screen-checklist.md) | Browser ticks per Free screen |
| [qa-config.json](qa-config.json) | URLs, routes, personas, viewports |
| [cover-before-next-release.md](cover-before-next-release.md) | Half-cooked list to close before `0.2.1` |

Team handbook pointer: [docs/website/how-to/qa-catalog.md](../website/how-to/qa-catalog.md).

## Verdict words

| Word | Meaning |
| --- | --- |
| **Pass** | Code path and browser path both work on the lab |
| **Thin** | Job exists, chrome or wiring is not owner-ready |
| **Lab only** | Works on `emdash-local`. A second EmDash site cannot copy it yet |
| **Missing** | Free job not built |
| **Skip** | Pro. Do not test. Do not add |

A 200 from a route is not a pass. The site owner has to see the screen and finish the job.

## How to run

```bash
cd ~/code/emdash-listora
npm test
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

Then walk [screen-checklist.md](screen-checklist.md) at 1440 and 390 as visitor, owner, and admin.
