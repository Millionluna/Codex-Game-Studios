# Communication Note Preview live custody / caller resolver M1j

## 状态与结论

M1j 新增的是第五个 `RUNNER_TERMINAL_PERSISTENCE` 调用方的
**server-only、source-only、TestOnly production-shaped contract**。它把既有的
签名终态、信任组合、密钥保管描述和 PostgreSQL 终态 RPC 连接成一条可测试的
运行时边界，但没有接入真实 KMS/HSM、控制平面、数据库凭据服务或产品运行时。
因此，文件名中的 “live” 表示本批次为未来 live 接线定义契约，不表示已有
live 或 approved resolver。

| 边界 | M1j 结果 |
|---|---|
| 实现 | `src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts` |
| 聚焦测试 | `src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.test.ts` |
| 运行时边界测试 | `src/lib/v1/runtime-boundary.test.ts` |
| policy version | `binding.communication.openai.synthetic-preview.2026-08-30.m1j.v1` |
| policy digest | `6e33f6a6c061f539b75808afc27abfe6f33fedfcf28de5f7b2a5fdeed5faee04` |
| readiness | `CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_READY === false` |
| policy status | `SOURCE_CONTRACT_ONLY_NO_APPROVED_TARGET_OR_RESOLVERS` |
| approved exports | target、custody resolver、caller credential resolver、runtime port 四项均为 `undefined` |
| public factory | `createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort(...)` 无条件 fail closed |
| 唯一可构造路径 | 显式 `createTestOnly...` factory、对象身份登记和精确 capability，仅供测试/支持代码 |
| 数据库变更 | 无 migration、无角色/ACL/RPC 变更、无 schema 写入 |
| 配置与发布 | 无环境变量、无 SDK/网络接线、无部署、无 Production 变更 |
| 外部执行 | 无付费 Preview、无 provider/model 调用、无真实护理数据 |

M1j 不改变 M1g-i 的 39 个 migration、manifest、preflight 或 coordinator pin，
也不继承已删除 Preview 的任何凭据。现有第五个 `NOLOGIN` caller shell 和精确
三参数终态 RPC 已足以表达本批次边界，所以本批次不需要新 migration。

Successor note (M1k, 2026-08-30): M1k adds an isolated TestOnly PostgreSQL
broker plus an injected server-only resolver for this fifth caller. A fresh
disposable no-TCP PostgreSQL 16.15 run proved durable digest fencing,
tombstone-plus-`NOLOGIN` before destroy, response-loss cleanup, concurrent
acquire/revoke, rejected late reconnect and independent zero role/session/
membership residue. It adds zero Supabase
migrations, so the 39-entry manifest and M1g-i Hosted attribution remain
unchanged. It is not PostgreSQL 17, Hosted, TLS, approved secret transport or
product-runtime evidence; readiness remains false and the approved resolver is
undefined. See the
[M1k handoff](communication-note-preview-durable-caller-credential-resolver-m1k.md).

Successor note (M1l, 2026-08-30): M1l adds the formal, additive 40th
migration source for the private durable broker and closes the terminal late-
write window with a shared ACTIVE transaction fence against exclusive
tombstone/finalize. It preserves the exact three-argument terminal RPC, binds
45–90-second digest-derived SCRAM roles to role/OID/PID/backend-start/fixed
application/auth/run/HMAC/expiry, applies `NOLOGIN` at bind, and requires a
250 ms connection-bound cancel/query settlement barrier or permanent driver
quarantine. The current local PostgreSQL 16.15 harness passed six scenarios
with four issued-and-revoked acquisitions and zero runtime role/session/
membership/API-privilege residue. Its cross-database case observed SQLSTATE
`2BP01`, routine `DropRole`, before cleanup and successful finalize/inspect.
Deleted same-revision PostgreSQL 17 Preview r5 then passed 40/40, A01–A18,
pinned-CA terminal and exact cross-database owner-residue gates with zero final
residue. The migration remains Production-unapplied/default-off; no deployment
or product/provider evidence exists, and readiness/approval remain false/absent.
See the
[M1l handoff](communication-note-preview-runtime-credential-broker-m1l.md).

