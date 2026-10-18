# Reword the directory

**Included in Free**

## Change the words visitors see

Every phrase a visitor sees lives in one file the setup command copies: `src/lib/listora-strings.ts`. Change a phrase there and rebuild the site. For example, to rename the directory heading from Listings to Find a partner, edit `heading` inside `directory`:

```ts
heading: "Find a partner",
```

Buttons, empty states, form labels, and the sentences the pages build in scripts all come from this file. This is also how you translate the directory into another language. The file holds one language.

Error messages are in the same file. When the directory engine sends a reason, the page shows that reason. When it sends only a code, the page uses the matching sentence from this file.

The admin screens (the queue, reviews, claims, and Settings) stay in English and are not in this file.

Running the setup command again replaces `src/lib/listora-strings.ts`. If you changed that file, the command first saves your copy next to it as `listora-strings.ts.bak-YYYYMMDD` and says so: copy your phrases back into the new file. A file you never changed is replaced without a backup. The same applies to the pages and styles the kit copies.

## Match your theme

Colours and fonts come from your site. The kit reads `--color-bg`, `--color-text`, `--color-surface`, `--color-border`, `--color-brand`, `--color-on-brand` and `--font-body` when they exist, and uses its own neutral set when they do not.

To change the look only, edit `src/styles/listora-ui.css`. Its rules start with the plugin's own markers, so they do not change other parts of your site.
