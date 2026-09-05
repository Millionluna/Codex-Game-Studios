# CaresLink Product Baseline V1.0 - Implementation Readiness Audit

## Protected Preview gate closure

This closure is the current status. Earlier failed disposable-branch attempts are
kept only where they are explicitly labelled as historical evidence.

- The NDIS canonical dual-write/shadow-read slice passed a protected App Preview on non-default, `with_data=false` branch `odrdlsrdlmtjczhmsbnj` without changing Production.
- Evidence covered legacy-success plus `PROJECTED`, metadata-only `MATCH`, same-idempotency replay without an extra revision, provider B isolation, and master kill-switch behavior (`legacy=true`, `shadow=false`). No model call was made.
- A parser-invalid fixture exposed an adapter boundary that previously produced no integration log. The boundary now emits content-free `PROJECTION_ERROR` metadata while preserving the legacy response; tests reject note body, participant facts and secrets in logs.
- Provider A/B users and all synthetic legacy/canonical/integration/claim/event/quota/credit/Point rows were cleared to zero.
- The five test Preview deployments and six activation/test Preview variables were removed. Production deployment/alias remained unchanged.
- The owner intentionally retained the empty branch as the dedicated Preview schema baseline. Its base Preview connection remains, but activation flags are absent. Production schema, Points cutover and user canary remain unapproved.
- Post-review hardening was forward-applied only to that retained branch as migration registry versions `20260810072017`, `20260810072952`, `20260810073519`, `20260810073929` and `20260810080048`; a real synthetic pre-identity row upgraded successfully, an unidentifiable orphan failed closed, a simulated PURGED row remained terminal, a simulated missed tombstone surfaced as metadata-only `SOURCE_DELETE_CLEANUP_PENDING` while owner-hidden, and a same-ID/new-generation ABA fixture remained isolated with write-free tombstone replay. Updated rollback assertions passed, and all test/data counts returned to zero. The prior protected deployment predates the revised route bundle.

> 阶段：**Implementation Readiness / Current-state Audit**
> 审计日期：2026-08-09（Australia/Sydney）
> 生产运行实现状态：**未开始**。首批 inactive shadow 源码已实施；本文件仍不授权 schema 应用、Points 切换、Billing、模型、部署或生产数据变更。

## 1. 批准基线

以下文件是本轮 intended state 的 source of truth，并优先于旧的 quota、单一 NDIS Note、旧定价和 locale 约定：

1. `docs/2026-08-09-careslink-v1-product-baseline-approval.zh.md`
2. `docs/2026-08-09-careslink-app-v1-requirements-review.zh.md`
3. `docs/2026-08-09-careslink-ai-requirements-review.zh.md`

本审计只把代码、migration、RLS、测试和只读生产事实视为“已实现”证据。需求文档、旧 PRD、页面文案或设计稿不构成实现证据。

## 2. 总体结论

当前系统是一个可工作的 **Web-only NDIS Case Note pilot 加 legacy provider/referral workspace**，不是已批准的 CaresLink App V1 / CaresLink AI V1。

- **可复用的强底座**：Supabase UUID 身份、Email/Google 登录、provider-first 鉴权、浏览器 Privacy Review、服务端二次校验、结构化 OpenAI 输出、`store:false`、owner-only saved draft、metadata-only telemetry、幂等 reserve/commit/release。
- **最大产品缺口**：没有原生 iOS/Android App、没有共享 Product API / OpenAPI、没有五类 Note catalog、canonical document/revision/checkpoint、Points lots/rate catalog、完整导出、Library/Guides/Updates/Daily Brief、通知、Billing 或数据导出/账号删除 workflow。
- **明确冲突**：生产仍使用每周期 3 credits 和单次 1 credit；仅支持 `en` / `zh-Hans`；正式 AI Note 只有 NDIS；旧 fake-door 价格与 V1 定价不同；legacy Profile/Readiness/Referrals 仍有独立 access-code/quota 语义。
- **发布判断**：不应在现结构上继续堆 Note 页面。先建立共享合同和 additive canonical data model，再将现有 NDIS flow 作为第一个迁移纵切片。

### 2.1 首批安全实施增量

负责人已批准并完成了 Slice 0 的 contract/domain/schema-draft 子集。这里的“完成”仅指当前 worktree 中有代码和自动测试，不表示 API、数据库或用户功能已上线。

| 批次交付 | 状态 | 证据与边界 |
|---|---|---|
| Shared TypeScript contract | Shadow 已实现 | `src/lib/v1/shared-contracts.ts`；三 locale、五 Note code/neutral fields、正交状态、费率、错误码、幂等格式 |
| Product OpenAPI | Contract-only 已实现 | `contracts/careslink-v1-shadow.openapi.yaml`；无 `servers`、无 served `/v1` route |
| Canonical document/revision | Memory shadow 已实现 | owner-only snapshot、immutable revision、stale base、checkpoint、revision-bound self-review、tombstone/purge |
| Points | Memory + SQL shadow draft 已实现 | wallet/lots/rate quote/reserve/commit/release/append-only ledger；旧 credits 仍是唯一运行时真相 |
| NDIS legacy adapter | Read-only 已实现 | 单 row deterministic projection 与 metadata-only migration candidate；不读取批量生产数据、不 backfill |
| Additive schema/RLS/RPC | 隔离分支验证完成，Production 未应用 | 两次 fresh apply、owner-only SELECT、无 client write、Points RPC 仅 service role、复合 owner 外键；legacy 签名前后不变 |
| Runtime isolation | 已验证 | 只有经审计的 NDIS save route 可导入 server-only shadow integration；`src/components` 与其他 route 禁止导入；flag 默认 off 且未配置 |

