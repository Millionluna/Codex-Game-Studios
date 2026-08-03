# Public Companion SEO

## Indexable route

| Route | Public/indexable | Metadata source | Public-data rule |
| --- | --- | --- | --- |
| `/template-companion/ndis-case-note` | Yes, explicitly | Static Next.js metadata in the route page | Title and description contain product-level copy only |

The page uses static title/description metadata and `referrer: no-referrer`. UTM, locale, opaque claim, and save query parameters do not change metadata. Generated content and pasted text are client/session content and are never inserted into metadata or server-rendered public HTML for an unauthorised viewer.

## Bot and canonical behavior

- There is no bot-specific rendering path.
- The route is server-rendered with the same safe product shell for bots and humans.
- No dynamic participant/provider metadata exists.
- The page explicitly overrides the authenticated layout's `noindex` default with `index, follow` and uses `https://ai.careslink.com.au/template-companion/ndis-case-note` as its canonical URL.
- Authenticated AI Documents, saved drafts, and admin pages are outside this document's public SEO scope.
