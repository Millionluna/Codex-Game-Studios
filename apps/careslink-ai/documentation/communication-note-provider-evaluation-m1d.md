# Communication Note provider-evaluation M1d

> Historical checkpoint: the past-tense M1d state below is not the current
> transport boundary. M1e superseded the test-only model injection and global
> endpoint with a source-frozen evaluation snapshot and AU-storage endpoint
> profile, removed the built-in real HTTPS execution path, and retained a
> non-HTTPS identifier plus arbitrary trusted test callback for contract tests.
> The callback is not a network or credential security boundary. See
> `communication-note-preview-evaluation-policy-m1e.md`. M1e still authorizes no
> provider call or runtime activation. M1f now adds the mock-only source runner;
> see `communication-note-preview-evaluation-runner-m1f.md`. M1g-a subsequently
> source-pins the exact `JSON.stringify` UTF-8 bodies used by that mock path,
> without adding external approval, execution authority or a dispatch receipt;
> see `communication-note-preview-request-body-pins-m1g-a.md`.

## Status

M1d introduced the first provider request/parser checkpoint for the approved V1
Note scope: Communication Note. At that historical checkpoint, it was
source-only and unreachable from every route, worker registry and deployment.

| Boundary | Historical M1d state |
|---|---|
| Provider transport | Then-present server-only HTTPS adapter for OpenAI Responses; removed as an executable path by M1e |
| Provider/model policy | Explicit evaluation candidate only; no current/default model |
| Evaluation | Mocked-fetch contract tests and synthetic offline golden/refusal fixtures |
| Real OpenAI calls | Zero in this batch |
| Runtime registration | Empty |
| Product route/UI | Absent |
| Database, payload vault and Points | Unchanged and unbound |
| Readiness | `CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY = false` |
| Production | No migration, environment change, deployment or activation |

The `gpt-5.4-mini` identifier in tests is a test-only injected value. It is not
a selected current model, a pricing assertion or an activation decision.

## Frozen source contract

`communication-note-provider-policy.ts` fixed the provider ID plus prompt,
golden-set and parser versions. At M1d, a caller had to inject an exact model ID,
revision posture and timeout before the generic policy digest was created. That
historical adapter accepted only `PROVIDER_NOT_EXPOSED` with a null separate
revision; `EXACT` could not enter evidence unless a later adapter could request
and verify it. M1e instead source-freezes the exact model snapshot and timeout.
There is no environment lookup, endpoint override, fallback model or automatic
retry.

At the M1d checkpoint, `openai-communication-note-provider.server.ts`:

- accepts only the explicit `DISPOSABLE_PREVIEW_EVALUATION_ONLY` capability;
- sends only the Note type, source locale and validated cleaned facts to the
  fixed Responses endpoint;
- fixes `store:false`, `background:false`, disabled truncation, no tools and a
  strict JSON schema with a bounded output-token budget;
- treats every cleaned-fact value as untrusted data rather than an instruction;
- accepts only the digest-bound response model, a completed response, exactly
  one completed assistant message and one `output_text` item; provider reasoning
  metadata may coexist but tool or mixed output is rejected;
- rejects refusals, incomplete output, model/object drift, extra candidate keys,
  obvious identifiers and Communication decision/consent inference language;
- requires every draft to contain a matching local event date and hour/minute,
  and an exact multiset of all Arabic-number quantities outside that event
  timestamp; additional source-backed dates/times therefore remain supported,
  while generated list fields may not introduce a new numeric token;
- bounds successful JSON response bodies to 512 KiB and requires JSON content;
  non-success response bodies are never read;
- returns content-free typed failures and content-free attempt evidence. The
  provider request ID is hashed; facts, output, credentials and worker-private
  correlation never enter the evidence object.

The registered-worker guard now settles `PROVIDER_TIMEOUT` or `LEASE_EXPIRED`
before aborting the adapter. This prevents a synchronous abort rejection from
overwriting the authoritative worker reason with `CANCELLED`.

## Golden and refusal evidence

`communication-note-golden.ts` contains three deeply frozen, synthetic fixtures
covering English, Simplified Chinese, Traditional Chinese and mixed-language
inputs. Passing candidates must preserve required role/channel markers and the
exact multiset and count of every Arabic-number token in all three outputs.
They also pass the shared privacy/output boundary and the Communication-specific
decision-language boundary. Evaluation results contain check names and fixture
IDs only; they contain no Note text.

The focused source gate covers strict request shape, prompt-injection-shaped
facts, model/policy binding, reasoning metadata, malformed or ambiguous output,
date/time/quantity mismatch, numeric additions in list fields, refusal/output
limit, unsafe decision language, obvious identifiers, HTTP and network
classification, bounded JSON, cancellation and the worker abort race.

This deterministic parity gate cannot prove the meaning of arbitrary facts that
contain no numbers. Full semantic groundedness remains an explicit activation
blocker and must be evaluated against reviewed model outputs before registration.

## Data-handling boundary

`store:false` disables provider-side storage of the Response object, but it is
not a contractual Zero Data Retention guarantee. OpenAI states that API data is
not used to train models by default, while abuse-monitoring logs may retain
customer content for up to 30 days unless the organisation has separately been
approved for Modified Abuse Monitoring or Zero Data Retention. See the official
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
and [API data controls](https://developers.openai.com/api/docs/guides/your-data).

No real care facts or personal information may be sent by this source slice.
Before even a disposable synthetic Preview evaluation, the owner/security gate
must approve provider and model, project/region, ZDR or MAM posture, payload and
log retention, incident handling, and a bounded cost budget.

## Activation blockers

All blockers are deliberate and compile-time visible:

1. `MODEL_POLICY_NOT_APPROVED`
2. `OPENAI_DATA_HANDLING_ZDR_REGION_NOT_APPROVED`
3. `SEMANTIC_GROUNDEDNESS_NOT_APPROVED`
4. `PAYLOAD_VAULT_NOT_CONFIGURED`
5. `WORKER_REGISTRATION_EMPTY`
6. `SERVED_ROUTE_DISABLED`
7. `POINTS_NOT_BOUND`
8. `PRODUCTION_ACTIVATION_NOT_AUTHORIZED`

M1e completed the following model/data-plan freeze, and M1f later implemented
the one-shot budget/fixture/report source contract. The paid Preview factory
still remains unavailable. Only after a durable single-use approval boundary,
provider-side spend/key controls, real reviewer attribution and every external
attestation exist may the owner separately authorize disposable synthetic
Preview calls. Payload-vault, registered-worker, served route, Points and UI
integration remain later decisions.