本批最终源代码验证：focused `14 files / 131 tests`；全量 `90 files / 653 tests`；TypeScript、全仓 ESLint、52/52 static generation、`git diff --check`、1 file / 3 tests runtime boundary 与 46-file secret scan（0 个真实凭证命中）通过。早期两个 `with_data=false` 分支完成 foundation、NDIS integration、真实 JWT/RLS、Points RPC、两次 clean apply、并发幂等、revision 串行化、失败对账及匿名拒绝。后续受保护 App Preview 已在 retained branch `odrdlsrdlmtjczhmsbnj` 完成，证据见本文件顶部 closure 与 `documentation/ndis-shadow-preview-runbook.md`。OpenAPI 仍只有词汇/边界契约测试；正式 schema lint 与 generated client fixture 属于下一门槛。

### 2.2 隔离数据库门槛结论

- 目标分支 ref 与 Production ref 不同，Supabase 明确标记非 default、`with_data=false`；未复制或读取真实用户数据。
- migration 重置后再次应用成功；18/18 目标表、14/14 owner RLS/SELECT policy、5/5 service-role RPC grant 与 0 client write grant 符合合同。
- anon 为 401；Provider A/B JWT 只看到自己的 shadow row；`service_actor_test` 看到 0 row，不能冒充产品管理员。
- Points commit/release、lot 顺序、replay/conflict、过期、余额不足、跨 owner 和 append-only 应用边界通过；未自动发放 300 Points。
- 验证后 3 个临时用户、identity/session/refresh token 与全部 shadow fixture 均清理为 0；旧凭据返回 400，专用分支已删除。
- 此门槛只把 `AI-PERM-001/002`、`AI-PTS-001-007`、`AI-MIG-004/005/008` 增加为 isolated guarded-live evidence，不把任何 Production runtime 需求改写为已交付。

对应需求 ID 的**新增 shadow evidence**：

- Contract/catalog：`AI-FND-001/002`, `AI-TYPE-001-005`, `AI-IN-002`；对应 App 的 `APP-NOTE-001-005`, `APP-DOC-002`。只完成词汇、字段骨架和状态，不是五类可生成产品。
- Privacy/generation state：`AI-PRIV-003/004`, `AI-GEN-001-005`, `AI-GEN-007/008`。只完成 proof/job/quote/settlement 数据合同与 domain rule，当前 NDIS route 未接入。
- Documents/export state：`AI-DOC-001`, `AI-DOC-004`, `AI-DOC-006-011`, `AI-DOC-014-018`；对应 `APP-SYNC-002/003/005/008` 与 `APP-DOC-001-010` 的部分 shared contract。没有 durable repository、editor、renderer、artifact 或跨端恢复。
- Points：`AI-PTS-001-007` 与 `APP-PTS-001-004` 获得 shadow model/test evidence。没有 welcome eligibility、production wallet、统一 entitlement 或 cutover。
- Migration：`AI-MIG-004/005/006/008` 获得 read-only adapter、五类/三 locale 合同和 additive migration draft evidence。`AI-MIG-002/003` 未实施。

仍未完成的关键 runtime ID：上述所有 ID 的生产接线仍未完成；此外 `AI-GEN-003` 只有状态表、没有异步 worker，`AI-DOC-002/003/005/012/013` 没有编辑/免费重写/recovery/outbox，`AI-ENT-001`, `AI-BILL-001-005`, voice/content/notification/data-control 全域仍按原映射为缺失或部分。第 5、6 节的 E/R/P/M/C 表继续表示**当前生产运行时**，不会因未启用的 shadow 源码而改成已交付。

## 3. 审计范围与证据

### 3.1 仓库与部署

| 项目 | 只读事实 |
|---|---|
| AI worktree | `apps/careslink-ai`, branch `codex/careslink-ai-documents-v1-auth-gate` |
| 审计 HEAD | `f0d994dfc66d7373bbadbe106b3147d847c6c8d3` |
| Web stack | Next.js 16.2.9, React 19.2.4, TypeScript, Supabase SSR, OpenAI Responses API, Vercel |
| Native App | 未发现 Expo、React Native、Swift/Kotlin 或原生 App package |
| Production | `ai.careslink.com.au`; Vercel deployment `dpl_3MfSBoV6gx6SHdy5S1YenmLQ1XTH`, exact SHA 与审计 HEAD 一致 |
| Supabase | project `adocsnwnslxhxcjgbyee`; migrations 已到 `20260804223000` |
| 当前验证 | 79 test files / 546 tests passed; `tsc --noEmit`, ESLint, Next build passed |

### 3.2 当前真实能力

