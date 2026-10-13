# FAQ

**Included in Free**

## How do I set this up on a new laptop?

Clone this repo. Run `./scripts/setup-lab.sh`. That creates a sibling EmDash site if you do not have one, wires the plugin, and copies the kit. Then `./scripts/reset-lab.sh` and `./scripts/prove-lab.sh --all`. Full page: [Set up a new machine](../getting-started/new-machine.md).

## Can we install the WordPress plugin on EmDash?

No. EmDash does not load PHP. This TypeScript plugin is the port. WordPress Listora stays its own product.

## Does the plugin load sample listings on install?

No. Health does not create listings. Open Admin → Get started, create the `listings` collection if it is missing, then click **Load sample directory**. Copy the site kit so `/listings/` exists.

## Does a site get pages when they install from the registry?

No. They get routes, storage, and Block Kit admin. They still copy the site kit (CSS, seed, pages) into the Astro site.

## Why is the public collection page empty?

`0.1.0` is published to the publisher PDS. Testers install `0.2.1`. The public site hides a package until the labeler approves it. Watch with `emdash-plugin info vapvarun.bsky.social listora --version 0.2.1 --watch`.

## Why publish as vapvarun if the repo is wbcomdesigns?

The founder Atmosphere account is the publisher identity. GitHub is the company source. Those can differ. Do not change `publisher` unless the Atmosphere account really moves.

## Do we need GitHub Actions to ship?

No. `emdash-plugin publish` from a trusted machine is enough. Actions plus provenance are optional later.

## Is the lab UI the product?

No. It is a working prototype with real jobs and thin chrome. Next work starts from [Improve the screens](../how-to/improve-the-screens.md).

## Where do I read the long plans?

[`ops/`](https://github.com/wbcomdesigns/emdash-listora/tree/main/ops) on this repo. Start with `listora-as-built.md` and `ux-plan.md`.
