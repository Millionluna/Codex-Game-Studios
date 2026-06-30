# CaresLink AI Local Draft Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public CaresLink provider profile generator and CaresLink AI workspace share one provider draft through `draftId`, browser localStorage, and Supabase-backed persistence.

**Architecture:** Public CaresLink keeps full provider data out of URLs and stores a sanitized draft in localStorage under `careslink-ai-provider-draft:<draftId>`. CaresLink AI reads that browser-local handoff on the client, persists the canonical public draft to `provider_drafts` through a server route, then refreshes the workspace so server-rendered profile, health, materials, and access pages all resolve the same Supabase draft by `draftId`. Existing `draftPayload` URL handoff remains supported for compatibility.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Vitest, Supabase JS with server-only service role key, existing `ProviderDraftStore` abstraction.

---

## Scope

Implement only inside:

`C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai`

Do not modify:

`C:\Users\ASUS\Documents\Aged Care`

Do not rebuild public CaresLink generator UI. This plan assumes the public site can provide localStorage records shaped like:

```json
{
  "version": 1,
  "source": "provider-profile-generator",
  "draftId": "test-provider-1",
  "payload": {
    "version": 1,
    "id": "test-provider-1",
    "businessName": "Bright Path Community Support",
    "serviceCategories": ["Personal care"],
    "referralServices": ["SERV-0002"],
    "serviceAreas": ["Sydney"],
    "languages": ["English"],
    "supportsNdis": true,
    "supportsAgedCare": false,
    "acceptingNewClients": true,
    "urgentReferralAvailable": false,
    "shortDescription": "Provider-submitted public profile draft.",
    "targetClients": "Older people and families",
    "publicContactMethods": ["Phone"],
    "sourceChannel": "website",
    "createdAt": "2026-06-25T00:00:00.000Z",
    "updatedAt": "2026-06-25T00:00:00.000Z"
  },
  "savedAt": "2026-06-25T00:00:00.000Z"
}
```

Important origin constraint: localStorage works only when the public generator and AI workspace run on the same browser origin. If they are deployed on different domains, the public site must either send a one-time `draftPayload` URL handoff or call a server-to-server draft creation endpoint instead. Do not assume cross-domain localStorage.

## Files

- Modify: `src/lib/public-provider-profile-generator.ts`
  - Add a canonical payload builder that strips unknown/private fields before persistence.
- Modify: `src/lib/public-provider-profile-generator.test.ts`
  - Cover canonicalization and private-field stripping.
- Modify: `src/lib/provider-draft-store.ts`
  - Export a reusable `saveProviderDraftPayload()` helper used by both `resolveProviderDraft()` and the API route.
- Modify: `src/lib/provider-draft-store.test.ts`
  - Cover helper behavior, freshness, and draftId keying.
- Create: `src/lib/provider-draft-local-handoff.ts`
  - Parse and validate the localStorage handoff record.
- Create: `src/lib/provider-draft-local-handoff.test.ts`
  - Cover valid/invalid localStorage values.
- Create: `src/app/api/provider-drafts/route.ts`
  - Server route to persist localStorage handoff drafts through `getProviderDraftStore()`.
- Create: `src/app/api/provider-drafts/route.test.ts`
  - Route-level tests for valid save, invalid payload, and oversized body.
- Create: `src/components/provider-draft-handoff-persister.tsx`
  - Client component that reads localStorage, calls the API route, then refreshes the current workspace page.
- Create: `src/components/provider-draft-handoff-persister.test.tsx`
  - Component tests with mocked fetch/localStorage/router.
- Modify: `src/app/referral-workspace/profile/page.tsx`
- Modify: `src/app/referral-workspace/health/page.tsx`
- Modify: `src/app/referral-workspace/materials/page.tsx`
- Modify: `src/app/referral-workspace/access/page.tsx`
  - Mount the persister near the top of the signed-in and signed-out workspace render paths when `source=provider-profile-generator&draftId=...` is present.
- Modify: `src/app/referral-workspace/referral-workspace-pages.test.tsx`
  - Cover draftId-only workspace entry and absence of leaked `draftPayload` in generated links.
