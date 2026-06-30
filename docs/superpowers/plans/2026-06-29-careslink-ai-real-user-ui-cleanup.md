# CaresLink AI Real User UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove internal/demo/future-product surfaces from real provider sessions and replace the confusing referral role matrix with a provider-facing "my referral role" checklist.

**Architecture:** Keep demo data and legacy routes available only for explicit local/internal demo contexts. Real provider sessions should see only their own profile, readiness, materials, access, and reviewable next actions. The shared referral profile component should render a user-facing single-profile role panel by default and render the old multi-profile matrix only when explicitly asked for internal demo review.

**Tech Stack:** Next.js App Router, React server components, Vitest, TypeScript, existing CaresLink AI workspace auth/session/i18n helpers.

---

## File Structure

- Modify: `apps/careslink-ai/src/components/referral-profile-workspace.tsx`
  - Add `ReferralRoleChecklistPanel` for single-profile user-facing role explanation.
  - Add an explicit `showInternalRoleMatrix?: boolean` prop if the old matrix still needs to exist for local demo review.
  - Ensure real provider pages do not render other seed provider rows.
- Modify: `apps/careslink-ai/src/components/referral-profile-workspace.test.tsx`
  - Add component-level tests proving zh-Hans/en panels do not expose matrix/demo/internal terms.
- Modify: `apps/careslink-ai/src/app/referral-workspace/profile/page.tsx`
  - Render only the signed-in/current provider's role checklist.
  - Do not render seed profile collections in normal provider mode.
- Modify: `apps/careslink-ai/src/app/referral-workspace/page.tsx`
  - Remove any homepage section that surfaces the matrix, seed records, or multiple providers.
- Modify: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`
  - Add route-level regression tests for provider sessions: no "转介角色矩阵", "seed", "demo", `user-free`, `user-approved`, other provider names, or old matrix labels in visible text.
- Modify: `apps/careslink-ai/src/lib/referral-workspace-i18n.ts`
  - Replace matrix copy with user-facing role copy:
    - en: "Your referral role", "You mainly receive referrals", "You send referrals", "You do both"
    - zh-Hans: "你的转介角色", "我主要接收转介", "我主要发送转介", "我两者都会"
  - Replace "Relevant / Not used" with "Provided / Needs details / Not applicable".
- Modify: `docs/careslink-ai-website-integration-brief.md`
  - Add a short v0.6 note: real provider sessions no longer show internal role matrix or seed records.

---

### Task 1: Add Regression Tests For Hidden Internal Provider UI

**Files:**
- Modify: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Add a helper assertion near the existing internal-copy helpers**

```ts
function expectNoInternalRoleMatrixCopy(visibleText: string) {
  [
    "转介角色矩阵",
    "Referral role matrix",
    "种子集合",
    "seed set",
    "Seeded Harbour",
    "相关",
    "不使用",
    "Relevant",
    "Not used",
    "Vitalcare support",
    "Harbour Community Support",
    "Alex Lee",
    "CarePath Advisory",
  ].forEach((copy) => {
    expect(visibleText).not.toContain(copy);
  });
}
```

- [ ] **Step 2: Add a provider profile route regression test**

Append this test inside `describe("referral workspace route localization", () => { ... })`:

```ts
it("hides internal role matrix and seed provider records from provider profile pages", async () => {
  const { default: ReferralProfilePage } = await import("./profile/page");

  const markup = await renderPage(ReferralProfilePage, {
    account: "user-approved",
    lang: "zh-Hans",
  });
  const visibleText = getVisibleText(markup);

  expect(visibleText).toContain("你的转介角色");
  expect(visibleText).toContain("接收转介需要补充");
  expectNoInternalRoleMatrixCopy(visibleText);
  expect(visibleText).not.toContain("user-approved");
  expect(visibleText).not.toContain("user-free");
});
```

- [ ] **Step 3: Add a provider cockpit regression test**

```ts
it("hides internal role matrix and seed provider records from the provider cockpit", async () => {
  const { default: ReferralWorkspacePage } = await import("./page");

  const markup = await renderPage(ReferralWorkspacePage, {
    account: "user-approved",
    lang: "zh-Hans",
  });
  const visibleText = getVisibleText(markup);

  expect(visibleText).toContain("服务商工作台");
  expectNoInternalRoleMatrixCopy(visibleText);
  expect(visibleText).not.toContain("user-approved");
  expect(visibleText).not.toContain("user-free");
});
```

- [ ] **Step 4: Run focused route tests and verify they fail**

Run:

```bash
cd "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai"
$env:PATH="C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;$env:PATH"
pnpm exec vitest run src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: FAIL because "转介角色矩阵" and seed provider rows are still visible.

