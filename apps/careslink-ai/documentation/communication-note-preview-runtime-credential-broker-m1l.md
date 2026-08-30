# Communication Note Preview runtime credential broker M1l

## 状态与结论

M1l 把 M1k 的隔离式 TestOnly broker 设计推进为正式、追加式 Supabase
migration source，并让既有 runner-terminal RPC 在同一数据库事务内检查 durable
acquisition fence。当前源码因此有 40 条 migration；第 40 条是
`20260830065750_add_communication_note_preview_runtime_credential_broker.sql`。

这仍不是已上线能力。第 40 条 migration **只存在于源码，尚未应用，默认关闭**；
`CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_READY`
仍为 `false`，approved resolver 仍为 `undefined`。同 revision 已在一次性、无数据、
非默认且非持久的 Supabase PostgreSQL 17 Preview 上完成 Hosted/TLS/pinned-CA gate，
随后删除。M1l 仍没有 Production 应用、部署、provider/model 调用、产品流量或真实护理
数据证据；Hosted gate 执行阶段没有 push、commit 或部署。

| 边界 | M1l 结果 |
|---|---|
| 正式 migration source | `supabase/migrations/20260830065750_add_communication_note_preview_runtime_credential_broker.sql` |
| migration 序号 / SHA-256 | 40 / `64dcb8c57f2c73d3fbd5adc99e3261f8e2e0ddd8e8efcf5cca52c12ca34ba5aa` |
| transactional policy | `2026-08-30.preview-transactional-migrations.7`；40 entries；20 wrappers；manifest `6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d` |
| ordered migration pins | basenames `f9905d27a907045dfd6e7677e54c50af84be06a194535682bcf9dc4859657d4f`；entries `7006c0ef8cb62d9596fdd236ffd3357d16338370e9d1437f54a58eb668b4b250` |
| A03 SHA-256 | `0f8192bccf46101103c301fcfd2b00cb818dd6725425a952777f697db8ea8172` |
| rollback policy / manifest | `2026-08-30.preview-schema-rollback-assertions.5` / `e0b5f30f9a4c33bf04020a4d11453c87a52321b69c6edd74982446b0fadd58fe` |
| preflight version / digest | `preflight.communication.openai.synthetic-preview.2026-08-30.m1l.v1` / `4447c071fa37ab21f23624a4d3d4d28b2ee9ba2e1ef4c9be969bf9a0481de2f3` |
| coordinator version / digest | `coordinator.communication.openai.synthetic-preview.2026-08-30.m1l.v1` / `570544bf700997a0ba90e06422019c237a01835ba8b75ff70bed5348cdf4bf02` |
| broker schema | private `careslink_v1_runtime_broker`，forced RLS、hash/digest-only ledger |
| terminal surface | 保持 `persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)` 三参数入口 |
| runtime binding version | `binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1` |
| runtime binding digest | `cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115` |
| resolver version | `resolver.communication.openai.synthetic-preview.2026-08-30.m1l.v2` |
| resolver digest | `e53114d9d247ffcdb20ed83b4724fa5b8b09eeab31e4f2fc1a868ade13a2f43e` |
| resolver status | `SOURCE_CONTRACT_WITH_UNAPPLIED_DURABLE_BROKER_NOT_APPROVED` |
| readiness / approval | `false` / `undefined` |
| formal local gate | disposable no-TCP private-Unix-socket PostgreSQL 16.15；migration source 直接应用后通过 |
| Hosted gate | 已删除的 disposable PostgreSQL 17 Preview r5；40/40、A01–A18、terminal/cross-database/cleanup/postcheck 全绿 |
| 未有证据 | Production 应用、部署、provider/model、产品流量、真实护理数据、产品 driver 的取消/内存清除语义 |

## Formal migration and Hosted management posture

Migration 开头明确声明 additive、source-only、default-off，并在建 schema 前拒绝不符合
Supabase Hosted 管理姿态的执行者。它要求：

