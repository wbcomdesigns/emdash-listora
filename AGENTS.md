# Agent instructions

This product is Free only. No Pro plan in this pass. Check code completion and site-owner readiness with `docs/qa/`. Do not start, surface, or continue Pro work.

Do not add Google Maps, credits, plans, coupons, Needs, Compare, quick view, SEO landings, coming soon, BuddyPress, photo or multi-criteria reviews, verification badges, lead forms, saved searches, infinite scroll, or Places import. Do not add a Credits tab, a Compare button, or a Pro upsell on any form. The 10 listing types are WordPress Listora Free defaults. They are not Pro.

On a new machine, run `./scripts/setup-lab.sh` before the daily reset/prove loop. The lab host is a sibling EmDash site, not this repo. See `docs/website/getting-started/new-machine.md`.

Before editing this plugin, read `skills/creating-plugins/SKILL.md` completely. Codex discovers the same directory through `.agents/skills`; Claude discovers it through `.claude/skills` and reads these instructions through `.claude/CLAUDE.md`.
Keep `emdash-plugin.jsonc` aligned with the runtime implementation, declare every capability and host the plugin uses, and run the generated validation, typecheck, test, and build scripts after changes.
For branches, version bumps, and registry publish, follow `CONTRIBUTING.md`. Team handbook is `docs/website/`. Never add AI co-author trailers. Never use em-dashes.