- Modify: `README.md`
  - Add handoff flow and env notes.

---

## Task 1: Canonical Public Provider Draft Payload

**Files:**

- Modify: `src/lib/public-provider-profile-generator.ts`
- Modify: `src/lib/public-provider-profile-generator.test.ts`

- [ ] **Step 1: Write failing canonical payload test**

Add this test to `src/lib/public-provider-profile-generator.test.ts`:

```ts
import { getCanonicalPublicProviderDraftPayload } from "./public-provider-profile-generator";

it("canonicalizes public draft payloads before persistence", () => {
  const unsafePayload = JSON.stringify({
    version: 1,
    id: "bright-path",
    businessName: "Bright Path Community Support",
    contactPerson: "Private Person",
    email: "private@example.com",
    phone: "0400 000 000",
    serviceCategories: ["Personal care"],
    referralServices: ["SERV-0002"],
    serviceAreas: ["Sydney"],
    languages: ["English"],
    supportsNdis: true,
    supportsAgedCare: false,
    acceptingNewClients: true,
    urgentReferralAvailable: false,
    shortDescription: "Provider-submitted public profile draft.",
    targetClients: "Older people and families",
    publicContactMethods: ["Phone"],
    sourceChannel: "website",
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  });

  const canonical = JSON.parse(
    getCanonicalPublicProviderDraftPayload("url-draft-id", unsafePayload),
  );

  expect(canonical.id).toBe("url-draft-id");
  expect(canonical.businessName).toBe("Bright Path Community Support");
  expect(canonical.shortDescription).toBe(
    "Provider-submitted public profile draft.",
  );
  expect(canonical.publicContactMethods).toEqual(["Phone"]);
  expect(canonical.email).toBeUndefined();
  expect(canonical.contactPerson).toBeUndefined();
  expect(canonical.phone).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
$env:PATH='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm.cmd exec vitest run src/lib/public-provider-profile-generator.test.ts
```

Expected: FAIL because `getCanonicalPublicProviderDraftPayload` is not exported.

- [ ] **Step 3: Implement canonical payload export**

In `src/lib/public-provider-profile-generator.ts`, export a canonical payload function near `getPublicProviderDraftPayload()`:

```ts
export function getCanonicalPublicProviderDraftPayload(
  draftId: string,
  draftPayload?: string,
): string {
  const draft = getPublicProviderDraft(draftId, draftPayload);

  return buildPublicProviderDraftPayload({
    ...draft,
    id: draftId,
  });
}
```

If `buildPublicProviderDraftPayload()` currently accepts only `PublicProviderProfileDraft`, keep it private and call it from this exported function. Do not export private lead-capture fields. Do not include `email`, `contactPerson`, `phone`, `approved`, `verified`, `compliant`, `certified`, or `guaranteed`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm.cmd exec vitest run src/lib/public-provider-profile-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/public-provider-profile-generator.ts src/lib/public-provider-profile-generator.test.ts
git commit -m "feat: canonicalize public provider draft payloads"
```

---

## Task 2: Shared Provider Draft Save Helper

**Files:**

- Modify: `src/lib/provider-draft-store.ts`
- Modify: `src/lib/provider-draft-store.test.ts`

- [ ] **Step 1: Write failing helper test**

Add this test to `src/lib/provider-draft-store.test.ts`:

```ts
import { saveProviderDraftPayload } from "./provider-draft-store";