| 领域 | 当前实现 | 主要证据 |
|---|---|---|
| Auth | Email/password、Google OAuth、PKCE callback、server cookie、trusted `app_metadata.role` | `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`, `src/lib/referral-workspace-server-auth.ts` |
| AI Note | 仅 NDIS Case Note；结构化输入或浏览器内粘贴；English draft + zh-Hans review | `src/app/template-companion/ndis-case-note/`, `src/lib/openai-ndis-case-note.ts` |
| Privacy | 浏览器 findings/span、用户处理与两项确认、服务端 minimum facts / identifier validation | `src/lib/ndis-case-note-browser-privacy.ts`, `src/lib/ndis-case-note-companion.ts` |
| Generation | 同步 HTTP request；provider auth 后校验、credit reserve、quota、OpenAI、claim、credit commit/release | `src/app/api/template-companion/ndis-case-note/route.ts` |
| Documents | `generated_material_drafts` 中保存一份当前 JSON；owner SELECT/DELETE；无 revision | `src/lib/generated-material-draft-store.ts`, migration `20260804143000` |
| Credits | free plan、每月 3 credits、1 次 NDIS generate 消耗 1；append-only grant/reserve/commit/release | `src/lib/account-credit-store.ts`, migration `20260804190000` |
| Content | Core 主站静态文章/资源；AI 无 canonical Content API、Library、Guide progress 或 Daily Brief | Core static content + AI route inventory |
| Notifications | 无 app-owned push、in-app inbox、digest scheduler 或邮件发送 | package、route、migration inventory |
| Billing | 无 Stripe、Apple IAP、Google Play Billing、receipt/webhook 或 entitlement normalization | package、route、migration inventory |
| Automation | OpenAI 同步调用；无 queue/worker/cron/webhook reconciliation | `src/lib/openai-ndis-case-note.ts`, route inventory |

### 3.3 生产数据轮廓（仅聚合）

只读核对时：6 个 active auth users、4 条 `account_entitlements`、10 条 `credit_ledger`、4 条 `generated_material_drafts`、0 份已保存 NDIS draft、1 条已过期 claim、69 条 companion events、5 条 provider drafts。该数据量较小，但已经是真实历史，迁移不能覆盖、删除或重算。

近 7 天 Vercel runtime logs 有 12 次 `Invalid Refresh Token: Refresh Token Not Found`，涉及 2 个用户和 auth/companion/referral 路由。它是 V1 前需单独关闭的 session recovery 风险，不是本审计阶段的代码变更授权。

## 4. 状态图例

- `E` = 已存在：当前实现和该要求在当前范围内基本一致。
- `R` = 可复用：能力不是 V1 实现，但底层 primitive 可直接复用。
- `P` = 部分存在：只覆盖部分平台、Note type、locale、状态或安全合同。
- `M` = 缺失：没有可运行实现或持久化合同。
- `C` = 冲突：现有实现与已批准 V1 产品真相不一致，必须迁移或隔离。

映射汇总：App 侧 `E 0 / R 10 / P 20 / M 91 / C 2`；AI 侧
`E 4 / R 4 / P 32 / M 80 / C 4`。这反映的是目标 V1 完成度，而不是对现有
NDIS pilot 质量的评分。

## 5. CaresLink App V1 需求映射（123 IDs）

当前没有原生 App，因此这里的 `R` / `P` 只表示 Web/backend primitive 可供未来 App 使用，不表示 App 功能已交付。