- `current_user` 与 `session_user` 均精确为 `postgres`，数据库精确为 `postgres`；
- PostgreSQL major 仅允许 16 或 17；
- `postgres` 必须是 `NOSUPERUSER`，同时具有 `CREATEROLE` 与 `BYPASSRLS`；
- `postgres` 必须可使用 `pg_signal_backend` 与 `pg_read_all_stats`；
- 既有 caller、executor、三参数 terminal RPC 及所需 hash helper 必须存在；
- broker schema 必须尚不存在，避免覆盖未知状态。

这里的 “Hosted posture” 是 migration guard 所要求的部署前提；r5 已证明同 revision
可在一次性 Supabase PostgreSQL 17 Preview 中满足该姿态，但这不是 Production 部署或
授权。生命周期 API 另外要求管理连接使用精确
`application_name=careslink-preview-runtime-credential-broker-management`，并以五秒
`lock_timeout` fail closed。`acquire`、`bind`、`tombstone`、`finalize` 与 `inspect`
保持 `SECURITY INVOKER` 和空 `search_path`；API 角色无 broker schema、table、sequence、
type 或 lifecycle-function 能力。

## Hashed-only durable broker

`careslink_v1_runtime_broker.acquisitions` 每个 acquisition digest 只保留生命周期与
哈希身份：authorization digest、run ID hash、database-target digest、caller-identity
HMAC、runtime role/name/OID、lease/session/verifier SHA-256、PID、backend start、过期与
tombstone/revocation metadata。表结构没有 raw password、SCRAM verifier、DSN、database
URL 或 connection string 字段，且 `raw_credential_material_present` 永远为 `false`。

状态仍为单向：

`RESERVED -> ISSUED_UNBOUND -> ACTIVE -> TOMBSTONED -> REVOKED`

所有同 digest 的 mutation 使用
`hashtextextended(acquisition_digest, 836492741)` 的 exclusive transaction advisory
lock。runtime role 名称只可由 digest 前 16 个十六进制字符派生；角色以
SCRAM-SHA-256、`CONNECTION LIMIT 1`、危险属性全关和两条用途不同的精确 membership
边签发。outbound runtime-to-terminal-caller 边为 `ADMIN=false`、`INHERIT=true`、
`SET=false`；PostgreSQL 16/17 `CREATEROLE` 建角会自动产生一条 inbound creator 边，
其 `member=postgres`、grantor 为 superuser、`ADMIN=true`、`INHERIT=false`、
`SET=false`，因此不能用于继承或 `SET ROLE`。签发时间窗精确为 45–90 秒。

Migration 在签发前通过 cluster-wide `pg_shdepend` 证明 static terminal caller 没有
ownership dependency；它的 ACL dependency 也必须精确收敛为当前数据库 generation
schema 与三参数 terminal wrapper，其他数据库或对象上的 ACL dependency 一律拒绝。
`acquire`、`bind` 与 terminal wrapper 都会重新验证该静态 caller 证明，并检查 caller
对 generation 关系不存在任何列级 `has_any_column_privilege`。wrapper 与私有 inner
function 均须保持 exact executor owner、`SECURITY DEFINER`、空 `search_path` 和各自
精确 ACL；这些事实也会在运行时重验，而不只依赖 migration-time snapshot。

`bind` 必须看见精确 runtime role、OID、PID、`backend_start` 和固定 runtime
`application_name`，然后立即把角色改成 `NOLOGIN`。已经建立且已绑定的唯一物理连接
可继续完成当前工作，但不能再用同一凭据建立新连接。OID 唯一约束仅覆盖尚未
`REVOKED` 的行；终态审计同时用不可变 role name 及精确 PID/`backend_start`，避免 OID
复用造成错误归因。