M1j 下文的 `SET LOCAL ROLE`、runtime `NOINHERIT` 与 SET-only caller edge 是该
历史 TestOnly checkpoint 的模型，**已被 M1l supersede，不得作为当前实现描述**。
当前 M1l binding 是
`binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1` /
`cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115`：
runtime 为 `INHERIT=true`，outbound caller edge 为
`ADMIN=false`/`INHERIT=true`/`SET=false`；另有 PostgreSQL 16/17 `CREATEROLE`
自动产生的 inbound inert creator edge（`member=postgres`、superuser grantor、
`ADMIN=true`/`INHERIT=false`/`SET=false`）。客户端事务不发 `SET ROLE`；wrapper 外
`current_user=session_user=runtime`，进入 `SECURITY DEFINER` wrapper 后则是
`current_user=executor`、`session_user=runtime`。Migration 及 acquire/bind/wrapper
还以 cluster-wide `pg_shdepend` 重验 static caller 零 ownership、ACL 仅限当前数据库
generation schema 与 terminal wrapper，并重验列级零权限及 wrapper/inner 的 exact
executor owner、`SECURITY DEFINER`、空 `search_path`、精确 ACL。配套 durable resolver 是
`resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2` /
`e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e`。

M1l 当前本地 PostgreSQL 16.15 harness 的跨数据库 runtime-owned large-object 场景已
全绿：第一次 `DROP ROLE` 精确返回 SQLSTATE `2BP01`、routine `DropRole`，rollback 后
保留 TOMBSTONED/`NOLOGIN`/membership/remote residue；清除唯一 owner dependency 后
finalize 与 inspect 成功并证明零残留。同 revision 的 PostgreSQL 17 Hosted Preview
r5 已独立关闭跨库 empirical gate：精确 large-object ACL/owner dependency、回滚保留与
受控清理全部通过，最终 residue 为零；该 Preview 随后删除。SQL 的
tombstone/`NOLOGIN` 先于 `DROP ROLE`、
`REVOKED` 后于成功删除，仍是独立的 fail-closed 顺序设计。
M1l 原子 pin 集已冻结并通过 53/53 聚焦覆盖：migration
`64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa`；
transactional `2026-08-30.preview-transactional-migrations.7` 40-entry/20-wrapper manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`；ordered
basenames/entries `f9905d27a907045dfd6e7677e54c50af84be06a194535682bcf9dc4859657d4f` /
`7006c0ef8cb62d9596fdd236ffd3357d16338370e9d1437f54a58eb668b4b250`；A03
`0f8192bccf46101103c301fcfd2b00cb818dd6725425a952777f697db8ea8172`；rollback
`2026-08-30.preview-schema-rollback-assertions.5`
manifest `e0b5f30f9a4c33bf04020a4d11453c87a52321b69c6edd74982446b0fadd58fe`；
preflight/coordinator `4447c071fa37ab21f23624a4d3d4d28b2ee9ba2e1ef4c9be969bf9a0481de2f3` /
`570544bf700997a0ba90e06422019c237a01835ba8b75ff70bed5348cdf4bf02`。
这些只是 source-integrity pins；r5 另提供已删除 Preview 的 Hosted/PG17/pinned-CA
证据。readiness 仍为 `false`，且没有 Production 应用、deployment 或产品/provider
证据。

## 解析链与证据对象

下面五类对象都是精确键集、规范化摘要和 fail-closed 校验的一部分。除
TestOnly factory 私有保存的 `query` 闭包外，契约不携带连接串、密码、私钥或
可导出的密钥材料。

### 1. 独立数据库 target 描述

调用方必须先提供经 TestOnly factory 登记的
`VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED` 描述；resolver 不能自行声明
数据库目标。描述必须同时满足：

- `DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW`、`defaultBranch=false`、
  `persistent=false`、`withData=false`、`productionExcluded=true`；
- `ACTIVE_HEALTHY` PostgreSQL 17、数据库名 `postgres`；
- `VERIFY_FULL_PINNED_CA` 和独立的 CA SHA-256；
- Preview ref HMAC、Production ref HMAC、控制平面证据 SHA-256 和 CA SHA-256
  四者互异；
- observation 不在未来且不早于五分钟，expiry 在未来且不超过五分钟；
- `rawCredentialMaterialPresent=false`。

该描述随后以 `databaseTargetDigest` 绑定到 custody request、caller request 和
caller lease，可检测这些对象中的目标描述或回绑漂移；它不能单独证明注入的 query
闭包实际连向同一端点。真实 TLS endpoint 与独立 control-plane target 的绑定仍是
激活阻断。

### 2. custody resolution

custody resolver 收到的请求只含 policy/custody/terminal digest、授权 digest、
run hash、授权失效时间、target digest 和 observation；请求明确声明没有原始凭据
或私钥，也不把可信公钥或 custody snapshot 预先交给 resolver。

返回值必须是 `RESOLVED_CUSTODY_NOT_APPROVED`，并精确回绑 request digest、
observation、expiry、公开 registry candidate、custody snapshot、已认证交付证据
SHA-256 和完整撤销证据 SHA-256。两个证据摘要彼此不同，resolution 生命周期
最多五分钟，且不能越过 owner authorization expiry。返回对象仍会通过既有
M1g custody、trust registry 和 trust composition 校验；只有校验成功后才解析
第五个 caller 的 `identityHmac` 与 `credentialReferenceSha256`。这只是
TestOnly resolved evidence，不是外部 KMS/HSM 已完成真实认证交付或撤销的证明。

### 3. caller credential resolution

caller acquisition request 精确绑定以下事实：

- `RUNNER_TERMINAL_PERSISTENCE`、第五个 caller role、terminal executor role 和
  唯一允许的 `persist_verified_communication_note_preview_runner_terminal` RPC；
- authorization digest、run hash、registry snapshot、custody resolution、
  caller identity HMAC 和 caller credential reference；
- target digest、Preview/Production ref HMAC、控制平面证据、PostgreSQL 17、
  健康状态、数据库名和 pinned CA。

返回 lease 必须是 `TEST_ONLY_EXCLUSIVE_SESSION_LEASE_NOT_APPROVED`，使用形如
`careslink_v1_preview_runner_terminal_runtime_<16 hex>` 的短期 runtime `LOGIN`，
并声明 `ONE_PHYSICAL_SESSION_SINGLE_USE`、`NORMALIZED_ROWS_ONLY`、不可复用且不可
并发。lease 总生命周期最多十分钟，签发时间不能比当前时钟领先，进入数据库前
至少剩余 30 秒，并且 expiry 同时受 target、custody/trust 和 authorization expiry
三个更早上限约束；`revokeBy` 必须等于 expiry。lease reference、session binding、
caller identity、credential reference、target/Production HMAC、CA 和控制平面摘要
也必须互异。

公开 lease descriptor 不含 `query`、密码或 DSN。TestOnly factory 仅在 WeakMap 中
保存同一对象的一次性 query 闭包。只要对象具有 factory provenance 且仍为
`ISSUED`，实现就会在任何剩余 shape/request/time/metadata 校验之前，同步检查并
隔离所有可识别的 lease reference、session binding、runtime role 与 query 函数
身份，同时切换为 `CONSUMED`；即使其他 lease 字段随后失配，也不能在 revoke 等待
期间由另一个 port 用修正版复用这些身份。成功验证 release report 后才标记为
`RELEASED`。同一模块实例内任一已隔离值都不能从另一个 port 再用。这不是跨进程
或数据库侧唯一性证明；真实 broker/数据库仍须提供持久单次消费约束。

### 4. dedicated PostgreSQL session

以下是 M1j 历史 TestOnly `persist` 顺序，已由上述 M1l 继承模型取代：

1. `BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE`；
2. `SET LOCAL statement_timeout = '5s'`、`lock_timeout = '1s'`、
   `idle_in_transaction_session_timeout = '5s'` 和
   `transaction_timeout = '10s'`；
3. 证明 base runtime `LOGIN` 的精确属性、唯一直接 membership、到期时间和
   零 generation/RPC 直接权限；
4. `SET LOCAL ROLE careslink_v1_preview_runner_terminal_caller`；
5. 证明 caller 为无直接向外 membership 的 `NOLOGIN`、无危险属性，只能执行唯一的
   三参数 terminal RPC；同时证明 SECURITY DEFINER executor 为 `NOLOGIN`、无
   superuser/继承/建库/建角色/replication/BYPASSRLS 属性、无向外 membership、
   无任何 active inbound `SET`/`INHERIT` edge，且 generation schema/table/sequence、
   `authenticator`、`anon`、`authenticated` 和 `service_role` 均无扩张权限；
6. 通过既有 signed runtime port 和 PostgreSQL port 执行一次精确 RPC；
7. 再次证明 caller 身份与权限，随后 `COMMIT`；
8. 无论成功或失败，都在事务后证明 `current_user` 已恢复为同一 runtime role。

base、caller 和 reset 检查使用数据库时钟；base/caller 还固定
`pg_backend_pid()`，事务中的两次 caller 检查同时固定
`pg_current_xact_id()`。因此，连接池换连接、事务被替换、角色未局部恢复、RPC
元数据/ACL 漂移或 API 角色获得 `SET`/`EXECUTE` 都会在写入前后 fail closed。
`SET LOCAL` 只在该事务内生效，不能把第五个 caller 留在后续复用的连接上。

### 5. release report

caller credential resolver 的 `revoke` 位于外层 `finally`，包括 acquire
响应丢失、lease 校验失败、数据库失败和成功路径。即使 acquire 没有返回 lease，
请求仍以 acquisition digest 发起幂等清理，并把未知 lease/session/runtime 绑定
明确写成 `null`。

release report 必须是 `TEST_ONLY_RELEASE_REPORTED_NOT_APPROVED`，精确回绑 revoke
request 与 acquisition request。完整 lease 绑定存在时，只接受
`DESTROYED` / `REVOKED`；完全没有返回 lease 绑定时，接受两种且仅两种完整配对：
已按 acquisition digest 找到并清理的 `DESTROYED` / `REVOKED`，或确认未签发的
`NOT_ACQUIRED` / `NOT_ISSUED`。部分、不可读或格式错误的绑定标记为 `INVALID`，仍会
按 acquisition digest 请求清理，但任何 release report 都不能把该次执行变成
成功；任何混合 disposition 同样拒绝。每份可接受报告还必须精确声明
`acquisitionRequestTombstoned=true` 与 `futureIssuanceBlocked=true`，两个字段均纳入
receipt digest；同时要求 `reusable=false`、`rawCredentialMaterialPresent=false`，
且 report 不能来自未来或早于五分钟。rollback、reset、revoke 或 report 校验任一
无法证明清理时，清理失败优先并统一 fail closed。

该 report（包括 tombstone 与 future-issuance 字段）仍是 TestOnly resolver 的自报
回执。上线前真实 broker 必须以跨进程持久状态保证 acquisition digest 的撤销
tombstone 先于任何迟到签发提交生效；还必须由 resolver 之外的独立 control-plane/
database postcheck 证明 session 已销毁、凭据已撤销、临时 runtime `LOGIN` 与
membership 无残留且凭据无法复用。M1j 没有提供这些 live 证明。

## 时钟、授权和事务不确定性

注入时钟必须单调不回退。owner authorization 会在调用 custody resolver 前先验
有效；实现还会在 target 校验后、custody resolver 后、caller resolver 后、进入
数据库前、RPC 前和提交前重复检查时间；数据库内部再使用
`clock_timestamp()` 证明 lease 尚未过期。有效窗口同时受 owner authorization、
target、custody resolution 和 caller lease 中最早的 expiry 限制。

custody/acquire 使用 5 秒 settlement watchdog；事务主路径中的每条数据库操作使用
12 秒 watchdog，为 PostgreSQL 10 秒 transaction timeout 留出 transport 余量；
rollback、reset 与 revoke 各使用独立的 5 秒 watchdog。每次调用都收到新的
AbortSignal，超时会固定
失败、触发 abort，并继续后续清理，绝不重试原操作。这个 JS watchdog 只能保证
调用方有界结束；真实 adapter 仍必须把 signal 绑定到底层 cancel 与独占 session
销毁，TestOnly 接口本身不能证明不合作的 I/O 已停止。

在发送 `BEGIN` 前，transaction outcome 即标记为 `UNCERTAIN`。因此 `BEGIN`
响应丢失与 `COMMIT` 响应丢失都会尝试 `ROLLBACK`、身份 reset 证明和 revoke；
实现不会把响应丢失误报为确定提交或确定未提交。M1j 明确 `automaticRetry=false`，
任何路径都不会自动重放 RPC；数据库 RPC 自身已有的 exact replay / idempotency
语义是另一层约束，不能用来推断不确定事务结果。

错误输出只保留固定的 `FORBIDDEN`、`IDEMPOTENCY_CONFLICT`、
`INVALID_STATE_TRANSITION` 和 `VALIDATION_ERROR` 域错误；其他异常统一为固定
`PRODUCT_API_DISABLED`。resolver、SQL、transport、rollback、reset 和 release 的
原始 message、SQLSTATE、连接信息、credential/key material 都不会穿过边界。

## 测试覆盖与交接验证

聚焦测试覆盖完整成功序列、默认关闭、过期 authorization、Production/default/stale
target、失配/stale/proxy trust、失配/扩张 lease、base/caller/executor 权限漂移、固定
错误与 no retry、rollback/reset/release 清理失败、已签发后 acquire 响应丢失、
TestOnly resolver 状态模型中的迟到 acquire tombstone 拒绝、单调时钟和
resolver 后及进入数据库前的 expiry/remaining-window、所有 resolver/SQL/cleanup
永不 settlement、`BEGIN`/`COMMIT` 响应丢失、normalized rows-only adapter、四维
跨 port 单次消费、invalid-COMPLETE 在 revoke 等待前隔离四维身份、
lease-reference 并发占用、strict release binding、factory/
accessor 扩张拒绝，以及
环境变量/SDK/网络/产品 importer 隔离。
`runtime-boundary.test.ts` 负责把新模块限制在 server-only/TestOnly 支持边界，并
继续保护其对 authority、custody、trust composition、signed runtime port 和
PostgreSQL port 的导入关系。

强化后的聚焦 M1j 与 runtime-boundary 门禁为 2 文件 / 35 测试，相邻回归为
12 文件 / 143 测试，完整门禁为 173 文件 / 2,345 测试；TypeScript、全仓零
warning ESLint、73-file adapter synchronization、`git diff --check` 与 Next.js
16.2.9 Webpack 64/64 页面构建均通过。由于没有 schema/migration 变更，本批次
不需要为 M1j 新跑数据库 apply 或 Advisors，也不能把 M1g-i 已删除 Hosted
Preview 的历史证据归因到 M1j live resolver。

## 激活前仍然阻断

M1j 仅关闭第五个 caller 的 source/runtime shape。以下事项完成并重新审计前，
四个 approved exports 必须保持 `undefined`，readiness 必须保持 `false`：

1. 从 resolver 之外取得并批准独立 control-plane target observation，证明目标是
   健康、无数据、非默认、非持久、非 Production 的 PostgreSQL 17 Preview，并
   独立绑定 Production parent 与 pinned CA；
2. 实现并批准真实 custody resolver：使用不可导出的 KMS/HSM key，提供经过认证
   的 public-key/registry delivery、完整撤销证据和独立复核，而不是 TestOnly
   snapshot 注入；
3. 实现并批准真实 caller credential resolver：按 acquisition digest 幂等签发与
   撤销短期、单会话 runtime `LOGIN`，以 broker/数据库持久状态跨进程防重放，并用
   原子 tombstone/fence 保证撤销先于任何迟到签发提交生效；把 AbortSignal 绑定到
   底层 cancel 和独占 session 销毁；不把 secret/DSN 写入对象、日志或环境变量；
4. 在另一次明确授权的无数据 disposable Preview 上完成端到端 PG17 会话验证，
   并由 resolver 之外的 postcheck 证明 credential、session、runtime role、
   membership 和数据残留均为零；
5. 为其余四个用途
   `AUTHORIZATION_REGISTRATION`、`AUTHORIZATION_REVOCATION`、`DISPATCH` 和
   `RECEIPT_PERSISTENCE` 分别建立同等的 live custody/caller credential 边界；
6. 关闭 M1g-i 仍记录的 native Supabase CLI migration transport 证据缺口，并在
   任何将来 schema 变化后重新生成、审计和验证相关 pins；
7. 另行授权 provider/model transport 与评估、owner/receipt/provider custody、
   人工安全/隐私/产品审查、最终 activation approval、部署和部署后验证。

在这些阻断未关闭前，M1j 不能作为产品可调用入口，不能启用真实 AI 应用流量，
也不能用于 Production 或真实护理数据。