| 领域 | ID 状态 | 代码事实与差距 |
|---|---|---|
| IA / Today | `APP-IA-001 M`; `APP-IA-002 M`; `APP-IA-003 M`; `APP-IA-004 M`; `APP-IA-005 R`; `APP-IA-006 M`; `APP-TDY-001 M` | 无原生导航、Today 或 App Links；Core public 与 AI private auth boundary 可复用。 |
| Auth | `APP-AUTH-001 R`; `APP-AUTH-002 P`; `APP-AUTH-003 M`; `APP-AUTH-004 M`; `APP-AUTH-005 M`; `APP-AUTH-006 P`; `APP-AUTH-007 M`; `APP-AUTH-008 R` | 同一 Supabase UUID、Email/Google 和 auth-first route 可复用；缺 Microsoft/Apple、identity linking、SecureStore、device registry、App Lock；Web 有密码恢复。 |
| Note catalog | `APP-NOTE-001 M`; `APP-NOTE-002 M`; `APP-NOTE-003 M`; `APP-NOTE-004 P`; `APP-NOTE-005 M` | 只有 NDIS Case Note；legacy handover checklist 不是 canonical Handover Note。 |
| Note input/privacy | `APP-NOTE-010 P`; `APP-NOTE-011 M`; `APP-NOTE-012 M`; `APP-NOTE-013 M`; `APP-NOTE-014 P`; `APP-NOTE-015 P`; `APP-NOTE-016 M` | NDIS Web 支持结构化/粘贴、minimum facts、Privacy Review；无 voice/transcript/audio lifecycle、服务端 quote。 |
| Note generation/edit | `APP-NOTE-017 P`; `APP-NOTE-018 P`; `APP-NOTE-019 P`; `APP-NOTE-020 M`; `APP-NOTE-021 M`; `APP-NOTE-022 M`; `APP-NOTE-023 P`; `APP-NOTE-024 P`; `APP-NOTE-025 P`; `APP-NOTE-026 M` | 有同步 reserve/generate/commit、双语结果、安全边界、claim/save/copy；无 async job、编辑器、revision/self-review、完整 export 或 snapshot contract。 |
| Documents | `APP-DOC-001 P`; `APP-DOC-002 M`; `APP-DOC-003 M`; `APP-DOC-004 M`; `APP-DOC-005 M`; `APP-DOC-006 M`; `APP-DOC-007 M`; `APP-DOC-008 M`; `APP-DOC-009 R`; `APP-DOC-010 M` | 现有 saved material owner-only 且 telemetry 最小化；没有 canonical document/version/status/export history。 |
| Sync | `APP-SYNC-001 M`; `APP-SYNC-002 R`; `APP-SYNC-003 M`; `APP-SYNC-004 M`; `APP-SYNC-005 M`; `APP-SYNC-006 M`; `APP-SYNC-007 M`; `APP-SYNC-008 M`; `APP-SYNC-009 M`; `APP-SYNC-010 M` | generation idempotency 可复用；无 canonical revision、mutation contract、draft-first、checkpoint、outbox、conflict 或 job recovery。 |
| Offline / compatibility | `APP-OFF-001 M`; `APP-OFF-002 M`; `APP-OFF-003 M`; `APP-COMPAT-001 M` | 无 App local encrypted DB、offline mode、client version contract。 |
| Library foundation | `APP-LIB-001 R`; `APP-LIB-002 R`; `APP-LIB-003 M`; `APP-LIB-004 M`; `APP-LIB-005 M`; `APP-LIB-006 M`; `APP-ACT-001 M`; `APP-ACT-002 M`; `APP-LIB-007 R`; `APP-LIB-008 R` | Core 有公开三语内容与 canonical Web URL，可作为种子；无 shared Content API、用户 state、actions、offline 或 Explain。 |
| Updates / Guides / Brief | `APP-LIB-009 M`; `APP-LIB-010 M`; `APP-LIB-011 M`; `APP-LIB-012 M`; `APP-LIB-013 M`; `APP-LIB-014 M`; `APP-HELP-001 M` | 没有独立 schema、progress、candidate service、suppression 或 Help taxonomy。 |
| Points | `APP-PTS-001 C`; `APP-PTS-002 M`; `APP-PTS-003 R`; `APP-PTS-004 P`; `APP-PTS-005 M` | 原子 credit reserve/commit/release 可复用；月度 3 credits、无 lots/rates/unified entitlement 与批准 Points 真相冲突。 |
| Payments | `APP-PAY-001 M`; `APP-PAY-002 M`; `APP-PAY-003 M`; `APP-PAY-004 M`; `APP-PAY-005 M` | 无 IAP、Play Billing、receipt、refund/reconciliation 或付费用量 UI。 |
| Notifications | `APP-NTF-001 M`; `APP-NTF-002 M`; `APP-NTF-003 M`; `APP-NTF-004 M`; `APP-NTF-005 M`; `APP-NTF-006 M`; `APP-NTF-007 M`; `APP-NTF-008 M`; `APP-NTF-009 M`; `APP-NTF-010 M`; `APP-NTF-011 M` | 无 push token、preference、outbox/inbox、scheduler、deep link 或 fatigue telemetry。 |
| Search / preferences / support | `APP-SRCH-001 M`; `APP-PREF-001 M`; `APP-SUP-001 M`; `APP-SUP-002 M` | 无统一搜索、个性化偏好或安全 support workflow。 |
| Security / privacy NFR | `APP-NFR-001 P`; `APP-NFR-002 P`; `APP-NFR-003 M`; `APP-NFR-004 P` | Web 的关键 draft/ledger owner policy、server-only keys 和 NDIS metadata telemetry 可复用；不是“每张目标私有表”，也无 App local/完整 PIA governance。 |
| UX / locale / reliability NFR | `APP-NFR-005 P`; `APP-NFR-006 P`; `APP-NFR-007 C`; `APP-NFR-008 M`; `APP-NFR-009 M`; `APP-NFR-010 M`; `APP-NFR-011 M`; `APP-NFR-012 P` | Web 有部分 keyboard/responsive/status tests；仅 `en`/`zh-Hans`，无 native performance/crash/compat SLA；事件 schema 尚未跨端统一。 |
| Data controls | `APP-DATA-001 M`; `APP-DATA-002 M`; `APP-DATA-003 M` | 只有单份 saved draft 删除；无账号导出、账号删除 workflow 或商店订阅说明。 |
| Store readiness | `APP-STORE-001 M`; `APP-STORE-002 M`; `APP-STORE-003 M`; `APP-STORE-004 M`; `APP-STORE-005 M` | 无 iOS/Android binary、签名、store declarations 或 closed testing。 |

## 6. CaresLink AI V1 需求映射（124 IDs）