M1l 的 current runtime binding 不再使用 M1j 的 `SET LOCAL ROLE` 模型。客户端事务
不会发出 `SET ROLE`：wrapper 外 `current_user` 与 `session_user` 均为 runtime role；
进入 `SECURITY DEFINER` terminal wrapper 后，`current_user` 精确为 terminal executor，
`session_user` 仍为 runtime role。SQL `SET ROLE` 以及 `set_config('role', ...)` 均被
禁止。runtime 通过上述 outbound inherited caller edge 只继承精确的三参数 terminal
wrapper；inbound creator edge 保持惰性，runtime 对 generation tables、sequences 和
其他 functions 没有权限。

## Three-argument terminal fence

M1l 没有增加第四个客户端参数。Migration 把既有三参数实现改名为私有
`_persist_verified_communication_note_preview_terminal_unfenced(jsonb,text,text)`，
撤销 caller 对它的执行权，再用同名同签名的三参数 wrapper 保持调用面稳定。

Wrapper 先找到 `session_user` 对应 acquisition，再取得与 tombstone/finalize 相同
namespace 的 **shared transaction advisory lock**；随后重新读取并精确验证：

- 状态为 `ACTIVE`，没有 tombstone/revocation/future-issuance block，且仍有超过五秒
  的 lease；
- runtime role 名称与 OID、当前 PID、`backend_start`、固定 runtime
  `application_name` 全部一致；`session_user` 为该 runtime role，wrapper 的
  `current_user` 为 terminal executor；
- statement 的 authorization digest、run ID hash 与第三参数 caller-identity HMAC
  均和 broker row 一致；
- runtime role 已是 `NOLOGIN`、`INHERIT=true`，角色属性与 45–90 秒过期值仍精确；
  outbound caller edge 与 inbound inert creator edge 的数量、方向和 options 均精确；
- runtime 只能继承精确 terminal wrapper，不能 `SET ROLE`、不能调用
  `set_config('role', ...)`，也没有 generation table/sequence、列级或其他 function
  权限；static caller 的 cluster-wide ownership/ACL dependency 与 wrapper/inner
  exact executor owner、`SECURITY DEFINER`、空 `search_path`、精确 ACL 证明仍成立。

只有这些检查在拿锁后全部通过，wrapper 才调用私有旧实现。Terminal 事务持有 shared
lock 到提交；`tombstone`/`finalize` 需要 exclusive lock，所以 terminal-first 必须先
自然完成，而 tombstone-first 会使后来 terminal 调用固定失败为
`RUNTIME_CREDENTIAL_NOT_ACTIVE`。这关闭了 M1k 留下的 committed tombstone 与晚到写入
之间窗口。

## Connection-bound cancellation barrier

Resolver 的 session port 现在必须提供绑定到该物理连接的 `cancelInFlight()`，不能用
外部 PID 猜测取消目标。Query 收到 Abort 后进入 `CANCELLING`，并在最多 250 ms 内同时
等待取消调用及底层 query settle。两者都确认 settle 后 session 才能恢复 `ACTIVE`；
任何一项未在期限内确认，就永久进入 `QUARANTINED`，之后不能再让该 driver 执行 SQL。
权威 broker tombstone/finalize/inspect 仍从独立管理连接完成，因此隔离的本地 driver
不会重新获得写能力。

这仍只是 source-level 的 connection-bound cancellation contract。r5 证明了 pinned-CA
TLS 与匿名 FD pipe、仅进程内 credential transport，但没有触发 Abort 路径，也没有证明
未来产品 PostgreSQL driver 的 cancel 或进程内凭据清除语义。

## Local PostgreSQL 16.15 formal-migration evidence

`communication-note-preview-runtime-credential-broker-migration-local-pg16.mjs` 创建一次性
owned 临时目录，使用 private Unix socket、禁用 TCP，并以 bootstrap superuser 建立
符合 Hosted 形状的非 superuser `postgres`。该角色具有 `CREATEROLE`、`BYPASSRLS`、
`pg_signal_backend` 与 `pg_read_all_stats`，随后直接运行第 40 条正式 migration source。

当前 harness source 已在 PostgreSQL 16.15 最终全绿。精确固定输出为：

