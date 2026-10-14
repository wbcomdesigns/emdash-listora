# Posts and pages

**Included in Free**

Listora works next to your blog posts and pages. It adds its own pages and leaves your posts alone. This guide assumes the standard EmDash blog template (`npm create emdash@latest -- --template blog`).

## The directory pages

Once the site kit is on your site, these addresses exist:

| Address | What it is |
| --- | --- |
| `/listings/` | The directory: search, chips, cards |
| `/listings/your-listing/` | One page for each listing |
| `/listings/submit/` | The add-a-listing form |
| `/listings/calendar/` | Upcoming events |
| `/account/` | The member dashboard |

Do not give a page of your own the slug `listings` or `account`. The directory pages would hide it.

## Add the pages to your menu

1. Open the admin and go to **Menus**.
2. Add a custom link for each address you want: `/listings/`, `/listings/submit/`, `/listings/calendar/`, `/account/`.
3. Save the menu.

You can skip `/listings/import/`. Only site admins use it, and Settings links to it.

## Link to a listing from a post or page

Use a normal link. In the editor, select the text, add a link, and paste the listing address, for example `/listings/blue-door-cafe/`. Open the listing in your browser to copy its address.

Linking to `/listings/` sends readers to the whole directory.

## Show listings inside a post or page

The site kit has an optional **Listings** block. It shows a row of listing cards where you place it.

It needs a trusted install. The block is site code, not part of the sandboxed plugin, so you switch it on by hand in `astro.config.mjs`. The setup command already copied the files. The steps are in [Set up Listora on your site](install.md).

After that, type `/listings` in the text of a post or page and choose **Listings**. You can set:

- A heading.
- A listing type.
- A category name.
- A city.
- How many to show, from 1 to 12. The default is 3.

Every field is optional. If no listing matches, the block shows nothing. Expired listings never appear.

## Put the block in the post template

The block also works as a component in your own template. This needs no trusted install, because it is ordinary site code. Add it to `src/pages/posts/[slug].astro`:

```astro
---
import ListingsBlock from "../../listora-block/ListingsBlock.astro";
---

<ListingsBlock node={{ heading: "Places mentioned", listingType: "business", city: "Lisbon", count: 3 }} />
```

Put the tag where you want the cards, for example under the post body. The component reads only the `node` values above. It does not need the post.

On the blog template, `post.id` is the post's slug and `post.data.id` is its entry id. Use `post.data.id` for anything that asks for an entry id. Use `post.id` for links to the post.

## Related

- [Use cases](use-cases.md)
- [Set up Listora on your site](install.md)