| 领域 | ID 状态 | 代码事实与差距 |
|---|---|---|
| Foundation | `AI-FND-001 M`; `AI-FND-002 M` | 没有共享 Product API / canonical cross-platform state；Next route 与 legacy tables 是当前实现。 |
| Auth | `AI-AUTH-001 P`; `AI-AUTH-002 P`; `AI-AUTH-003 E`; `AI-AUTH-004 M`; `AI-AUTH-005 P` | Email/Google/Web cookie/PKCE 和 NDIS auth-before-body 已存在；无 Microsoft/Apple、App token、device registry、高风险 reauth。 |
| Permissions | `AI-PERM-001 P`; `AI-PERM-002 P` | entitlements/ledger/drafts 有 owner policy，admin 页面为 aggregate/metadata；不是所有 legacy/target private resource 的统一矩阵。 |
| Note types | `AI-TYPE-001 M`; `AI-TYPE-002 M`; `AI-TYPE-003 M`; `AI-TYPE-004 P`; `AI-TYPE-005 M` | 仅 NDIS 有 schema、extractor、validator 和 golden tests。 |
| Input / locale | `AI-IN-001 P`; `AI-IN-002 C`; `AI-IN-003 P` | NDIS 有结构化/粘贴与双端 validation；没有五类合同与 `zh-Hant`。 |
| Privacy | `AI-PRIV-001 E`; `AI-PRIV-002 E`; `AI-PRIV-003 M`; `AI-PRIV-004 P` | 当前 NDIS browser findings 与 server fail-closed 已实现；没有持久化、hash-bound、expiry-bound privacy proof；确认未形成目标审计 record。 |
| Voice | `AI-VOICE-001 M`; `AI-VOICE-002 M`; `AI-VOICE-003 M`; `AI-VOICE-004 M`; `AI-VOICE-005 M`; `AI-VOICE-006 M` | 无 transcription service、audio storage/TTL 或 transcript workflow。 |
| Generation | `AI-GEN-001 M`; `AI-GEN-002 R`; `AI-GEN-003 M`; `AI-GEN-004 R`; `AI-GEN-005 P`; `AI-GEN-006 P`; `AI-GEN-007 P`; `AI-GEN-008 P`; `AI-GEN-009 P` | credit reservation、idempotency、claim persistence、structured NDIS output 和 safety tests 可复用；无 quote、Points lots、async job、zh-Hant、完整 version governance。 |
| Documents core | `AI-DOC-001 M`; `AI-DOC-002 M`; `AI-DOC-003 M`; `AI-DOC-004 M`; `AI-DOC-005 P`; `AI-DOC-006 P`; `AI-DOC-007 M`; `AI-DOC-008 M`; `AI-DOC-009 M`; `AI-DOC-010 M`; `AI-DOC-011 P`; `AI-DOC-012 M`; `AI-DOC-013 M` | owner-only saved output 与 draft wording 边界存在；没有 document/revision/editor/checkpoint/tombstone/export/recovery/outbox。 |
| Documents export | `AI-DOC-014 M`; `AI-DOC-015 M`; `AI-DOC-016 M`; `AI-DOC-017 M`; `AI-DOC-018 M` | 无 batch/export artifact/renderer/event 历史。 |
| Points | `AI-PTS-001 C`; `AI-PTS-002 M`; `AI-PTS-003 M`; `AI-PTS-004 C`; `AI-PTS-005 M`; `AI-PTS-006 R`; `AI-PTS-007 P` | current credit ledger 有幂等 reserve/terminal 与 append-only primitive，但无 wallet/lots/expire/revoke/adjust/rate catalog，且旧单位与周期冲突。 |
| Entitlement / Billing | `AI-ENT-001 M`; `AI-BILL-001 M`; `AI-BILL-002 M`; `AI-BILL-003 M`; `AI-BILL-004 M`; `AI-BILL-005 M` | 无支付 provider、receipt、webhook、restore、refund 或 reconciliation。 |
| Cost | `AI-COST-001 M`; `AI-COST-002 P`; `AI-COST-003 P`; `AI-COST-004 M`; `AI-COST-005 P`; `AI-COST-006 P`; `AI-COST-007 M` | NDIS 有 input/output cap、token metadata、account/IP quota 和 safety eval；无 p95 costing、budget alert/kill switch、service economics dashboard。 |
| Content / Library | `AI-LIB-001 M`; `AI-LIB-002 M`; `AI-LIB-003 R`; `AI-LIB-004 M`; `AI-LIB-005 M` | Core 静态内容的 source/checked-date pattern 可复用；没有 canonical Content API、logged-in state 或 Explain。 |
| Actions / reminders | `AI-ACT-001 M`; `AI-REM-001 M` | 无 personal checklist/reminder service。 |
| Notification base | `AI-NTF-001 M`; `AI-NTF-002 M`; `AI-CONTENT-001 M` | 无 preference、safe payload、correction/withdrawal automation。 |
| Updates / Guides / Brief | `AI-UPDATE-001 M`; `AI-GUIDE-001 M`; `AI-GUIDE-002 M`; `AI-GUIDE-003 M`; `AI-BRIEF-001 M`; `AI-NTF-003 M`; `AI-NTF-004 M`; `AI-NTF-005 M`; `AI-NTF-006 M`; `AI-NTF-007 M`; `AI-HELP-001 M` | 无 schema、editorial state、progress、brief candidate/schedule/frequency/inbox/fatigue 或 Help domain。 |
| Data controls | `AI-DATA-001 M`; `AI-DATA-002 P`; `AI-DATA-003 M`; `AI-DATA-004 M`; `AI-DATA-005 P`; `AI-DATA-006 P` | owner 可删除单份 saved draft；metadata events 存在。无跨端 export/delete/legal hold workflow；审计 schema 未统一。 |
| Security / privacy NFR | `AI-NFR-001 P`; `AI-NFR-002 P`; `AI-NFR-003 P` | server-only keys、关键 RLS、privacy notice 和 NDIS safety boundaries 已有；完整目标表、PIA/data map/subprocessor/NDB 和五类 safety 未完成。 |
| Reliability / UX NFR | `AI-NFR-004 M`; `AI-NFR-005 M`; `AI-NFR-006 P`; `AI-NFR-007 P`; `AI-NFR-008 C`; `AI-NFR-009 P`; `AI-NFR-010 M` | Web responsive/build tests 和 metadata telemetry 存在；无 SLA/PITR drill/跨端 perf、zh-Hant、统一 schema/API version/min-client。 |
| Publishing | `AI-PUB-001 M`; `AI-PUB-002 M`; `AI-PUB-003 M`; `AI-PUB-004 P`; `AI-PUB-005 M` | 模型/schema tests 与 server env override 部分存在；无 content workflow、editor/approver 分权、translation governance、formal prompt registry/kill switch。 |
| Migration | `AI-MIG-001 E`; `AI-MIG-002 M`; `AI-MIG-003 M`; `AI-MIG-004 M`; `AI-MIG-005 M`; `AI-MIG-006 M`; `AI-MIG-007 M`; `AI-MIG-008 M` | 本文件完成只读 audit；其余仅有下述方案，尚未实施。 |

