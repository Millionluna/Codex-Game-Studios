# CaresLink AI v1.2 Targeted Referral Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CaresLink AI useful after profile generation by giving providers target-specific Referral Pack wording, a clear copy/send workflow, and a better follow-up queue.

**Architecture:** Keep the current Next.js App Router, Supabase-backed stores, server-rendered workspace pages, and client-only copy button pattern. Add a small deterministic Referral Pack target copy helper and update existing workspace pages; do not add a new AI endpoint or marketplace logic.

**Tech Stack:** Next.js App Router, React server components, TypeScript, Vitest, Supabase-backed stores, existing workspace components.

---

## Source Spec

`docs/superpowers/specs/2026-06-30-careslink-ai-v1.2-targeted-referral-pack-design.md`

## Non-Goals

- No OpenAI endpoint.
- No new AI material type.
- No marketplace.
- No booking.
- No lead resale.
- No payment.
- No provider ranking.
- No provider verification, certification, endorsement, approval, guarantee, or quality assessment.
- No clinical, legal, compliance, medical, or care advice.
- No storing copied content in analytics.
- No GitHub push unless the product owner explicitly asks for it.

## File Map

Modify:

- `apps/careslink-ai/src/app/referral-workspace/page.tsx`
  - Fix Chinese copy.
  - Improve next action logic.
  - Surface pack/send/follow-up state more clearly.

- `apps/careslink-ai/src/app/referral-workspace/referral-pack/page.tsx`
  - Fix Chinese copy.
  - Add target-specific primary pack copy.
  - Make copy -> record send flow more explicit.

- `apps/careslink-ai/src/app/referral-workspace/outreach/page.tsx`
  - Fix Chinese copy.
  - Group records into follow-up due, no reply yet, replied, recent.
  - Keep existing create/update API.

- `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`
  - Add regression tests for non-corrupted Chinese.
  - Add target-specific pack tests.
  - Add outreach grouping tests.

Create:

- `apps/careslink-ai/src/lib/referral-pack-target-copy.ts`
  - Pure deterministic helper for target-specific pack copy.

- `apps/careslink-ai/src/lib/referral-pack-target-copy.test.ts`
  - Unit tests for target copy generation in English and Simplified Chinese.

Optional modify:

- `apps/careslink-ai/src/components/generated-draft-copy-button.tsx`
  - Only if needed to support non-generated target copy telemetry. Do not store copied content.

## Task 1: Fix Workspace Chinese Copy Regression

**Files:**

- Modify: `apps/careslink-ai/src/app/referral-workspace/page.tsx`
- Modify: `apps/careslink-ai/src/app/referral-workspace/referral-pack/page.tsx`
- Modify: `apps/careslink-ai/src/app/referral-workspace/outreach/page.tsx`
- Test: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Add failing tests for readable Simplified Chinese workspace copy**

Add expectations to the existing page rendering tests.