---

### Task 2: Replace Role Matrix With A Single Provider Role Checklist

**Files:**
- Modify: `apps/careslink-ai/src/components/referral-profile-workspace.tsx`
- Modify: `apps/careslink-ai/src/lib/referral-workspace-i18n.ts`
- Test: `apps/careslink-ai/src/components/referral-profile-workspace.test.tsx`

- [ ] **Step 1: Extend i18n component copy**

Add a new `roleChecklist` object under `components` for both locales. Use these exact values for zh-Hans:

```ts
roleChecklist: {
  title: "你的转介角色",
  description:
    "根据你当前资料，CaresLink 会把后续表格和材料聚焦在你实际需要的转介场景上。",
  receiveLabel: "我主要接收转介",
  sendLabel: "我主要发送转介",
  bothLabel: "我两者都会",
  receiveNeedsTitle: "接收转介需要补充",
  sendNeedsTitle: "发送转介需要补充",
  provided: "已提供",
  needsDetails: "需要补充",
  notApplicable: "暂不适用",
  receiveItems: {
    serviceArea: "服务区域",
    serviceTypes: "可接收服务类型",
    languages: "语言能力",
    capacity: "接单能力",
    responseTime: "响应时间",
    contact: "联系方式",
  },
  sendItems: {
    clientNeed: "客户需求摘要",
    location: "所在地区",
    language: "首选语言",
    consent: "同意联系状态",
    preferredTime: "希望联系时间",
    notes: "转介备注",
  },
}
```

Use these exact values for en:

```ts
roleChecklist: {
  title: "Your referral role",
  description:
    "CaresLink uses your current profile to focus forms and materials on the referral scenarios you actually need.",
  receiveLabel: "I mainly receive referrals",
  sendLabel: "I mainly send referrals",
  bothLabel: "I do both",
  receiveNeedsTitle: "Receive-referral details to complete",
  sendNeedsTitle: "Send-referral details to complete",
  provided: "Provided",
  needsDetails: "Needs details",
  notApplicable: "Not applicable",
  receiveItems: {
    serviceArea: "Service area",
    serviceTypes: "Accepted service types",
    languages: "Languages",
    capacity: "Capacity",
    responseTime: "Response time",
    contact: "Contact method",
  },
  sendItems: {
    clientNeed: "Client need summary",
    location: "Location",
    language: "Preferred language",
    consent: "Consent to contact",
    preferredTime: "Preferred contact time",
    notes: "Referral notes",
  },
}
```

- [ ] **Step 2: Export a new panel component**

In `referral-profile-workspace.tsx`, add:

```tsx
type ReferralRoleChecklistPanelProps = {
  summary: BasicProfileSummary;
  locale?: Locale;
  className?: string;
};

export function ReferralRoleChecklistPanel({
  summary,
  locale = DEFAULT_LOCALE,
  className,
}: ReferralRoleChecklistPanelProps) {
  const copy = getReferralWorkspaceCopy(locale).components.roleChecklist;
  const roleLabel =
    summary.referralDirection === "both"
      ? copy.bothLabel
      : summary.referralDirection === "send"
        ? copy.sendLabel
        : copy.receiveLabel;

  const receiveItems = [
    [copy.receiveItems.serviceArea, summary.serviceAreas.length > 0],
    [copy.receiveItems.serviceTypes, summary.bestFit.length > 0],
    [copy.receiveItems.languages, summary.languages.length > 0],
    [copy.receiveItems.capacity, Boolean(summary.capacityStatus)],
    [copy.receiveItems.responseTime, Boolean(summary.responseTime)],
    [copy.receiveItems.contact, Boolean(summary.intakeMethod)],
  ] as const;

  const sendItems = [
    [copy.sendItems.clientNeed, summary.referralFitNotes.length > 0],
    [copy.sendItems.location, summary.serviceAreas.length > 0],
    [copy.sendItems.language, summary.languages.length > 0],
    [copy.sendItems.consent, Boolean(summary.consentReminder)],
    [copy.sendItems.preferredTime, Boolean(summary.followUpCadence)],
    [copy.sendItems.notes, Boolean(summary.handoverRequirements)],
  ] as const;

  const showReceive =
    summary.referralDirection === "receive" || summary.referralDirection === "both";
  const showSend =
    summary.referralDirection === "send" || summary.referralDirection === "both";

  return (
    <Card className={cx("workspace-card", className)}>
      <div className="workspace-card-header">
        <div>
          <p className="workspace-section-kicker">{copy.title}</p>
          <h2>{roleLabel}</h2>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className="workspace-two-column-grid">
        {showReceive ? (
          <RoleChecklistGroup
            title={copy.receiveNeedsTitle}
            items={receiveItems}
            providedLabel={copy.provided}
            missingLabel={copy.needsDetails}
          />
        ) : null}
        {showSend ? (
          <RoleChecklistGroup
            title={copy.sendNeedsTitle}
            items={sendItems}
            providedLabel={copy.provided}
            missingLabel={copy.needsDetails}
          />
        ) : null}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Add the small internal list helper**

```tsx
function RoleChecklistGroup({
  title,
  items,
  providedLabel,
  missingLabel,
}: {
  title: string;
  items: readonly (readonly [string, boolean])[];
  providedLabel: string;
  missingLabel: string;
}) {
  return (
    <section className="workspace-soft-panel">
      <h3>{title}</h3>
      <div className="workspace-checklist">
        {items.map(([label, isProvided]) => (
          <div className="workspace-checklist-row" key={label}>
            <span>{label}</span>
            <span className={isProvided ? "status-pill good" : "status-pill warning"}>
              {isProvided ? providedLabel : missingLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add component test**

In `referral-profile-workspace.test.tsx`, import `ReferralRoleChecklistPanel` and add:

```ts
it("renders a provider-facing referral role checklist without matrix or seed wording", () => {
  const profile = getSeedReferralProfiles()[1];
  const summary = summarizeProfile(profile);

  const markup = renderToStaticMarkup(
    createElement(ReferralRoleChecklistPanel, {
      summary,
      locale: "zh-Hans",
    }),
  );

  expect(markup).toContain("你的转介角色");
  expect(markup).toContain("我主要接收转介");
  expect(markup).toContain("接收转介需要补充");
  expect(markup).toContain("服务区域");
  expect(markup).not.toContain("转介角色矩阵");
  expect(markup).not.toContain("种子集合");
  expect(markup).not.toContain("相关");
  expect(markup).not.toContain("不使用");
});
```

- [ ] **Step 5: Run component test**

Run:

```bash
pnpm exec vitest run src/components/referral-profile-workspace.test.tsx
```

Expected: PASS.

---

### Task 3: Wire Provider Pages To The New Role Checklist

**Files:**
- Modify: `apps/careslink-ai/src/app/referral-workspace/profile/page.tsx`
- Modify: `apps/careslink-ai/src/app/referral-workspace/page.tsx`

- [ ] **Step 1: Import the panel**

Where `BasicProfileCard`, `HealthScorePanel`, and related workspace components are imported, add:

```ts
ReferralRoleChecklistPanel,
```

- [ ] **Step 2: Render the panel after the profile summary**

In provider profile page markup, place this after the current provider's `BasicProfileCard`:

```tsx
<ReferralRoleChecklistPanel summary={summary} locale={locale} />
```

Use the already resolved current `summary`; do not call `getSeedReferralProfiles()` for this panel.

- [ ] **Step 3: Remove the old matrix from real provider rendering**

Delete or guard the old multi-profile matrix block. If kept for internal demo, guard it with:

```tsx
{gate.source === "demo" && searchParams.showInternalMatrix === "1" ? (
  <InternalReferralRoleMatrix profiles={getSeedReferralProfiles()} locale={locale} />
) : null}
```

Do not render it for real Supabase provider sessions.

- [ ] **Step 4: Keep demo fallback but make it explicit**

If a demo-only internal matrix remains, require `showInternalMatrix=1`. Normal URLs such as:

```text
/referral-workspace?account=user-approved&lang=zh-Hans
/referral-workspace/profile?account=user-approved&lang=zh-Hans
```

must not show the matrix.

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm exec vitest run src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: PASS.

---

### Task 4: Clean Provider-Facing Copy And Mojibake In Touched Areas

**Files:**
- Modify: `apps/careslink-ai/src/lib/referral-workspace-i18n.ts`
- Test: `apps/careslink-ai/src/lib/referral-workspace-i18n.test.ts`

- [ ] **Step 1: Replace touched zh-Hans profile copy with readable Simplified Chinese**

For the profile section only, ensure these values are readable:

```ts
profile: {
  eyebrow: "资料基础",
  title: "转介资料",
  description:
    "整理服务商身份、服务范围、接收转介信息和发送转介信息。这里不表示 CaresLink 对服务质量、资质或合规状态作出背书。",
  identitySection: "身份",
  footprintSection: "服务范围",
  receiveSection: "接收转介",
  sendSection: "发送转介",
  noPersistence:
    "这里显示的是当前资料预览。服务商需要复核后再用于公开分享或转介沟通。",
}
```

- [ ] **Step 2: Update i18n tests to ban matrix/internal copy in provider-visible Chinese**

Add to `referral-workspace-i18n.test.ts`:

```ts
it("keeps provider-facing zh-Hans role copy readable and non-internal", () => {
  const copy = getReferralWorkspaceCopy("zh-Hans");
  const roleCopy = JSON.stringify(copy.components.roleChecklist);

  expect(roleCopy).toContain("你的转介角色");
  expect(roleCopy).toContain("我主要接收转介");
  expect(roleCopy).not.toContain("矩阵");
  expect(roleCopy).not.toContain("种子");
  expect(roleCopy).not.toContain("demo");
  expect(roleCopy).not.toContain("user-approved");
});
```

- [ ] **Step 3: Run i18n tests**

Run:

```bash
pnpm exec vitest run src/lib/referral-workspace-i18n.test.ts
```

Expected: PASS.

---

### Task 5: Full Verification And Documentation

**Files:**
- Modify: `docs/careslink-ai-website-integration-brief.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Expected:

```text
Test Files passed
Tests passed
tsc passed with no output
eslint passed
next build compiled successfully
```

- [ ] **Step 2: Browser smoke**

Open:

```text
http://127.0.0.1:3000/referral-workspace?account=user-approved&lang=zh-Hans
http://127.0.0.1:3000/referral-workspace/profile?account=user-approved&lang=zh-Hans
```

Expected visible checks:

- Shows "你的转介角色".
- Shows only current provider context.
- Does not show "转介角色矩阵".
- Does not show "种子集合".
- Does not show "Vitalcare support", "Harbour Community Support", "Alex Lee", and "CarePath Advisory" together as a table.
- Does not show `user-free`, `user-approved`, "demo account", "legacy demo".

- [ ] **Step 3: Update integration brief**

Append:

```md
## 19. v0.6 Real Provider UI Cleanup

- Real provider workspace/profile pages no longer show the internal referral role matrix or seed provider records.
- Provider-facing role guidance is now shown as "Your referral role" / "你的转介角色" with role-specific completion checklists.
- Demo/internal seed data remains available only through explicit local/internal demo contexts, not normal provider sessions.
- No marketplace, booking, payment, provider endorsement, compliance, clinical, legal, or care advice behavior was added.
```

- [ ] **Step 4: Commit**

```bash
git add apps/careslink-ai/src/components/referral-profile-workspace.tsx \
  apps/careslink-ai/src/components/referral-profile-workspace.test.tsx \
  apps/careslink-ai/src/app/referral-workspace/profile/page.tsx \
  apps/careslink-ai/src/app/referral-workspace/page.tsx \
  apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx \
  apps/careslink-ai/src/lib/referral-workspace-i18n.ts \
  apps/careslink-ai/src/lib/referral-workspace-i18n.test.ts \
  docs/careslink-ai-website-integration-brief.md
git commit -m "fix: hide internal role matrix from provider workspace"
```

---

## Self-Review

- Spec coverage: The plan hides role matrix, seed records, demo/internal terms, and replaces them with a current-provider role checklist.
- No endpoint/payment/marketplace scope added.
- Admin pages are not changed except through shared copy tests; admin-only queues remain admin-only.
- Demo fallback is preserved only as explicit internal context.
- Boundary wording remains: general business profile / operational support only; no provider endorsement, compliance, clinical, legal, care advice, booking, marketplace, or lead resale.
