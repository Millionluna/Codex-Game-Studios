# Mobile M0 required App inputs

Status: bounded non-secret input handoff; Native Auth runtime remains disabled.

This document records the only App-owned values required before the Native Auth
Preview contract can freeze its redirect allowlist. Values must come from the
actual Preview build configuration. Portal developers must not infer, normalize
or invent them.

## Required from the App owner

| Platform | Required value | Acceptance rule |
|---|---|---|
| iOS | Preview build profile name | Must identify the exact build whose native configuration was inspected. |
| iOS | Bundle identifier | Must be copied exactly from that Preview build configuration. |
| iOS | Callback URI list | Every complete callback/deep-link URI accepted by that build, including the exact scheme, authority, path, case and trailing-slash behavior. |
| Android | Preview build profile name | Must identify the exact build whose native configuration was inspected. |
| Android | `applicationId` / package name | Must be copied exactly from that Preview build configuration. If tooling exposes both names, the owner must state whether they are identical and provide both when they differ. |
| Android | Callback URI list | Every complete callback/deep-link URI accepted by that build, including the exact scheme, authority, path, case and trailing-slash behavior. |

If a callback uses an iOS Universal Link or Android App Link, the App owner must
also provide non-secret evidence that the submitted URI is mapped to the same
Preview application identity:

- iOS: the submitted domain/path is present in the Preview build's associated
  domains configuration and maps to the submitted bundle identifier.
- Android: the submitted domain/path is present in the Preview build's intent
  filter/App Link configuration and maps to the submitted application ID.

The handoff must keep each callback URI attached to its platform, build profile
and application identifier. A URI from another environment or build profile is
not an acceptable substitute.

## Values the App must not provide

Do not put any of the following in this handoff, redirect URI, request body,
document, log or test evidence:

- access tokens, refresh tokens, authorization codes or PKCE verifiers;
- Supabase, OAuth provider or signing secrets;
- real or invented `userId`, `sessionId` or `ownerId` values;
- Production identifiers or callback URIs.

Runtime `userId` and `sessionId` are server-verified identity results, not App
configuration inputs. Ownership is derived from the authenticated server
session; the App must never select or submit `ownerId`.

## Fail-closed boundary

Providing the values above does not enable Native Auth. These five Product API
routes remain fixed structured `501 NOT_IMPLEMENTED` boundaries:

- `POST /v1/auth/native/callback`
- `GET /v1/auth/sessions`
- `GET /v1/auth/devices`
- `POST /v1/auth/sessions/{sessionId}/revoke`
- `POST /v1/auth/sessions/revoke-all`

M0 uses the Supabase native SDK for PKCE exchange; the App must not call the
reserved Product API callback route. No Native Auth flag may be enabled from
this handoff.

The current `/v1/me` response is not the complete Native identity proof. Adding
the remaining server-owned proof fields requires a reviewed Product contract
version bump and server implementation. The App must not guess those fields or
send them in a request body.

Receipt of this input list permits only a versioned contract/allowlist review.
It does not authorize Preview configuration, provider configuration, database
access, deployment or Production changes.