```ts
expect(markup).toContain("Referral Pack 工作台");
expect(markup).toContain("转介资料包");
expect(markup).toContain("跟进助手");
expect(markup).toContain("服务商");
expect(markup).not.toContain("杞");
expect(markup).not.toContain("鏉");
expect(markup).not.toContain("鍑");
expect(markup).not.toContain("€");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
$env:PATH='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" test src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: FAIL until corrupted strings are replaced.

- [ ] **Step 3: Replace corrupted Chinese copy in `page.tsx`**

Replace the `locale === "zh-Hans"` blocks in `getCockpitCopy`, `materialQueueFeatures`, and `getProviderWorkspaceCopy` with natural Simplified Chinese.

Use these required phrases:

```ts
headerTitle: "Referral Pack 工作台",
headerDescription: "准备可发送的转介资料包，记录发给了谁，并跟进下一步。",
profileStatusTitle: "资料包来源",
referralReadinessTitle: "转介阻碍",
nextStepsTitle: "下一步转介动作",
savedMaterialsTitle: "已保存材料",
referralLoopTitle: "Referral Pack 和跟进",
workspaceAccessTitle: "工作区访问",
materialQueueTitle: "AI 材料队列",
recentActivityTitle: "最近动态",
usageBoundaryTitle: "使用边界",
providerLabel: "服务商",
serviceAreaLabel: "服务范围",
languageLabel: "语言",
readinessScoreLabel: "资料包准备度",
openIssueLabel: "转介阻碍",
noIssueLabel: "暂无转介阻碍",
```

- [ ] **Step 4: Replace corrupted Chinese copy in `referral-pack/page.tsx`**

Use these required phrases:

```ts
title: "转介资料包",
description: "把当前服务商资料和已保存草稿整理成可复核、可复制、可记录发送状态的材料。",
primaryAction: "记录一次发送",
secondaryAction: "查看跟进",
targetTitle: "选择要发给谁",
targetDescription: "不同转介对象需要不同重点。先选择对象，再复制最适合的介绍并记录发送。",
packTitle: "可发送材料",
packDescription: "复制前请由服务商自行复核。这些内容仅用于一般商业资料和运营支持。",
markSent: "记录已发送",
recipientPlaceholder: "联系人姓名",
channelLabel: "渠道",
roleLabel: "联系人类型",
```

- [ ] **Step 5: Replace corrupted Chinese copy in `outreach/page.tsx`**

Use these required phrases:

```ts
eyebrow: "跟进",
title: "转介跟进助手",
description: "查看哪些 Referral Pack 需要跟进，更新回应状态，并记录新的发送。",
addTitle: "添加或记录一次发送",
listTitle: "跟进记录",
followUpQueueTitle: "需要跟进",
recentSendsTitle: "最近发送",
empty: "还没有跟进记录。先从 Referral Pack 复制材料并记录一次发送。",
saved: "跟进记录已保存。",
updated: "跟进记录已更新。",
recipientName: "联系人姓名",
organisation: "机构 / 组织",
roleType: "联系人类型",
status: "状态",
nextFollowUpAt: "下次跟进日期",
```

- [ ] **Step 6: Re-run the focused test and verify it passes**

Run the same command as Step 2.

Expected: PASS.

## Task 2: Add Deterministic Target-Specific Pack Copy

**Files:**

- Create: `apps/careslink-ai/src/lib/referral-pack-target-copy.ts`
- Create: `apps/careslink-ai/src/lib/referral-pack-target-copy.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `referral-pack-target-copy.test.ts` with tests for support coordinator, community group, and family contact.

```ts
import { describe, expect, it } from "vitest";
import {
  buildReferralPackTargetCopy,
  referralPackTargetOptions,
} from "./referral-pack-target-copy";
import type { ReferralProfile } from "./referral-profile-workspace";

const profile: ReferralProfile = {
  id: "provider-1",
  name: "Harbour Community Support",
  entityType: "organisation",
  referralDirection: "receive",
  serviceCategories: ["Home care", "Social support"],
  serviceAreas: ["Sydney", "Chatswood"],
  languages: ["English", "Mandarin"],
  contactMethods: ["Phone", "Website"],
  description:
    "Neighbourhood aged care navigation and social support for older adults.",
  receivingReferralDetails:
    "Phone warm handover and secure web form. Response within two business days.",
  sendingReferralDetails: "",
  notes: "",
};

describe("referral pack target copy", () => {
  it("lists the supported recipient targets", () => {
    expect(referralPackTargetOptions.map((target) => target.id)).toEqual([
      "support_coordinator",
      "case_manager",
      "provider_partner",
      "community_group",
      "family_contact",
    ]);
  });

  it("builds support coordinator wording without endorsement claims", () => {
    const copy = buildReferralPackTargetCopy({
      profile,
      target: "support_coordinator",
      locale: "en",
    });

    expect(copy.title).toBe("For support coordinators");
    expect(copy.body).toContain("Harbour Community Support");
    expect(copy.body).toContain("Sydney, Chatswood");
    expect(copy.body).toContain("Phone, Website");
    expect(copy.body).not.toMatch(/verified|approved|endorsed|guaranteed|compliant/i);
  });

  it("builds community group wording in Simplified Chinese", () => {
    const copy = buildReferralPackTargetCopy({
      profile,
      target: "community_group",
      locale: "zh-Hans",
    });

    expect(copy.title).toBe("发给社区群组");
    expect(copy.body).toContain("Harbour Community Support");
    expect(copy.body).toContain("Sydney、Chatswood");
    expect(copy.body).toContain("English、Mandarin");
  });
});
```

- [ ] **Step 2: Run the new unit test and verify it fails**

Run:

```powershell
$env:PATH='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" test src/lib/referral-pack-target-copy.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement `referral-pack-target-copy.ts`**

Create a pure helper with this public API:

```ts
import type { Locale } from "./referral-workspace-i18n";
import type { ReferralProfile } from "./referral-profile-workspace";

