# Communication Note Preview-evaluation policy M1e

> Historical checkpoint: M1f now literal-pins the complete request template and
> ordered manifest and implements the source-only one-shot budget/report runner.
> The paid factory remains unavailable and no real provider call is authorized.
> See `communication-note-preview-evaluation-runner-m1f.md`.

## Status

M1e froze one source candidate for a later disposable OpenAI Preview
evaluation. It did **not** authorize that evaluation. The table below records
that historical checkpoint.

| Boundary | M1e state |
|---|---|
| Provider | OpenAI Responses API |
| Evaluation model | `gpt-5.4-mini-2026-03-17` |
| Reasoning | `none` |
| Endpoint profile | `OPENAI_AU_STORAGE_RESPONSES_V1` |
| Resolved endpoint | `https://au.api.openai.com/v1/responses` |
| Input class | existing synthetic, de-identified golden fixtures only |
| Requested retention control | Zero Data Retention |
| AU project-region/ZDR/amendment evidence | not attested |
| Approved runner and report binding | not implemented at M1e; source-only and unapproved at M1f |
| Evaluation readiness | `false` |
| Approved evaluation snapshot | `undefined` |
| Real provider calls | zero |
| Runtime, route, worker and Production | unchanged and disabled |

The golden fixture contents and the full canonical-JSON plan each have a
reviewed, literal-pinned SHA-256 digest. Source drift fails module validation
until the relevant version and digest pin are deliberately reviewed together.
The Responses request builder validates the exact M1e plan, requires its
provider-policy digest to match the job policy, maps a closed endpoint profile
instead of accepting a URL, and explicitly includes
`reasoning.effort: "none"`. Environment model lookup, model aliases, endpoint
overrides, fallback models and automatic retries cannot enter this candidate.

This is not an executable paid-call adapter. The paid Preview factory is
deliberately unavailable while readiness is `false` and the approved snapshot
is `undefined`; it accepts neither a key nor a network transport. Contract tests
exercise parsing and request formation through a non-HTTPS test identifier and
an arbitrary trusted callback. That callback is not a network or credential
security boundary.

At this checkpoint, the frozen plan bound prompt-template and parser version
labels but did not yet literal-hash the complete system prompt, Structured
Output schema and static request fields. M1f closes that reproducibility item
with a separately pinned request-template digest; it still creates no paid
network path.

## Model decision

The evaluation candidate is the immutable model ID
`gpt-5.4-mini-2026-03-17`, not the moving `gpt-5.4-mini` alias. The provider's
separate `modelRevision` remains `null` with
`PROVIDER_NOT_EXPOSED`: the snapshot is already part of `modelId`, while the
Responses result does not expose a second independently verifiable revision.

OpenAI's current model catalog recommends GPT-5.6 Luna for cost-sensitive,
high-volume workloads. Luna supports Responses and Structured Outputs and is
cheaper, but its current model page lists only the undated `gpt-5.6-luna`
identifier. M1e therefore prefers a reproducible dated snapshot for the first
safety evaluation. This is not a claim that GPT-5.4 Mini has passed CaresLink's
quality bar, and it is not a Production model approval. See the official
[model catalog](https://developers.openai.com/api/docs/models),
[GPT-5.4 Mini model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
and [model guidance](https://developers.openai.com/api/docs/guides/latest-model).

`reasoning.effort` is fixed to `none` for the first bounded factual-transformation
baseline. A later `low` comparison is a separate policy/version and expense
decision; it cannot silently enter this plan.

## Data-handling decision and limitation

OpenAI states that API data is not used to train models by default. It also
states that default abuse-monitoring logs may contain customer content for up
to 30 days, subject to the legal and service/third-party safety exceptions it
documents that may require longer retention. Modified Abuse Monitoring and Zero
Data Retention require prior OpenAI approval; ZDR causes Responses `store` to be
treated as `false`. The request's explicit `store:false` is therefore useful
behavior but is not evidence that ZDR is enabled. See the official
[API data controls](https://developers.openai.com/api/docs/guides/your-data).

The same official data-control table states that the Australia endpoint:

- supports regional storage for `/v1/responses`;
- does **not** support regional processing;
- may process and temporarily store customer content outside Australia to
  deliver the service;
- requires an approved abuse-monitoring control for non-US data residency and
  a Modified Retention amendment;
- excludes Structured Output schemas from regional-residency coverage because
  the schemas are classified as system data.

M1e records these facts directly as `regionalStorage: "SUPPORTED"` and
`regionalProcessing: "NOT_SUPPORTED"`, while marking schema residency as not
covered and prohibiting customer data in schema names, descriptions or examples.
It does not describe the AU endpoint as Australia-only inference, and use of
`au.api.openai.com` alone is not evidence that the API-key project was actually
created/configured for Australia. The next paid call remains blocked until the
owner acknowledges the processing limitation and the project region,
project-scoped ZDR and amendment are independently attested. Real care facts and
personal information remain prohibited regardless of endpoint.

## Candidate requirements inherited by M1f

The frozen candidate uses the three existing multilingual golden fixtures,
twice each:

- proposed maximum 6 provider calls;
- no automatic retry and no fallback model;
- maximum 2,400 output tokens per call;
- proposed maximum aggregate budget of 250,000 micro-USD (US$0.25);
- base pricing evidence dated 2026-08-27: US$0.75 input,
  US$0.075 cached input and US$4.50 output per million tokens;
- 1,000-basis-point (10%) data-residency uplift recorded in the budget;
- prices and eligibility must be reconfirmed immediately before any paid run.

At M1e these were frozen governance values rather than enforced counters. M1f
now implements them in a mock-only one-shot source runner, including complete
token preflight, serial call reservation, BigInt cost ceilings, exact fixture
and request-template bindings and a content-free report. That implementation is
not an approved paid runner and has no durable approval claim, key or HTTPS
transport.

M1e required any later runner to make every candidate pass every strict schema,
shared privacy, date/time, numeric, decision-language and refusal check. It also
required human semantic-groundedness review for all six candidates, comprising
18 English/Simplified-Chinese/Traditional-Chinese drafts, so a percentage
average could not hide one critical failure. M1f now enforces those source
contracts with injected test-only reviews and emits the specified content-free
report bindings. That self-digested mock report is explicitly unattested and
does not replace durable authenticated paid-run evidence.

## Approval boundary

The source plan lists eight unmet requirements:

1. explicit owner approval for the bounded paid Preview;
2. project-scoped ZDR attestation;
3. proof that the key's OpenAI project is configured for Australia data
   residency;
4. acknowledgement that AU storage does not mean AU processing;
5. Modified Retention amendment attestation;
6. a temporary-key and teardown plan;
7. immediate pricing reconfirmation;
8. an approved runner that enforces budget/fixture boundaries and emits the
   content-free bound report.

M1e created none of that execution evidence. M1f closes item 8 only at the
source-contract level; approval, durable single-use execution authority and the
external attestations remain absent. It also does not clear the existing
model, data handling, semantic groundedness, payload vault, worker registry,
served route, Points or Production blockers. No key, environment variable,
database row, migration, route, deployment or external provider state changes
in either source batch.
