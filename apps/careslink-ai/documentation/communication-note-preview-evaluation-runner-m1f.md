# Communication Note one-shot Preview-evaluation runner M1f

## Status

M1f implements and tests the complete source contract for one bounded,
synthetic Communication Note evaluation. It does **not** approve or perform a
paid OpenAI call.

| Boundary | M1f state |
|---|---|
| Request template | system prompt, Structured Output schema and static Responses semantics are literal-digest pinned; each rendered request is hashed in the report |
| Evaluation manifest | exactly three reviewed synthetic fixtures, twice each, in a fixed six-slot order |
| Evaluation plan | exact model, AU-storage endpoint profile, `service_tier: default`, `reasoning: none`, data posture and budget are digest-bound |
| Runner | source-only one-shot state machine with complete preflight, serial dispatch, no retry and terminal failure |
| Executable path | branded contract-test provider plus explicitly trusted test-only token, reviewer, clock and transport callbacks |
| Paid runner readiness | `false` |
| Approved paid runner policy | `undefined` |
| Real provider calls | zero |
| Key, environment, route, worker registry, Points and deployment | absent and unchanged |

The runner module is server-only and has no built-in environment lookup,
API-key input, global `fetch`, HTTPS URL or runtime importer. Its paid factory
always fails closed. The only executable factory accepts the provider adapter's
branded mock instance, whose supplied request target is a non-HTTPS
contract-test identifier.

Those injected functions are arbitrary, trusted test code. They can ignore
their arguments and therefore are **not** a network, credential or capability
security boundary. M1f's safety posture instead depends on runtime-import
isolation, the absence of a built-in paid transport and test discipline that
forbids network-capable callbacks. This runner must not be executed with real
credentials or a network transport.

## Literal bindings

Four independently reviewable canonical-JSON pins now guard the evaluation:

- the complete static Responses request template;
- the ordered six-slot evaluation manifest;
- the model, endpoint, data, acceptance and budget plan;
- the one-shot runner policy and its dedicated no-retry worker policy.

The request template owns `service_tier: "default"`, disabled truncation, no
tools, no parallel tool calls, the exact system instruction and the complete
strict JSON schema. The request builder consumes that object instead of keeping
a second prompt or schema copy. A change to the pinned template, manifest, plan
or runner objects without a deliberate version and digest review fails at
module load and in the focused tests.

The runner also hashes each fully rendered request and binds those hashes into
the report. That is current-run integrity evidence, not an independent
historical approval of the builder's snake-case wire mapping or JSON
serialization. Before any paid activation, the exact rendered wire requests
must receive their own externally reviewed literal pin or signed approval
record.

## One-shot execution contract

Before the first provider dispatch, the runner renders, deeply freezes and
hashes all six exact requests and obtains an injected token count for every
request. Any missing, zero, unsafe, non-integer or greater-than-10,000 count
terminates the run with zero provider calls. Each injected token or review
callback has a 5-second runner-side deadline and is raced against cancellation.
The runner also reserves the full uncached 2,400-output-token upper bound for
all six calls and verifies the aggregate projection before dispatch.

After preflight, calls run serially in manifest order. The call reservation and
dispatch count are recorded before awaiting the provider. The dedicated worker
policy permits one attempt, declares no retryable outcomes and has no backoff or
jitter. A provider, evidence, golden-check, usage, budget or reviewer failure is
terminal; no failed slot is retried and no later slot is dispatched. Each
provider call retains the fixed 30-second deadline. A candidate is deeply
frozen before golden checks and review, and its digest is rechecked after the
review callback.

One runner instance accepts one bounded run ID. Concurrent or later use of the
same ID returns the same terminal promise and creates no additional calls. A
different ID is rejected after the instance is claimed. This in-process rule is
testable replay protection only. A paid runner still requires an atomic,
durable, single-use approval claim that survives process restarts.

## Cost and usage accounting

The frozen pricing evidence dated 2026-08-27 uses GPT-5.4 Mini base rates of
US$0.75 per million uncached input tokens, US$0.075 per million cached input
tokens and US$4.50 per million output tokens, followed by the recorded 10%
Australia data-residency uplift. Integer arithmetic computes:

`ceil((((input - cached) × 750000) + (cached × 75000) + (output × 4500000)) × 11000 / (1000000 × 10000))`

The result is micro-USD. For 120 input tokens, including 20 cached tokens, and
80 output tokens, the upper-bound calculation is 481 micro-USD. Reasoning
tokens are a subset of output tokens and are not charged a second time. Missing
cached-token detail is reconciled as zero cached tokens, which is the more
conservative cost bound. Missing input or output usage fails the run.

The maximum reservation is 20,130 micro-USD per call and 120,780 micro-USD for
six calls, below the fixed 250,000 micro-USD (US$0.25) cap. Actual reported input
may not exceed the request's preflight count or 10,000; output may not exceed
2,400; cached input may not exceed input; reasoning may not exceed output; and a
reported total must equal input plus output. The calculated value is explicitly
labelled an upper bound, not a provider invoice or spend-settlement record.

See the official OpenAI [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create),
[prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching),
[GPT-5.4 Mini pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
and [input token counting reference](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens).

## Content-free report

A successful mock run emits a recursively frozen report containing only:

- plan, runner, worker, request-template, manifest and fixture digests;
- fixture IDs and run ordinals;
- hashes of rendered requests, candidates, provider request IDs and the run ID;
- token counts, reconciliation labels and calculated micro-USD bounds;
- seven all-pass critical-check flags and three ordered language-review results
  per candidate;
- aggregate counts, timestamps, cost posture and a report digest.

It contains no cleaned facts, generated draft, prompt, raw response, raw
provider request ID, raw run ID, error body, credential or key. Each of the six
slots must carry a non-null, unique hash of its provider request ID. The
validator requires exact fields, exact manifest order, exact static bindings,
internally consistent positive usage and cost, six candidates, 18 language
reviews and a matching canonical report digest.

The report explicitly declares
`authenticity: "UNATTESTED_TEST_CONTRACT_ONLY"`. Its canonical digest detects
accidental mutation when the digest is held separately, but a party able to
rewrite the report can also recompute that digest. Opaque run, candidate and
provider-ID hashes are not authenticated attestations. A paid runner therefore
still needs a durable, access-controlled or cryptographically signed execution
receipt bound to the external approval claim.

## Remaining paid-call blockers

M1f closes the source runner-contract gap only. A real disposable Preview run
still requires all of the following as fresh external evidence and a separate
explicit owner authorization:

1. an OpenAI project scoped to the approved temporary key and provider-side
   spend ceiling;
2. independently verified Australia project region, project-scoped Zero Data
   Retention and Modified Retention amendment;
3. owner acknowledgement that Australia regional storage does not provide
   Australia-only processing and that Structured Output schemas are system
   data outside regional-residency coverage;
4. immediate price and model-availability reconfirmation;
5. an atomic durable single-use approval claim, an independently pinned or
   signed exact wire request, and key teardown evidence;
6. a durable authenticated execution receipt and real, attributable human
   review rather than the injected contract-test reviewer.

Until those gates close, the paid factory, approved runner policy and readiness
latch remain unavailable. No real care data is permitted in this evaluation or
by any future authorization derived from it.