export type ReferralPackTarget =
  | "support_coordinator"
  | "case_manager"
  | "provider_partner"
  | "community_group"
  | "family_contact";

export type ReferralPackTargetCopy = {
  target: ReferralPackTarget;
  title: string;
  description: string;
  body: string;
  reviewNote: string;
};

export const referralPackTargetOptions: Array<{
  id: ReferralPackTarget;
  enLabel: string;
  zhLabel: string;
}> = [
  { id: "support_coordinator", enLabel: "Support coordinator", zhLabel: "支持协调员" },
  { id: "case_manager", enLabel: "Case manager", zhLabel: "个案经理" },
  { id: "provider_partner", enLabel: "Other provider", zhLabel: "其他服务商" },
  { id: "community_group", enLabel: "Community group", zhLabel: "社区群组" },
  { id: "family_contact", enLabel: "Family contact", zhLabel: "家庭联系人" },
];

export function buildReferralPackTargetCopy({
  profile,
  target,
  locale,
}: {
  profile: ReferralProfile;
  target: ReferralPackTarget;
  locale: Locale;
}): ReferralPackTargetCopy {
  const services = joinList(profile.serviceCategories, locale);
  const areas = joinList(profile.serviceAreas, locale);
  const languages = joinList(profile.languages, locale);
  const contacts = joinList(profile.contactMethods, locale);
  const description = profile.description || profile.receivingReferralDetails || "";

  if (locale === "zh-Hans") {
    return buildZhCopy({ profile, target, services, areas, languages, contacts, description });
  }

  return buildEnCopy({ profile, target, services, areas, languages, contacts, description });
}
```

The implementation must:

- Use only submitted profile fields.
- Return deterministic copy.
- Include a provider-review note.
- Avoid claims containing `verified`, `approved`, `endorsed`, `guaranteed`, `compliant`, `certified`, `quality`.

- [ ] **Step 4: Re-run the unit test and verify it passes**

Expected: PASS.

## Task 3: Wire Target Copy Into Referral Pack Page

**Files:**

- Modify: `apps/careslink-ai/src/app/referral-workspace/referral-pack/page.tsx`
- Test: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Add failing page tests**

Add assertions for target-specific content:

```ts
expect(markup).toContain("Choose who you are sending to");
expect(markup).toContain("For support coordinators");
expect(markup).toContain("For case managers");
expect(markup).toContain("For community groups");
expect(markup).toContain("Copy target wording");
expect(markup).toContain("Record this send");
```

For Simplified Chinese:

```ts
expect(markup).toContain("选择要发给谁");
expect(markup).toContain("发给支持协调员");
expect(markup).toContain("复制这段文案");
expect(markup).toContain("记录这次发送");
```

- [ ] **Step 2: Run focused page tests and verify they fail**

Run:

```powershell
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" test src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: FAIL until UI is wired.

- [ ] **Step 3: Import the target helper**

Add:

```ts
import {
  buildReferralPackTargetCopy,
  referralPackTargetOptions,
  type ReferralPackTarget,
} from "@/lib/referral-pack-target-copy";
```

- [ ] **Step 4: Build target copies inside `ProviderReferralPack`**

After `items` is created:

```ts
const targetCopies = referralPackTargetOptions.map((target) =>
  buildReferralPackTargetCopy({
    profile,
    target: target.id,
    locale,
  }),
);
```

- [ ] **Step 5: Replace the static target rows with actionable target cards**

Use the existing `WorkspaceSection`, `WorkspaceStatusPill`, and `GeneratedDraftCopyButton` style. The card should show:

- label
- description
- body
- review note
- copy button
- inline record send form anchor or compact form

Do not require AI access for this target copy.

- [ ] **Step 6: Make record-send labels target-aware**

For each target card, default hidden `roleType` to the matching outreach role:

```ts
const targetRoleMap: Record<ReferralPackTarget, OutreachRecipientRole> = {
  support_coordinator: "support_coordinator",
  case_manager: "case_manager",
  provider_partner: "provider",
  community_group: "community_group",
  family_contact: "family_contact",
};
```

- [ ] **Step 7: Re-run focused tests and verify they pass**

Expected: PASS.

## Task 4: Improve Outreach Queue Grouping

**Files:**

- Modify: `apps/careslink-ai/src/app/referral-workspace/outreach/page.tsx`
- Test: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Add failing page test expectations**

Add tests for these visible sections:

```ts
expect(markup).toContain("Needs follow-up");
expect(markup).toContain("No reply yet");
expect(markup).toContain("Replied");
expect(markup).toContain("Recent sends");
```

Chinese:

```ts
expect(markup).toContain("需要跟进");
expect(markup).toContain("尚未回复");
expect(markup).toContain("已回复");
expect(markup).toContain("最近发送");
```

- [ ] **Step 2: Create queue helper functions**

Inside `outreach/page.tsx`, add small helpers:

```ts
function getNoReplyRecords(records: OutreachRecord[]) {
  return records.filter((record) => record.status === "sent" || record.status === "to_send");
}

function getRepliedRecords(records: OutreachRecord[]) {
  return records.filter((record) => record.status === "replied");
}
```

Keep existing `getFollowUpRecords` and `getRecentSendRecords`.

- [ ] **Step 3: Render grouped sections**

Render sections in this order:

1. `followUpRecords`
2. `noReplyRecords`
3. `repliedRecords`
4. `recentSendRecords`
5. add/manual form

Use the existing `OutreachTable` component and keep update forms unchanged.

- [ ] **Step 4: Re-run focused tests and verify they pass**

Expected: PASS.

## Task 5: Update Cockpit Next Action Logic

**Files:**

- Modify: `apps/careslink-ai/src/app/referral-workspace/page.tsx`
- Test: `apps/careslink-ai/src/app/referral-workspace/referral-workspace-pages.test.tsx`

- [ ] **Step 1: Add tests for cockpit action priority**

Add route render expectations:

```ts
expect(markup).toContain("Prepare Referral Pack");
expect(markup).toContain("Record sends and follow-ups");
expect(markup).toContain("Next referral action");
```

Chinese:

```ts
expect(markup).toContain("准备 Referral Pack");
expect(markup).toContain("记录发送和跟进");
expect(markup).toContain("下一步转介动作");
```

- [ ] **Step 2: Adjust primary action helper**

Update `getPrimaryProviderActionKey` so priority is:

1. profile if score is below the current threshold
2. referralPack if no material/send activity exists
3. outreach if no outreach records exist
4. outreach if any follow-up records exist
5. health if audit issues remain
6. referralPack otherwise

- [ ] **Step 3: Update copy to emphasize action**

Use this English title:

```ts
nextStepsTitle: "Next referral action"
```

Use this Chinese title:

```ts
nextStepsTitle: "下一步转介动作"
```

- [ ] **Step 4: Re-run focused tests and verify they pass**

Expected: PASS.

## Task 6: Verification

**Files:**

- No code changes.

- [ ] **Step 1: Run focused tests**

```powershell
$env:PATH='C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" test src/lib/referral-pack-target-copy.test.ts src/app/referral-workspace/referral-workspace-pages.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

```powershell
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```powershell
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run lint**

```powershell
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" lint
```

Expected: PASS.

- [ ] **Step 5: Run production build**

```powershell
pnpm --dir "C:\Users\ASUS\Documents\aged care platform\apps\careslink-ai" build
```

Expected: PASS.

## Manual Smoke Checklist

Local or preview URL:

- `/referral-workspace?account=user-approved&lang=zh-Hans`
- `/referral-workspace/referral-pack?account=user-approved&lang=zh-Hans`
- `/referral-workspace/outreach?account=user-approved&lang=zh-Hans`
- `/referral-workspace?account=user-approved&lang=en`
- `/referral-workspace/referral-pack?account=user-approved&lang=en`
- `/referral-workspace/outreach?account=user-approved&lang=en`

Check:

- No corrupted Chinese.
- No visible demo/internal terms in real Supabase sessions.
- Target cards are readable.
- Copy buttons work.
- Record send form posts successfully for a real provider session.
- Outreach status update still works.
- Admin pages still show metadata only.

## Deployment Note

Do not push to GitHub for this release unless explicitly requested.

If the product owner asks to publish after verification, deploy from `apps/careslink-ai` with Vercel CLI and smoke production manually.

## Completion Summary Template

When implementation is done, report:

- Files changed.
- Focused tests result.
- Full verification result.
- Production deploy status, if requested.
- Whether Core public site needs copy or CTA changes.

Expected Core dependency:

- None for v1.2 P0.

Optional Core follow-up:

- If target-specific Referral Pack performs well, public preview CTA can eventually change from "Continue to CaresLink AI" to "Prepare your Referral Pack".