## 7. 现有数据与信任边界

### 7.1 当前表与 RLS

当前 public schema 中包括 `provider_drafts`, `generated_material_drafts`, `generated_material_events`, `access_requests`, `access_codes`, `ai_usage_events`, `outreach_records`, NDIS claim/quota/events、`account_entitlements`, `credit_ledger`, pilot cohort 和 conversion events。所有已核对表启用 RLS，但并非所有目标资源都已存在，也不应把“RLS enabled”误写成完整权限证明。

- `account_entitlements`: authenticated 仅 owner SELECT；client 无 INSERT/UPDATE/DELETE。
- `credit_ledger`: authenticated 仅 owner SELECT；写入通过 service-role RPC。
- `generated_material_drafts`: authenticated 仅 owner SELECT/DELETE；服务端保存。
- `template_companion_events`: service-role only，metadata-only。
- `public_conversion_events`: anon 可 INSERT，是 public marketing analytics 特例，不得承载 private product data。

### 7.2 当前 trust boundaries

1. Browser：保存 session cookie、paste 原文仅 React state；客户端检查不是最终授权。
2. Next server：必须先校验 Supabase session 与 trusted role，再读取 AI body、扣额度或调用 OpenAI。
3. Supabase anon/authenticated：只允许显式 RLS owner reads/deletes；不能写 ledger。
4. Supabase service role：server-only，可调用 claims/quota/ledger RPC；它是最高风险应用边界。
5. OpenAI：server-only API key；当前 NDIS Responses request 使用 `store:false`，但这不等于承诺 Zero Data Retention。
6. Admin/support：现有 UI 只展示 aggregate/metadata，不应新增通用正文读取能力。

## 8. 可回滚迁移方案

### Phase 0 - 合同和快照（无生产行为变化）

1. 冻结 V1 shared contracts：locale、roles、errors、Note catalog、document/revision、Points quote/ledger、content/action。
2. 对 legacy 表做 metadata snapshot：row counts、ID set hash、ledger units by event/period、feature/status/locale counts；不导出正文。
3. 建立 migration batch manifest，记录代码 SHA、migration version、source count/hash、执行者、开始/完成/rollback 状态。
4. 新功能全部置于 server feature flags 后，默认 off；不得以客户端 flag 作为授权。

### Phase 1 - Additive target schema

新增而非原地改名：

- `ai_note_types`, `ai_note_schema_versions`
- `ai_documents`, `ai_document_revisions`, `ai_document_checkpoints`, `ai_self_reviews`, `ai_document_tombstones`
- `privacy_reviews`（仅 hash、finding type/decision/revision，不存不必要 raw excerpt）
- `generation_jobs`, `generation_attempts`
- `point_wallets`, `point_lots`, `point_reservations`, `point_reservation_allocations`, `point_ledger_entries`, `point_rate_catalog`
- `account_entitlement_grants`, payment provider receipt/event tables（Billing slice 前保持未启用）
- `export_jobs`, `export_events`
- 后续 content/action/notification target tables。

每张私有表先写 RLS/grants/negative tests，再允许应用代码访问。Migration 必须 additive；rollback 是关闭新 read/write path并保留新表供审计，不执行 destructive down migration。

### Phase 2 - Legacy credit -> Points

1. 将 `account_entitlements` / `credit_ledger` 标记为 legacy source，禁止把表名直接改成 Points。
2. 为每个历史 event 建立不可变 migration mapping；旧账本保持只读，不 UPDATE/DELETE。
3. 创建 approved migration grant lot，记录 source=`legacy_credit_migration`、batch、原余额和换算版本。
4. V1 的一次性 300 welcome Points 需要按 UUID 做“是否已授予”去重；不得每周期重发。
5. 旧余额换算规则仍需负责人批准。最低原则：不能降低用户在 cutover 前的实际可购买能力，也不能把 1 legacy credit 静默等同于任意 Points 数量。
6. shadow reconciliation 比较 legacy 可用量、新 wallet balance、reservation/terminal totals；100% 对齐后才切 read path。
7. cutover 后只有 Points 是产品真相；legacy access-code/quota 仅保留在 Web legacy Profile/Referral 域，不能向 App wallet 授权。

### Phase 3 - Legacy NDIS output -> canonical documents

