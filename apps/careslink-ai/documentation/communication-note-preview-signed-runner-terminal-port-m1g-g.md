# Communication Note Preview signed runner terminal port M1g-g

## Status

M1g-g closes the trust-root gap left deliberately open by M1g-f. The durable
runner terminal now accepts only an independently signed Ed25519 envelope. A
fifth purpose-scoped database caller shell and a source-only persistence port
are present, while every live activation surface remains disabled.

| Boundary | M1g-g state |
|---|---|
| Terminal trust root | independent Ed25519 key, purpose `CARESLINK_RUNNER_TERMINAL` |
| Terminal domain | `CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL` |
| Terminal policy | `policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2` |
| Terminal statement | `runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2` |
| Database caller shell | `careslink_v1_preview_runner_terminal_caller`; `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` |
| Exact database entry | `persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)` |
| Old unsigned entry | removed |
| Runtime port | explicit dependency injection only; no environment, network, pool or credential resolution |
| Live login, caller membership or key resolver | absent |
| Hosted migration, deployment or provider call | none |

The caller identity HMAC is not a signature and is not a trust root. It remains
a purpose-scoped identity binding alongside the independently verified terminal
signature.

## Signed terminal envelope

The strict envelope is `{statement, signature}`. The statement adds the
terminal signer's key-id hash, public-key fingerprint and exact signing purpose
to the existing receipt-bound acceptance/failure evidence. The verifier:

- accepts only a canonical 64-byte Ed25519 signature encoded as 86-character
  unpadded Base64URL;
- verifies the canonical CaresLink signing message against a purpose- and
  domain-scoped SPKI public key snapshot;
- checks the key validity window and the statement observation time;
- binds the key-id hash and public-key fingerprint into the signed statement;
- returns only immutable, content-free verified evidence.

The owner authorization, dispatch receipt and terminal signer key identifiers,
public-key fingerprints and custody references must be pairwise distinct.
Receipt or owner keys cannot be reused for terminal acceptance.

## Database boundary

The CLI-generated migration requires all six Preview execution ledgers to be
empty before changing the terminal contract. It adds the original signature,
its SHA-256, signer fingerprints, authenticity and verifier method to the
forced-RLS append-only terminal ledger. The database recomputes the signature
hash and cross-binds all signer fields, but does not claim to perform Ed25519
verification; that verification belongs to the source port before the RPC is
called.

The old two-argument function is dropped. The three-argument replacement keeps
`SECURITY DEFINER` with an empty `search_path`, the existing parent lock order,
strict statement shape, exact replay semantics and permanent no-retry failure.
An exact replay must match the statement, terminal digest, original signature,
signature hash, signer fingerprints and verifier identity HMAC.

The fifth caller receives only private-schema `USAGE` and `EXECUTE` on this one
RPC. It receives no table, sequence, type, helper, receipt RPC, executor-role,
API-role or object-ownership capability. The executor remains the function
owner and uses the existing forced-RLS policies.

## Source-only ports

The signed-terminal port first verifies the independent envelope, then supplies
the exact three persistence arguments through one purpose-scoped method. The
PostgreSQL adapter accepts only an explicitly injected parameterized query
port; it cannot construct a connection, read environment variables, resolve a
credential or choose an arbitrary RPC.

Both factories remain test-only. Readiness is `false`, approved signer/custody
configuration is `undefined`, and product routes, components, workers, cron,
queues and Supabase Functions do not import these modules.

## Activation boundary and next work

M1g-g proves a source contract and database ACL shell, not an activated
identity. Activation remains blocked on authenticated external provenance,
real key/credential resolvers, an isolated disposable no-data Preview database,
runtime login and membership provisioning, provider controls, attributable
human review, explicit final run approval and verified teardown. Production,
real care data and real provider/model calls remain excluded.

The next atomic batch should compose the signed-terminal port with the existing
reserve/receipt flow behind an authenticated disposable-Preview runtime
identity and prove it end to end without widening any API or Production
surface. That step requires a new explicit authorization before any Hosted or
paid action.