it("saveProviderDraftPayload canonicalizes and stores a draft under the handoff draft id", async () => {
  const store = createMemoryProviderDraftStore();
  const rawPayload = JSON.stringify({
    version: 1,
    id: "payload-id",
    businessName: "Bright Path Community Support",
    email: "private@example.com",
    contactPerson: "Private Person",
    serviceCategories: ["Personal care"],
    referralServices: ["SERV-0002"],
    serviceAreas: ["Sydney"],
    languages: ["English"],
    supportsNdis: true,
    supportsAgedCare: false,
    acceptingNewClients: true,
    urgentReferralAvailable: false,
    shortDescription: "Provider-submitted public profile draft.",
    targetClients: "Older people and families",
    publicContactMethods: ["Phone"],
    sourceChannel: "website",
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  });

  const saved = await saveProviderDraftPayload({
    draftId: "url-draft-id",
    draftPayload: rawPayload,
    store,
    now: "2026-06-25T10:00:00.000Z",
  });
  const savedPayload = JSON.parse(saved.draftPayload);

  expect(saved.id).toBe("url-draft-id");
  expect(saved.source).toBe("provider-profile-generator");
  expect(saved.status).toBe("draft");
  expect(savedPayload.id).toBe("url-draft-id");
  expect(savedPayload.email).toBeUndefined();
  expect(savedPayload.contactPerson).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm.cmd exec vitest run src/lib/provider-draft-store.test.ts
```

Expected: FAIL because `saveProviderDraftPayload` is not exported.

- [ ] **Step 3: Implement helper and reuse it**

In `src/lib/provider-draft-store.ts`, import canonicalization:

```ts
import {
  getCanonicalPublicProviderDraftPayload,
  getPublicProviderDraft,
  type PublicProviderProfileDraft,
} from "./public-provider-profile-generator";
```

Add this exported helper above `resolveProviderDraft()`:

```ts
export async function saveProviderDraftPayload({
  draftId,
  draftPayload,
  store,
  now = new Date().toISOString(),
}: {
  draftId: string;
  draftPayload: string;
  store: ProviderDraftStore;
  now?: string;
}): Promise<ProviderDraftRecord> {
  const canonicalPayload = getCanonicalPublicProviderDraftPayload(
    draftId,
    draftPayload,
  );

  return store.saveDraft({
    id: draftId,
    source: PROVIDER_GENERATOR_SOURCE,
    draftPayload: canonicalPayload,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
}
```

Then update the `isStorableDraftPayload(draftPayload)` branch inside `resolveProviderDraft()`:

```ts
if (isStorableDraftPayload(draftPayload)) {
  const record = store
    ? await saveProviderDraftPayload({
        draftId,
        draftPayload,
        store,
        now,
      })
    : undefined;

  return {
    draft: getPublicProviderDraft(draftId, record?.draftPayload ?? draftPayload),
    source: "payload",
    record,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm.cmd exec vitest run src/lib/provider-draft-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/provider-draft-store.ts src/lib/provider-draft-store.test.ts
git commit -m "feat: share provider draft payload persistence"
```

---

## Task 3: LocalStorage Handoff Parser

**Files:**

- Create: `src/lib/provider-draft-local-handoff.ts`
- Create: `src/lib/provider-draft-local-handoff.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/lib/provider-draft-local-handoff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getProviderDraftLocalStorageKey,
  parseProviderDraftLocalHandoff,
} from "./provider-draft-local-handoff";

describe("provider draft local handoff", () => {
  it("builds the shared public site localStorage key", () => {
    expect(getProviderDraftLocalStorageKey("test-provider-1")).toBe(
      "careslink-ai-provider-draft:test-provider-1",
    );
  });

  it("extracts a JSON draft payload from a public CaresLink localStorage record", () => {
    const parsed = parseProviderDraftLocalHandoff(
      "test-provider-1",
      JSON.stringify({
        version: 1,
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        payload: {
          version: 1,
          id: "test-provider-1",
          businessName: "Bright Path Community Support",
          shortDescription: "Provider-submitted public profile draft.",
        },
        savedAt: "2026-06-25T00:00:00.000Z",
      }),
    );

    expect(parsed).toEqual({
      draftId: "test-provider-1",
      draftPayload: JSON.stringify({
        version: 1,
        id: "test-provider-1",
        businessName: "Bright Path Community Support",
        shortDescription: "Provider-submitted public profile draft.",
      }),
    });
  });

  it("rejects records for a different draft id", () => {
    expect(
      parseProviderDraftLocalHandoff(
        "expected-id",
        JSON.stringify({
          version: 1,
          source: "provider-profile-generator",
          draftId: "other-id",
          payload: { businessName: "Wrong" },
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects malformed or oversized localStorage records", () => {
    expect(parseProviderDraftLocalHandoff("test-provider-1", "not-json")).toBeUndefined();
    expect(
      parseProviderDraftLocalHandoff(
        "test-provider-1",
        JSON.stringify({
          version: 1,
          source: "provider-profile-generator",
          draftId: "test-provider-1",
          payload: "x".repeat(9000),
        }),
      ),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm.cmd exec vitest run src/lib/provider-draft-local-handoff.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement parser**

Create `src/lib/provider-draft-local-handoff.ts`:

```ts
const LOCAL_DRAFT_STORAGE_PREFIX = "careslink-ai-provider-draft:";
const PROVIDER_GENERATOR_SOURCE = "provider-profile-generator";
const MAX_DRAFT_PAYLOAD_LENGTH = 8000;

type LocalDraftRecord = {
  version?: unknown;
  source?: unknown;
  draftId?: unknown;
  payload?: unknown;
};

export type ProviderDraftLocalHandoff = {
  draftId: string;
  draftPayload: string;
};

export function getProviderDraftLocalStorageKey(draftId: string) {
  return `${LOCAL_DRAFT_STORAGE_PREFIX}${draftId}`;
}

export function parseProviderDraftLocalHandoff(
  expectedDraftId: string,
  rawValue: string | null | undefined,
): ProviderDraftLocalHandoff | undefined {
  if (!rawValue || rawValue.length > MAX_DRAFT_PAYLOAD_LENGTH * 2) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue) as LocalDraftRecord;

    if (
      parsed.version !== 1 ||
      parsed.source !== PROVIDER_GENERATOR_SOURCE ||
      parsed.draftId !== expectedDraftId ||
      !parsed.payload
    ) {
      return undefined;
    }

    const draftPayload =
      typeof parsed.payload === "string"
        ? parsed.payload
        : JSON.stringify(parsed.payload);

    if (
      draftPayload.length > MAX_DRAFT_PAYLOAD_LENGTH ||
      !draftPayload.trim().startsWith("{")
    ) {
      return undefined;
    }

    return {
      draftId: expectedDraftId,
      draftPayload,
    };
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm.cmd exec vitest run src/lib/provider-draft-local-handoff.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/provider-draft-local-handoff.ts src/lib/provider-draft-local-handoff.test.ts
git commit -m "feat: parse public provider draft local handoff"
```

---

## Task 4: Provider Draft Persistence API Route

**Files:**

- Create: `src/app/api/provider-drafts/route.ts`
- Create: `src/app/api/provider-drafts/route.test.ts`

- [ ] **Step 1: Write route tests**

Create `src/app/api/provider-drafts/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/provider-draft-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/provider-draft-store")>(
    "@/lib/provider-draft-store",
  );
  const store = actual.createMemoryProviderDraftStore();

  return {
    ...actual,
    getProviderDraftStore: () => store,
  };
});

describe("provider drafts API route", () => {
  it("persists a local handoff provider draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/provider-drafts", {
        method: "POST",
        body: JSON.stringify({
          source: "provider-profile-generator",
          draftId: "test-provider-1",
          draftPayload: JSON.stringify({
            version: 1,
            id: "test-provider-1",
            businessName: "Bright Path Community Support",
            shortDescription: "Provider-submitted public profile draft.",
          }),
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      draftId: "test-provider-1",
      source: "provider-profile-generator",
    });
  });

  it("rejects non-generator sources", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/provider-drafts", {
        method: "POST",
        body: JSON.stringify({
          source: "unknown-source",
          draftId: "test-provider-1",
          draftPayload: "{}",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects oversized draft payloads", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/provider-drafts", {
        method: "POST",
        body: JSON.stringify({
          source: "provider-profile-generator",
          draftId: "test-provider-1",
          draftPayload: `{${'"x":'.repeat(9000)}"y"}`,
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm.cmd exec vitest run src/app/api/provider-drafts/route.test.ts
```

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement route**

Create `src/app/api/provider-drafts/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  getProviderDraftStore,
  saveProviderDraftPayload,
} from "@/lib/provider-draft-store";
import { PROVIDER_GENERATOR_SOURCE } from "@/lib/referral-workspace-handoff";

const MAX_DRAFT_PAYLOAD_LENGTH = 8000;

type ProviderDraftPostBody = {
  source?: unknown;
  draftId?: unknown;
  draftPayload?: unknown;
};

export async function POST(request: Request) {
  let body: ProviderDraftPostBody;

  try {
    body = (await request.json()) as ProviderDraftPostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.source !== PROVIDER_GENERATOR_SOURCE) {
    return NextResponse.json({ ok: false, error: "Unsupported source" }, { status: 400 });
  }

  if (typeof body.draftId !== "string" || !body.draftId.trim()) {
    return NextResponse.json({ ok: false, error: "Missing draftId" }, { status: 400 });
  }

  if (
    typeof body.draftPayload !== "string" ||
    body.draftPayload.length > MAX_DRAFT_PAYLOAD_LENGTH ||
    !body.draftPayload.trim().startsWith("{")
  ) {
    return NextResponse.json({ ok: false, error: "Invalid draftPayload" }, { status: 400 });
  }

  try {
    const record = await saveProviderDraftPayload({
      draftId: body.draftId,
      draftPayload: body.draftPayload,
      store: getProviderDraftStore(),
    });

    return NextResponse.json({
      ok: true,
      draftId: record.id,
      source: record.source,
      status: record.status,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to save provider draft" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run route test**

Run:

```powershell
pnpm.cmd exec vitest run src/app/api/provider-drafts/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/provider-drafts/route.ts src/app/api/provider-drafts/route.test.ts
git commit -m "feat: add provider draft persistence endpoint"
```

---

## Task 5: Workspace Client Persister

**Files:**

- Create: `src/components/provider-draft-handoff-persister.tsx`
- Create: `src/components/provider-draft-handoff-persister.test.tsx`

- [ ] **Step 1: Write component tests**

Create `src/components/provider-draft-handoff-persister.test.tsx`:

```tsx
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("ProviderDraftHandoffPersister", () => {
  beforeEach(() => {
    localStorage.clear();
    refresh.mockClear();
    vi.restoreAllMocks();
  });

  it("posts a localStorage draft and refreshes the workspace", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    localStorage.setItem(
      "careslink-ai-provider-draft:test-provider-1",
      JSON.stringify({
        version: 1,
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        payload: {
          version: 1,
          id: "test-provider-1",
          businessName: "Bright Path Community Support",
          shortDescription: "Provider-submitted public profile draft.",
        },
      }),
    );
    const { ProviderDraftHandoffPersister } = await import(
      "./provider-draft-handoff-persister"
    );
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProviderDraftHandoffPersister
          source="provider-profile-generator"
          draftId="test-provider-1"
        />,
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider-drafts",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("careslink-ai-provider-draft:test-provider-1")).toBeNull();
  });

  it("does nothing when draftPayload is already present in the URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { ProviderDraftHandoffPersister } = await import(
      "./provider-draft-handoff-persister"
    );
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProviderDraftHandoffPersister
          source="provider-profile-generator"
          draftId="test-provider-1"
          draftPayload="{}"
        />,
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

If this test errors because the project test environment is Node-only, add `// @vitest-environment jsdom` to the first line of this test file and install `jsdom` as a pinned dev dependency. Prefer not adding jsdom unless the test requires it.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm.cmd exec vitest run src/components/provider-draft-handoff-persister.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement component**

Create `src/components/provider-draft-handoff-persister.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getProviderDraftLocalStorageKey,
  parseProviderDraftLocalHandoff,
} from "@/lib/provider-draft-local-handoff";
import { PROVIDER_GENERATOR_SOURCE } from "@/lib/referral-workspace-handoff";

export function ProviderDraftHandoffPersister({
  source,
  draftId,
  draftPayload,
}: {
  source?: string;
  draftId?: string;
  draftPayload?: string;
}) {
  const router = useRouter();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (
      didRunRef.current ||
      source !== PROVIDER_GENERATOR_SOURCE ||
      !draftId ||
      draftPayload
    ) {
      return;
    }

    didRunRef.current = true;
    const storageKey = getProviderDraftLocalStorageKey(draftId);
    const localDraft = parseProviderDraftLocalHandoff(
      draftId,
      window.localStorage.getItem(storageKey),
    );

    if (!localDraft) {
      return;
    }

    void fetch("/api/provider-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source,
        draftId: localDraft.draftId,
        draftPayload: localDraft.draftPayload,
      }),
    }).then((response) => {
      if (response.ok) {
        window.localStorage.removeItem(storageKey);
        router.refresh();
      }
    });
  }, [draftId, draftPayload, router, source]);

  return null;
}
```

- [ ] **Step 4: Run component test**

Run:

```powershell
pnpm.cmd exec vitest run src/components/provider-draft-handoff-persister.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/provider-draft-handoff-persister.tsx src/components/provider-draft-handoff-persister.test.tsx
git commit -m "feat: persist local provider draft handoffs"
```

---

## Task 6: Mount Persister In Workspace Pages

**Files:**

- Modify: `src/app/referral-workspace/profile/page.tsx`
- Modify: `src/app/referral-workspace/health/page.tsx`
- Modify: `src/app/referral-workspace/materials/page.tsx`
- Modify: `src/app/referral-workspace/access/page.tsx`
- Modify: `src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Write page test**

Add to `src/app/referral-workspace/referral-workspace-pages.test.tsx`:

```tsx
it("mounts local draft persister for draftId-only provider generator handoff", async () => {
  const { default: ReferralProfilePage } = await import("./profile/page");
  const markup = renderToStaticMarkup(
    await ReferralProfilePage({
      searchParams: Promise.resolve({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        account: "user-free",
      }),
    }),
  );

  expect(markup).toContain("CaresLink AI");
  expect(markup).not.toContain("draftPayload=");
});
```

This test verifies the page still renders draftId-only handoff without leaking `draftPayload`. The component itself is invisible, so rely on Task 5 component tests for behavior.

- [ ] **Step 2: Run page tests**

Run:

```powershell
pnpm.cmd exec vitest run src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: PASS before or after mount if existing rendering is already stable. If it fails because of missing import, implement Step 3.

- [ ] **Step 3: Mount persister**

In each target page, import:

```ts
import { ProviderDraftHandoffPersister } from "@/components/provider-draft-handoff-persister";
```

After computing `handoff`, add this helper:

```tsx
const localDraftPersister = (
  <ProviderDraftHandoffPersister
    source={handoff.source}
    draftId={handoff.draftId}
    draftPayload={handoff.draftPayload}
  />
);
```

Render `{localDraftPersister}` inside the returned tree for both signed-out and signed-in branches. For example, signed-in pages can render:

```tsx
return (
  <AppShell ...>
    {localDraftPersister}
    ...
  </AppShell>
);
```

For signed-out pages, wrap the existing gate in a fragment:

```tsx
return (
  <>
    {localDraftPersister}
    <ReferralWorkspaceLoginGate ... />
  </>
);
```

- [ ] **Step 4: Run page tests**

Run:

```powershell
pnpm.cmd exec vitest run src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/referral-workspace/profile/page.tsx src/app/referral-workspace/health/page.tsx src/app/referral-workspace/materials/page.tsx src/app/referral-workspace/access/page.tsx src/app/referral-workspace/referral-workspace-pages.test.tsx
git commit -m "feat: mount provider draft handoff persister"
```

---

## Task 7: Manual E2E Smoke Script

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add smoke test instructions**

Add this section to `README.md`:

```md
## Provider Draft Handoff Smoke Test

1. Start the app with Supabase env vars:

   ```bash
   SUPABASE_URL=https://adocsnwnslxhxcjgbyee.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   pnpm dev
   ```

2. Open:

   `http://127.0.0.1:3000/referral-workspace/profile?source=provider-profile-generator&draftId=manual-smoke&account=user-free`

3. In DevTools Console, create a public generator handoff:

   ```js
   localStorage.setItem(
     "careslink-ai-provider-draft:manual-smoke",
     JSON.stringify({
       version: 1,
       source: "provider-profile-generator",
       draftId: "manual-smoke",
       payload: {
         version: 1,
         id: "manual-smoke",
         businessName: "Manual Smoke Provider",
         serviceCategories: ["Personal care"],
         referralServices: ["SERV-0002"],
         serviceAreas: ["Sydney"],
         languages: ["English"],
         supportsNdis: true,
         supportsAgedCare: false,
         acceptingNewClients: true,
         urgentReferralAvailable: false,
         shortDescription: "Provider-submitted public profile draft for smoke testing.",
         targetClients: "Older people and families",
         publicContactMethods: ["Phone"],
         sourceChannel: "manual-smoke",
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString()
       },
       savedAt: new Date().toISOString()
     })
   );
   location.reload();
   ```

4. The page should refresh and show `Manual Smoke Provider`.

5. Open:

   - `/referral-workspace/health?source=provider-profile-generator&draftId=manual-smoke&account=user-free`
   - `/referral-workspace/materials?source=provider-profile-generator&draftId=manual-smoke&account=user-free`
   - `/referral-workspace/access?source=provider-profile-generator&draftId=manual-smoke&account=user-free`

6. Each page should resolve the same provider draft by `draftId`.
```

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs: add provider draft handoff smoke test"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run focused tests**

```powershell
$env:PATH='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm.cmd exec vitest run src/lib/provider-draft-store.test.ts src/lib/provider-draft-local-handoff.test.ts src/app/api/provider-drafts/route.test.ts src/components/provider-draft-handoff-persister.test.tsx src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full tests**

```powershell
pnpm.cmd test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```powershell
pnpm.cmd exec tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

```powershell
pnpm.cmd lint
```

Expected: no ESLint errors.

- [ ] **Step 5: Run build**

```powershell
pnpm.cmd build
```

Expected: Next.js build succeeds.

- [ ] **Step 6: Verify Supabase table grants**

Use Supabase SQL:

```sql
select
  to_regclass('public.provider_drafts') is not null as table_exists,
  coalesce((select relrowsecurity from pg_class where oid = 'public.provider_drafts'::regclass), false) as rls_enabled,
  has_table_privilege('service_role', 'public.provider_drafts', 'select') as service_role_select,
  has_table_privilege('service_role', 'public.provider_drafts', 'insert') as service_role_insert,
  has_table_privilege('service_role', 'public.provider_drafts', 'update') as service_role_update,
  has_table_privilege('service_role', 'public.provider_drafts', 'delete') as service_role_delete,
  has_table_privilege('anon', 'public.provider_drafts', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.provider_drafts', 'select') as authenticated_select;
```

Expected:

```json
{
  "table_exists": true,
  "rls_enabled": true,
  "service_role_select": true,
  "service_role_insert": true,
  "service_role_update": true,
  "service_role_delete": true,
  "anon_select": false,
  "authenticated_select": false
}
```

- [ ] **Step 7: Search for prohibited trust wording**

```powershell
rg -n "approved|compliant|verified|guaranteed|guarantee|certification|clinical advice|endorsement" src README.md
```

Expected: no new risky wording in provider draft handoff copy. Existing disclaimer wording can include negations such as "Not a CaresLink endorsement".

- [ ] **Step 8: Commit final verification note if docs changed**

```powershell
git status --short
```

Expected: only intentional files changed.

---

## Acceptance Criteria

- First entry from public generator with URL `source=provider-profile-generator&draftId=<id>` and localStorage draft persists to Supabase through `/api/provider-drafts`.
- Existing URL `draftPayload` handoff still works and upserts to Supabase.
- Later visits with only `draftId` resolve from `provider_drafts`.
- `/referral-workspace/profile`, `/referral-workspace/health`, `/referral-workspace/materials`, and `/referral-workspace/access` read the same provider draft.
- Memory store fallback still works when Supabase env vars are missing.
- No public URL contains private lead capture fields.
- Persisted payload is canonical public provider data only.
- No wording claims providers are approved, compliant, verified, guaranteed, certified, endorsed, or clinically assessed.
- Tests, typecheck, lint, and build pass.

## Follow-Up After This Plan

After this handoff is stable, implement authenticated claiming:

- Add `POST /api/provider-drafts/claim`.
- Require signed-in user/session once real auth is wired.
- Set `owner_user_id` and `status='claimed'`.
- Make workspace saved profiles user-scoped.
- Add admin review list for access requests and claimed provider drafts.