1. 每个 `generated_material_drafts.feature='ndis_case_note'` 建立一个 `ai_document` 与初始 revision，保留 legacy ID、created time、model/token metadata、status 和内容 hash。
2. 建立 `legacy_document_migration_items` 映射，幂等执行；不删除旧 row。
3. cutover window 内使用 outbox/backfill watermark 处理并发新写，避免漏迁。
4. 其余 profile/share/referral/handover-checklist material 保持 legacy，不自动冒充五类 Note。
5. 当前聚合观察为 0 个已保存 NDIS draft，但迁移仍必须处理 cutover 前新增数据。

### Phase 4 - 五类 catalog 与 locale

1. 为五类 Note 分别发布 versioned input/minimum/output/privacy/safety schema 和 golden set。
2. 先适配现有 NDIS；其余四类逐个上线，不以一个通用 prompt 替代 type-specific rules。
3. locale 列和合同 additive 支持 `en`, `zh-Hans`, `zh-Hant`；已有 `zh-Hans` 不重写。
4. 缺译文必须返回明确 `fallback_locale` / `translation_status`；不得静默把繁中请求显示为简中。

### Phase 5 - Entitlements、Billing、Content 与 Notifications

只有 Points/documents 稳定后才接 Stripe / Apple / Google。先建立统一 entitlement 与 receipt idempotency，再接 UI。Content API、Guide progress、Daily Brief 和通知单独分 slice，不能从 Note 正文做推荐。

### Reconciliation / rollback gate

- source count、target count、migration item count一致；重复执行不新增 row。
- document content hash、owner UUID、created timestamp 和 legacy mapping一致。
- ledger grant/reserve/commit/release总量与 wallet/lots不出现负数、双扣或丢失。
- owner A 无法读取、修改、删除或推断 owner B 的 target resource。
- rollback 关闭新 flags 后，旧 Web 路径仍读取旧表；target rows保留、禁止 destructive cleanup。

## 9. Shared contracts / OpenAPI 优先顺序

1. **Identity contract**：UUID、trusted roles、session/device revocation、owner/support/admin边界。
2. **Protocol foundation**：`/v1`, locale、time、error envelope、idempotency、correlation、pagination、version headers。
3. **Note catalog**：五类 stable code、schema version、minimum facts、privacy/safety version。
4. **Document contract**：canonical ID、revision/base revision、checkpoint、save ack、409 conflict、tombstone。
5. **Points contract**：service/rate catalog、quote expiry、lot allocation、reserve/commit/release、ledger response。
6. **Generation / transcription jobs**：queued/running/succeeded/failed/cancelled、retry/cancel/restore。
7. **Export contract**：revision-bound DOCX/PDF/TXT/Copy、artifact TTL、profile、event history。
8. **Content / action contract**：content revision/status/locale/source、Save/Follow/Guide progress/checklist/reminder/Daily Brief。
9. **Notification contract**：preferences、safe payload、inbox、dedupe/frequency/quiet hours。
10. **Billing / data controls**：provider receipts/events、entitlement grants、refund、reconciliation、export/delete workflow。

旧 Next handlers 在 V1 过渡期应由 adapter 调用共享 domain service；不要让 App 直接依赖 legacy route shape。

## 10. Portal 与 App 共用合同

| 能力 | 共用 canonical contract | 客户端特有责任 |
|---|---|---|
| Draft recovery | document ID、revision、checkpoint、save ack、idempotent mutation | Portal 短期受控 recovery buffer；App encrypted local DB/outbox |
| Revision | base revision、409 conflict、diff metadata、restore-as-new-revision | Portal/App 使用同一 conflict policy，不做 last-write-wins |
| Generation | quote、reservation、job、result revision、terminal settlement | UI 可不同，但重试必须复用同一 key/job |
| Export | revision、format、profile、template version、artifact TTL | Portal download；App Share Sheet/Save to Files |
| Guides/Updates | content stable ID/revision/locale/status/source | Core SEO HTML；Portal/App 登录 state、offline cache |
| Daily Brief | server candidate IDs/reasons/rank/revision | 各端展示最多 3 项；不得把 Note 正文传给 candidate service |

## 11. 风险、依赖与待批准项

### P0 / release blockers before V1 implementation

1. 已有 contract-only TypeScript/OpenAPI 草案，但没有可发布 shared package、served Product API 或 generated Web/App client，分叉风险尚未关闭。
2. 旧 credit 与新 Points 语义冲突，不能并行显示两套余额。
3. Shadow revision model 尚未接入数据库或 route；`generated_material_drafts` 仍不是 canonical revision model，无法承诺跨端恢复和 export snapshot。
4. Shadow contract 支持 `zh-Hant`，但现有 runtime locale/UI/output 仍缺失；不能静默 fallback。
5. 生产 refresh-token error cluster 已在 2026-09-04 获得本地 source 修复与可复现负向测试：Next 16 Proxy 会传播刷新/删除 Cookie 和 Supabase 防缓存头，真实 `@supabase/ssr` 配合本地 fake Auth 的 `refresh_token_not_found` 路径已通过；完整 234 文件 / 3,351 测试及 64/64 页面 production build 通过并识别 Proxy。但尚无 Vercel Preview、真实 Supabase Auth 或 Production recovery 证据，因此受保护、可销毁 Preview E2E 仍是发布阻断。
6. service-role 写路径较多；target domain必须缩小到 RPC/owner-safe API，不应复制 legacy pattern。

### 负责人需再次批准的生产决策