```json
{"ok":true,"gate":"communication-note-runtime-broker-migration-local-pg16","postgresMajor":16,"postgresVersion":"16.15","postgresVersionNum":160015,"scenarioCount":6,"acquisitionCount":4,"revokedIssuedCount":4,"runtimeRoleCount":0,"runtimeSessionCount":0,"runtimeMembershipCount":0,"apiPrivilegeCount":0}
```

新增场景会在同一 disposable private-socket PostgreSQL 16 cluster 中创建第二个本地
database，让 runtime 在其中创建 large object，并验证 tombstone/`NOLOGIN` 已提交后，
`finalize` 的 `DROP ROLE` 因唯一跨库 ownership dependency 固定以 SQLSTATE `2BP01`、
routine `DropRole` 失败；失败事务没有写入 `REVOKED`，并保留 TOMBSTONED ledger、
`NOLOGIN` role、caller membership 与 remote residue。清除唯一 owner dependency 后，
第二次 finalize 与 inspect 成功并证明零残留，随后删除第二个 database。这个结果只
属于 local PG16 empirical evidence，不是 PostgreSQL 17、Supabase Hosted、TLS、
Production 或部署证据。
SQL 顺序仍被设计为 fail closed：先持久化 tombstone 并使角色 `NOLOGIN`，然后尝试
`DROP ROLE`，只有成功删除才写入 `REVOKED`。Hosted/PG17 的跨数据库 empirical proof
已由下述同 revision r5 gate 补齐。

## Supabase Hosted PostgreSQL 17 evidence

最终 r5 使用一次性、无数据、非默认、非持久的 Micro PostgreSQL 17 Preview：

- name `careslink-note-runtime-broker-m1l-r5-20260830`；
- branch ID `5f088eac-ac66-4625-8f4c-c9e7d9b02c2a`；
- project ref `ucdmoxqzruohiqmsokfv`；
- parent/default Production 仅用于控制面身份交叉核验，从未作为 SQL target。

r5 使用的 Hosted child source SHA-256 是
`4d249227fff139a17a131894ac3225050506c970de4a9c1f11f8c790731e8d45`，outer runner
SHA-256 是 `9f586d61ac43920e8cac6dda71fd951c5a6562a3592c293e4347bf243ce1e4e8`。
r5 后的只读审计发现 outer allowlist 仍接受已无 child 生产路径的旧粗粒度错误码；最终
source 只删除该失败解析死项，不改 migration、Hosted child 或成功路径。当前 outer
runner SHA-256 是 `0ad4a390ee8aa50688ec38a36f6ad89367c34a0b89cd22eb133edf16b0a83ae1`，
outer static contract test SHA-256 是
`80857da30e9c714de2cf8a9807151535d3cbf4aa853bca5fa0935681e313adac`；聚焦契约
22/22 与下述完整 suite 已覆盖该 post-r5 failure-parser hardening。

固定 40-entry revision 在单一数据库事务中完成 40/40 migration，保留 19-row baseline，
并在内存中移除 20 个 repository outer wrappers；随后 A01–A18 通过 18/18。Hosted
child 与独立 outer postcheck 均通过，child 的精确终态摘要为：

```json
{"ok":true,"gate":"communication-note-runtime-broker-hosted-pg17","postgresMajor":17,"terminalState":"ACCEPTED","exactReplayCreated":false,"validConflictRejected":true,"runtimeIdentity":"DIRECT_LOGIN_INHERITED_CALLER_WITHOUT_SET","bindLoginFence":"NOLOGIN","crossDatabaseOwnerResidueProof":true,"acquisitionCount":2,"revokedIssuedCount":2,"finalLedgerCounts":[1,0,1,1,1,1],"runtimeRoleCount":0,"runtimeSessionCount":0,"runtimeMembershipCount":0,"apiPrivilegeCount":0,"credentialVerifierResidueCount":0,"temporaryDatabaseCount":0,"credentialTransport":"anonymous_fd_pipe_process_memory_only","rawCredentialMaterialPresent":false}
```

