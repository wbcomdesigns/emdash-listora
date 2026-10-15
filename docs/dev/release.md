# Version and publish

**Included in Free**

GitHub is the review home. The collection is the install channel. Full checklist: [CONTRIBUTING.md](https://github.com/wbcomdesigns/emdash-listora/blob/main/CONTRIBUTING.md).

## Versions

`package.json` `version` is the registry version. Releases are immutable. Never reuse a version. Never `--allow-overwrite`.

| Bump | When |
| --- | --- |
| patch | Fix or copy. Same routes and capabilities |
| minor | New hook, route, setting, or admin page |
| major | New capability, host, or public mutation |

A UX-only kit change that sites must copy can stay a patch if the plugin bytes do not change. Say that in `CHANGELOG.md` so site owners know to copy `site-kit/`.

## Publish

```bash
npx emdash-plugin whoami
npx emdash-plugin login vapvarun.bsky.social   # if needed
npx emdash-plugin publish
npx emdash-plugin info vapvarun.bsky.social listora --version x.y.z --watch
```

Publisher in `emdash-plugin.jsonc` must stay `did:plc:2o6axbe264shvyedyhycyhya`. Source URL: `https://github.com/wbcomdesigns/emdash-listora`.

Update `docs/website/` in the same PR when routes, screens, or the install story change. The commit is the publish for docs. There is no docs site sync yet.
