# Set up a new machine

**Included in Free**

This repo is the plugin. The lab host is a normal EmDash site next to it. You do not need a copy of anyone else's `emdash-local` folder.

Need Node.js 22.16 or later. Official site create: [Create your first EmDash site](https://docs.emdashcms.com/getting-started/).

## One-time setup

Put the plugin anywhere. The default lab path is a sibling folder named `emdash-local`.

```bash
# example: ~/code/emdash-listora and ~/code/emdash-local
git clone https://github.com/wbcomdesigns/emdash-listora.git
cd emdash-listora
npm install --legacy-peer-deps
./scripts/setup-lab.sh
./scripts/reset-lab.sh
./scripts/prove-lab.sh --all
```

`setup-lab.sh` will:

1. Create the sibling EmDash Node starter if that folder is missing (`npm create emdash@latest` with `--template starter --platform node`).
2. Add `@wbcomdesigns/listora` as a `file:` package and the workerd sandbox runner.
3. Copy `site-kit/` pages, CSS, and helpers onto the site.
4. Merge the listings collection, taxonomies, menu links, and 33 NYC listings into the site seed.

`reset-lab.sh` wipes the site SQLite file, starts http://localhost:4321, and hits the dev-bypass so those seed listings insert.

## Other folder names

```bash
export LISTORA_PLUGIN="$PWD"
export LISTORA_LAB="$HOME/sites/my-emdash"
./scripts/setup-lab.sh
./scripts/reset-lab.sh
```

If `LISTORA_LAB` already exists, it must be an EmDash Astro site (`astro.config` plus `src/`). The script will not overwrite a random folder.

## After setup

| Job | Command or URL |
| --- | --- |
| Directory | http://localhost:4321/listings/ |
| Admin | http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin |
| Recopy kit after a chrome change | `./scripts/apply-kit.sh` |
| Daily prove | `./scripts/reset-lab.sh` then `./scripts/prove-lab.sh --all` |

Forms and directory chrome follow [Form presentation](../how-to/form-presentation.md) in this repo. You do not need `~/.claude/skills` on the new machine for those rules.

## What you cannot do from a new machine

`emdash-plugin publish` needs the founder Atmosphere login (`vapvarun.bsky.social`). Open a PR. The publisher ships the registry version from a trusted machine after merge.

## Already have a site?

Skip create. Point `LISTORA_LAB` at it and run `setup-lab.sh`. Same wire, kit copy, and seed merge.