跨数据库场景在第二个临时 database 中由 runtime 创建 large object，精确证明
`lomacl` 非空且只含两项 ACL、`aclexplode` 恰有 owner/postgres × SELECT/UPDATE 四行、
grantor 均为 runtime、无 grant option，并将 `pg_shdepend` 绑定到当前 database、large
object OID 与 cluster-wide 唯一 owner dependency。tombstone 与 `NOLOGIN` 提交后，首次
finalize 固定以 SQLSTATE `2BP01` / routine `DropRole` 失败；TOMBSTONED 状态及远端 residue
在失败事务回滚后仍可证明。仅由受控 management `SET LOCAL ROLE runtime` 清除该 owner
对象后，finalize、inspect、远端 residue 与临时 database 清理全部收敛为零。

r3（`895e3169-9402-4961-a097-959e4e1edc07` / `bozungxfcvywstrtoryg`）与 r4
（`bf1cba12-b5e7-4a51-85db-a2f2c0e7e273` / `tsgvxuvisuojgcsezcrq`）都在失败后立即
删除：r3 暴露了 session-pooler backend replacement race；r4 把错误收窄到
PostgreSQL 17 不存在的 `has_largeobject_privilege`。r5 使用官方 catalog
`aclexplode`/`acldefault('L', owner)` 精确证明后通过。r5 随后也已删除，三次独立最终
branch list 均只剩 default Production `adocsnwnslxhxcjgbyee` 且为 `ACTIVE_HEALTHY`；因此
没有继续运行的 Preview 或继续计费，历史已发生费用不在本证据中推算。

最终 Advisors 不能描述为全局零告警。Security 有 41 个全局发现（21 INFO、20 WARN），
Performance 有 129 个全局发现（105 INFO、24 WARN），但两者在
`careslink_v1_runtime_broker` scope 都是 0。数据库 lint 覆盖 14 functions、17 issues；
broker 的 2 个只是 `finalize` 中 shadow/unused variable 的非阻断 warning，2 个 error 均
来自既有 generation analyzer 的 permission-denied 调用，而不是 broker。这个边界只
证明 M1l broker 没有新增 scoped Advisor blocker，不消除仓库既有债务。

## Pins, approval and next gate

M1l 已把 migration 数量从 39 推进到 40，因此 M1g-i 的 39-entry pins 与已删除 Hosted
Preview 证据只能继续描述其原 revision，不能继承到 M1l。上表中的第 40 条 migration、
ordered basenames/entries、transactional `.7` 40-entry/20-wrapper manifest、A03、
rollback `.5` manifest、preflight 与 coordinator 已作为同一 M1l revision 原子冻结；
聚焦 pin/contract 与 Hosted runner 契约覆盖已纳入最终回归。

同一最终源码 revision 也通过完整 179-file / 2,418-test suite、
`tsc --noEmit`、全仓 ESLint、`git diff --check`，并由 Next.js 16.2.9
Webpack production build 完成 64/64 pages。默认 Turbopack 入口只因该临时
worktree 的共享 `node_modules` symlink 指向文件系统根外而在编译前被环境阻断，
不作为通过证据。

这些 hash 只证明 source-integrity binding；r5 证明同 bytes 可在已删除 Preview 应用，
不表示第 40 条 migration 已应用到 Production，也不把 M1g-i 的旧 Hosted evidence
继承到 M1l。

`productionMigrationPresent=true` 仅表示 resolver policy 看见正式 migration source；
不表示已应用到 Production。Preflight/coordinator 仍必须得到 approved target、custody、
secret transport、caller resolver、driver cancel 和同 revision 数据库证据，且所有
ready/approved latch 继续 false/undefined。

同 revision 的 disposable Hosted/PG17 数据库 gate 已关闭。下一项不再是创建 Preview，
而是交接 source review，并分别取得 merge、部署/Production migration、approved target、
custody/secret transport/product-driver 与 provider/model evaluation 的明确授权和证据。
在这些 gate 与 human review 完成前，不能启用产品 route、真实 AI 应用流量或
Production 写入；readiness/approval latch 继续保持 false/undefined。