- legacy credit余额到 Points 的确切换算与 existing user 的 300 welcome eligibility。
- point lot expiry、subscription reset、top-up expiry、refund debt/negative balance政策。
- NDIS legacy draft的迁移状态映射，以及非 NDIS legacy materials是否永不进入 Documents。
- Portal recovery buffer 的加密、TTL和PIA结论；App offline mode容量/TTL。
- Microsoft/Apple linking与 Apple relay email策略。
- cloud STT vendor、最大时长、retention和Points费率。
- Incident Factual Draft 的独立安全 gate与发布 owner。
- content canonical editor/source、Update审批与撤回 SLA。
- Pro/annual/top-up product IDs、GST、App Store tiers和退款规则。
- account deletion retention例外、tombstone物理清理TTL、PITR/RPO/RTO。

## 12. 推荐第一个最小安全 slice

### Slice 0: Contract Foundation + NDIS Canonical Draft（Preview only）

当前进度：步骤 1 的 contract vocabulary、步骤 2 的 schema/RPC 文件、步骤 3 的 NDIS save/delete guarded adapter、步骤 4 的 domain/static deny tests、隔离数据库 projection/reconciliation 门槛及受保护 App Preview 均已完成。提交前复审又补强了 source-version/generation mutation identity、锁后 source CAS、A→B→A 回退，以及 legacy delete 后的 source-bound owner-read deny、严格幂等且 generation-bound 的 best-effort tombstone、pre-identity repair、PURGED terminal preservation 与 missed-cleanup reconciliation；追加 migrations `20260810072017`、`20260810072952`、`20260810073519`、`20260810073929`、`20260810080048` 已只在保留的空隔离 branch 上执行。真实合成旧行完成回填、无法识别的 orphan 被 tombstone/owner-hidden、模拟 PURGED row 保持终态、模拟 tombstone miss 以 `SOURCE_DELETE_CLEANUP_PENDING` 可对账且正文仍 owner-hidden、same-ID/new-`created_at` ABA fixture 互不冲突，随后 fixtures 全部清零；更新后的两份 SQL assertions 均在事务回滚中通过。旧受保护 Preview 部署早于这批补强，因此在申请 Production schema 或 canary 批准前仍需新的 route-level protected Preview。

这组 forward registry 只证明了空、flags-off 隔离 branch 的路径，不是带历史数据环境的 online-atomic upgrade：`20260810072017` 与 `20260810072952` 分事务提交，且没有快照就无法证明恢复已投影 PURGED row 原先的 `updated_at`。Production migration 申请必须包含 target 零行预检、flags off、数据库快照、维护窗口隔离与 apply 后 RLS/hash/count reconciliation；若发现任何 target row，必须停止并另行审核 transactional/squashed migration 与 timestamp restoration manifest。

范围：

1. 建立 shared TypeScript contracts + OpenAPI：identity、locale/error/idempotency、五类 catalog只发布 metadata，NDIS发布完整 schema。
2. Additive 建立 canonical document/revision/checkpoint/save-ack 与 target Points rate/quote/reservation tables/RPC，全部 feature flag 默认 off。
3. 将现有 NDIS privacy/generation adapter接入 target contract；生产旧 flow不变，Preview用 synthetic data dual-write/shadow-read。
4. 加跨 owner、并发 revision、idempotency、failed release、locale、legacy reconciliation tests。
5. 交付 migration dry-run、rollback和metadata-only reconciliation report；再次申请生产 migration批准。

明确不含：四类新 Note UI、voice、Billing、Library、notifications、native App screens、legacy Profile/Referral重构。

### Slice 0 exit criteria

- OpenAPI contract tests在 Web adapter和未来 App SDK fixture上通过。
- owner/RLS negative tests 100%通过；service role不进入客户端。
- synthetic NDIS从first input到revision/save ack可跨新session恢复。
- duplicate mutation/generation key不产生重复document/revision/reservation/commit。
- legacy与target metadata reconciliation为0差异；关闭flag可立即回到旧flow。
- 未经新的明确批准，不执行共享Supabase migration或Production deploy。

## 13. 本批执行边界与保持不变事项

- 已新增隔离的 V1 shadow 源码、合同、测试和 Production-unapplied migration 文件，并只修改经审计的 NDIS Save 与 Delete route；prompt、model 与 package dependency 未修改。
- migrations 只曾在 `with_data=false` 隔离分支应用、重置和重放；所有 synthetic fixture 已清零。Production 数据库未连接、未写入，Production migrations 仍停在原基线。
- 受保护 Vercel Preview、Preview-only branch 配置和 activation flags 曾用于门槛验证；五个测试 deployment 与六个 activation/test 变量随后删除。Production deployment、alias 与环境配置未改变。
- quota、legacy credit/ledger、Billing、entitlement 与 Points runtime 均未修改或接线；没有模型调用。
- 最终保留的隔离 branch 只作为空 Preview schema baseline。提交前复审的追加 migrations 已 forward-apply，并以 registry versions `20260810072017`、`20260810072952`、`20260810073519`、`20260810073929`、`20260810080048` 与本地文件对齐；pre-identity/PURGED upgrade、pending-delete reconciliation、generation tombstone/ABA 与更新后的 rollback assertions 已通过，数据仍为零。旧 protected Preview deployment 仍不能作为新 route bundle 的证据，重新启用 flags 前必须再跑一次受保护 Preview。
- 未创建 commit、push 或 Production deploy。
