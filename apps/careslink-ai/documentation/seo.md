# Companion SEO Boundary

## Route policy

| Route | Public/indexable | Metadata source | Public-data rule |
| --- | --- | --- | --- |
| `/template-companion/ndis-case-note` | No; authenticated provider route | Static Next.js metadata in the route page | Signed-out requests enter auth and never render the form |

The page uses static title/description metadata, `noindex, nofollow`, and `referrer: no-referrer`. UTM and locale parameters do not change metadata. Generated content and pasted text are authenticated client/session content and are never inserted into metadata or server-rendered HTML for an unauthorised viewer.

## Bot and canonical behavior

- There is no bot-specific rendering path.
- Bots and signed-out humans receive the same authentication boundary.
- No dynamic participant/provider metadata exists.
- The canonical remains `https://ai.careslink.com.au/template-companion/ndis-case-note`, but the route is not an acquisition landing page.
- Public acquisition/indexing belongs to the Core landing page, which is outside this AI-app document.
