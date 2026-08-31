# Communication Note Preview approved runtime Hosted harness M1n / M1o

## 状态与结论

M1n 增加了一个 source-pinned、default-off 的 Hosted Live harness，用来在得到单独授权的
disposable no-data Supabase Preview 上，真实驱动 M1m composition。M1n/M1o source batch 当时
只完成源码、边界和本地 default-off 验证；没有创建 Preview、没有连接 Hosted 数据库、
没有部署、没有调用 provider/model，也没有读取或写入 Production。后续 M1p 与 M1q Hosted
执行的结果分别记录如下，不能反向改写这项历史 source-only 结论。

PR #16 合并后的 M1o source-only hardening 正在为三项 review finding 提供候选修复：跨
open delivery replay、outer admin close 悬挂，以及 child input pipe 同步异常。候选修复仍须
通过同 revision final review，本文不会提前宣称这些 findings 已全部关闭；它也没有扩大
live 权限或 readiness。

正式状态没有改变：所有 `READY` latch 仍为 `false`，approved export 仍为
`undefined`，产品代码没有 importer。后续已通过的 M1p/M1q live gate 也只形成 TestOnly
empirical evidence，不会自动批准 Production migration、部署或 activation。

## M1p Hosted 首次执行与修复候选 — 2026-08-31

经单独费用确认，以实时 Micro Compute 价格 `US$0.01344/hour` 创建了无数据、非默认、
非持久 Preview `m1p-communication-note-full-hosted-r3-20260831`（branch id
`2e717d9a-d5ee-4eb7-974c-9820f5ab2321`，child ref `mnhzzwimwdgqdhtxewcz`）。控制面确认
parent 为 Production `adocsnwnslxhxcjgbyee`、状态为 `ACTIVE_HEALTHY`、PostgreSQL 17，
并使用 Dashboard 当前 Server root certificate；其 SHA-256 为
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`。

同一 child 上的匿名、显式 Production-ref 防护迁移 gate 通过 40/40 migration：单事务
apply 成功，40 个数据库 version 与 manifest 全等，application schema 被重建，初始 broker
ledgers 为空，临时角色不存在。随后用已审查 source revision
`7a0f19f782670acf663fd087a3e460df92048e2d2406b05efe20d900a182e011`
启动完整 Hosted runner；child 在任何 synthetic chain setup、runtime role/broker lifecycle 或
业务调用之前，以固定码 `M1N_APPROVED_RUNTIME_ADAPTERS_HOSTED_LIVE_DRIVER_INVALID` 失败。
因此这次执行只证明 control-plane/TLS/PG17 preflight 与 40/40 migration gate，**不构成完整
M1n/M1o Hosted runtime gate 通过**。

根因是 Vitest 4.1.9/Vite 8 会把对固定 `pg@8.23.0` CommonJS entry 的绝对动态 import 包装成
Proxy module namespace；原 child 在读取其中有效且非 Proxy 的 `default.Client` 前就拒绝了
namespace，形成 driver false negative。修复候选改用 Node `createRequire(import.meta.url)`
加载已校验 package root 下的同一绝对 entry，不放宽版本、路径、Client/prototype Proxy 或
`connect/query/end/on` 方法检查，并增加真实 Vitest child 回归。候选 source revision 为
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`；旧 revision 的审查和
付费执行授权不能复用。

失败后已立即删除 exact branch；三次顺序独立 branch listing 均只返回唯一 default
Production `main`（`ACTIVE_HEALTHY`），从而撤销该 Preview 的静态管理凭据。没有连接或修改
Production，没有真实数据、provider/model 调用或部署。实际费用仍以 Supabase 最终计量为准。

本地修复候选已通过 live 文件 5/5、五文件聚焦 97/97、全量 187 files / 2,566 tests、
TypeScript、全仓 ESLint、73-file Codex adapter sync、`git diff --check` 与 Next.js 16.2.9
Webpack 64/64-page build。它仍是未激活的本地候选；下一次完整 Hosted rerun 必须先完成新
revision review，再取得新的付费 Preview 价格确认与创建授权。

## M1p Hosted 修正版完整 gate 通过 — 2026-08-31

PR #18 合并并完成同 revision review 后，再次以实时 Micro Compute 价格
`US$0.01344/hour` 单独授权创建了无数据、非默认、非持久 Preview
`m1p-communication-note-full-hosted-r4-20260831`（branch id
`f9679387-37fa-483a-aad8-e0e53c0f2854`，child ref `eumbhzfkrfssekoihozi`）。控制面确认
parent 为 Production `adocsnwnslxhxcjgbyee`、`ACTIVE_HEALTHY`、PostgreSQL 17；Dashboard
当前 Server root certificate 与固定 CA 的 SHA-256 均为
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`。

同一 child 先通过 40/40 单事务 migration gate：19 条 baseline migration history 与各项固定
baseline fingerprints 全部匹配，
40 条 migration 与 manifest `6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d`
全等，application objects 被重建，ledgers 为空且临时角色不存在。随后使用 fresh anonymous
credential envelope 和 source revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`
执行完整 Hosted runner并通过。固定 evidence 证明：

- 真实 `pg@8.23.0`、Direct 5432、client-side pinned-CA verify-full 与 PG17；
- control-plane observation、ephemeral process HMAC project-ref binding、source manifest/pin；
- 真实 M1m composition 驱动并得到 `ACCEPTED` terminal；
- factory-scope cross-open delivery replay-protection contract 与五次 fresh delivery；
- 终态 runtime role/session/membership/API privilege 均为零；
- 恰好一个 hash-only credential verifier tombstone，evidence 与 durable ledger 均无 raw
  credential material。

该成功证据仍明确保留边界：source revision 不声称完整 transitive dependency attestation；
underlying Supabase branch-admin password 仍是静态凭据，不声称短期、轮换或进程内存清零；
raw branch-admin password 在运行期间存在于进程内存；Abort、timeout、adversarial old-envelope
replay 与 Session Pooler fallback 本轮未 live-test；服务端 SSL enforcement 未证明，证据只覆盖
client-side pinned-CA verify-full；runner 本身不验证 branch deletion；
`activationApproved=false`、`ready=false`，approved export 仍不存在。

成功后 caller 已立即删除 exact branch；三次顺序独立 branch listing 均只返回唯一健康的
default Production `main`，从而撤销静态管理凭据并停止继续产生该 branch 的费用。没有连接或
修改 Production 数据库，没有真实数据、provider/model 调用或部署；Production parent 只发生
disposable branch create/get/list/delete 控制面交互。实际费用以 Supabase 最终计量为准。

## M1q timeout/Abort negative-path 完整 Hosted gate 通过 — 2026-08-31

经新的价格确认与明确创建授权，caller 以当时实时 Micro Compute 价格
`US$0.01344/hour` 创建了 no-data、non-default、non-persistent PG17 Preview
`m1q-communication-note-hosted-negative-paths-r1-20260831`（branch id
`c1c404d3-e45d-44a2-b474-af3b52b7c13a`，child ref `htylsaspsskufkgjginz`）。控制面确认
parent `adocsnwnslxhxcjgbyee`、`with_data=false`、`ACTIVE_HEALTHY`；当前 Server root
certificate 与 pinned CA 的 SHA-256 均为
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`。

同一 child 的 40/40 单事务 migration gate 先通过，数据库 migration history 与 manifest
`6590eed19602c4d7931355f18dafde699b1c47012a3fe09f9d040c179e11792d` 全等。随后前两次 full
runner 都在第一条 scenario setup 之前因 setup SQL 语法错误失败。两次失败均完整事务 rollback，
独立 postcheck 均确认 generation/broker ledgers 与临时 runtime roles 为零，因此没有半完成
scenario 或残留权限。修复补齐五个 `DO` 块的 `END;`，并为顶层 `IF` 使用的 `CASE` 表达式
补上括号；修复后的 PG17 parse-only diagnostic 返回 `{"parsed":true}` 并回滚其 transaction，
两轮独立复核均为 P0=0、P1=0、P2=0。

最终 source revision
`8b84b0aa633892a2da9bf157702f005c06b48d3b98a2f1aef2bff78082b552b7` 随后通过固定 gate
`COMMUNICATION_NOTE_M1Q_APPROVED_RUNTIME_ADAPTERS_HOSTED_NEGATIVE_PATHS`。runner 使用真实
`pg@8.23.0`、Direct 5432 和 client-side pinned-CA verify-full，在一个 enabled live test 内顺序
运行三个独立 M1m composition 与三条域隔离 synthetic chain：`M1Q_HOSTED_POSITIVE`、
`M1Q_HOSTED_STATEMENT_TIMEOUT`、`M1Q_HOSTED_WATCHDOG_ABORT`。每条 chain 使用独立 auth
identity、authorization nonce、run/client/provider request/response id、runtime client、
monitor/admin connection 和 fresh management deliveries。

最终 live evidence 证明：

- positive chain 恰好一个 `ACCEPTED` terminal，statement-timeout 与 watchdog-Abort 两条
  negative chain 都没有 terminal write；三条 chain 的累计 ledger 为 `[3,0,3,3,3,1]`；
- statement-timeout path 在事务中的 exact `BASE_IDENTITY` query 触发真实 SQLSTATE `57014`，
  monitor 观察 backend in-transaction，随后同一个 live client 完成 `ROLLBACK` 与 session reset；
- watchdog-Abort path 在 monitor 观察 exact `(backend PID, backend_start)` 后定向触发第六个
  12 秒 settlement callback，并在 broker exact tombstone query 开始前 hard-close exact TLS
  stream/client；monitor tuple 与 durable acquisition tuple 相等，三个 runtime PID 全部 drain；
- 三次 acquisition 全部 `REVOKED`，保留三个 64-hex hash-only credential-verifier tombstone，
  终态 runtime role/session/membership/API privilege 为零。

最终 evidence 保持 `sourceRevisionTransitiveClosureAttested=false`、
`underlyingCredentialShortLived=false`、`underlyingCredentialExpiryAttested=false`、
`rotationTested=false`、`highLevelDatabaseSettlementDeadlineWallClockTested=false`、
`externalCallerAbortLiveTested=false`、`processMemoryZeroizationAttested=false` 与
`branchDeletionVerifiedByRunner=false`；caller-side 删除单独记录如下。三个 hash-only verifier
residue 不能简写为“零 credential residue”；raw password、SCRAM verifier 与 DSN 没有进入
evidence 或 durable ledger。

`activationApproved=false`、`ready=false`，approved exports 继续为 `undefined`。成功后
caller 精确删除 branch；三次顺序独立 listing 均只返回 `ACTIVE_HEALTHY` 的 default `main`，
从而撤销 branch credential 并停止后续费用，实际已产生费用以 Supabase 账单为准。没有
Production SQL/数据访问、Vercel deployment、provider/model 调用或真实护理数据。M1p revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb` 的历史 positive-only、
`Abort=false`、`timeout=false` evidence 保持不变。

## 本批次解决的凭据语义问题

Supabase Preview 的 `postgres` 密码是静态分支管理凭据；它只能通过密码重置或删除分支
撤销。匿名 pipe 的一次读取和 60 秒有效期只约束 delivery envelope，不能把底层密码变成
短期或一次性凭据。

因此 management-session source contract 升级为 v3，并明确区分：

- `credentialClass = STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD`；
- `sourceExpiresAt = null`；
- `sourceRevocation = BRANCH_DELETE_OR_PASSWORD_RESET`；
- `sourceCredentialSingleUse = false`；
- 每次 open 由 factory 生成新的 256-bit `deliveryNonce`，credential 必须精确回显；
- 仅 `deliveryIssuedAt`、`deliveryExpiresAt`、`deliveryOneUse` 和 nonce-bound envelope 受
  30 秒 age / 60 秒 lifetime 限制；factory registry 只保留 nonce SHA-256 与单调 expiry。

这项修订不会声称已经存在 KMS/Vault、leased database credential、部署身份、自动轮换、
全进程内存清零或服务端 SSL enforcement。已知 driver/password 引用会在连接后清除，但
证据明确保留 `rawCredentialMaterialInProcessDuringRun=true` 和
`processMemoryZeroizationAttested=false`。

## Harness 架构

| 层 | 固定边界 |
|---|---|
| outer runner | 复用受审计的 branch envelope policy；只接受 Production 的非默认、非持久、`with_data=false`、`ACTIVE_HEALTHY` child；先尝试 Direct 5432，仅在固定网络不可达错误且 Direct 已优雅关闭或 exact TLS stream hard-destroy 已确认未抛错并同步置 `destroyed=true` 时回退 Supavisor Session 5432；缺失、抛错或 silent no-op destroy 会在构造第二个 Client 前 fail closed；admin `end()` 最多等待两秒，最终关闭失败固定为 cleanup failure |
| source revision | canonical manifest 自身及其有序 66 paths 均按 `relative path + NUL + bytes + NUL` framed SHA-256；覆盖 package/pnpm lock/tsconfig、outer/channel、当前静态 import 闭包、setup SQL 和磁盘上精确 40 migrations。调用方必须提供固定摘要，outer 在读 stdin/连接数据库前比对，child 再独立重算；不声称 Node/Vitest/node_modules 的完整 transitive integrity |
| child channel | FD3 bounded public config、FD4 raw pinned CA、FD5 binary static-password envelope、FD6 fixed status；秘密不进入环境变量、argv、stdout/stderr 或 JSON config。任一 input `.end(payload)` 同步异常会立即清 timer/payload、通过 ChildProcess handle 请求 SIGKILL 并对全部 stream 调用 destroy，只返回固定 pipe failure；等待 child close 或独立一秒 deadline，deadline 会再次通过 handle 请求 hard kill、重调 destroy、unref 并移除 data/exit/stateful listeners；content-free terminal error sinks 保留到真实 close，禁止裸 PID signal |
| target resolver | 使用同一 child 内 32-byte ephemeral HMAC key绑定 target/Production refs；control-plane observation、endpoint、CA digest 与 sealed target 相互绑定；key 在 composition 构造后清除 |
| synthetic chain setup | 在独立管理事务中创建一个无密码的 dummy LOGIN/NOINHERIT runtime-shaped role，仅用于执行现有 valid-chain setup policy；同事务撤销 membership 并 drop dummy role，随后构造与真实 catalog 一致的 ACCEPTED envelope |
| M1m drive | parent 与 child 都从实际 resolved `pg/package.json` 要求精确 `8.23.0`，再从同一 CJS package entry 取得 constructor 并注入 M1m management/runtime adapters；client 实例严格分离，唯一业务驱动入口是 `bundle.runtimePort.persist(envelope)` |
| durable lifecycle | 高层调用真实经过 acquire → runtime connect/PID → bind/NOLOGIN → transaction/persist → tombstone → exact session destroy → finalize → inspect；要求恰好五次 fresh、factory-nonce-bound management delivery，旧 envelope 跨 open 重放在 Client 构造前拒绝 |
| postcheck | child 外独立管理连接和 parent runner 分别证明终态 acquisition、runtime role/session/membership 与 schema/function/table/sequence API privilege 为零；parent cleanup 枚举、finalize、inspect 所有 acquisition（包括已 `REVOKED`）。成功发行后必须保留恰好一个 64-hex `credential_verifier_sha256` hash-only tombstone；never-issued 记录才要求 null，原始 password/SCRAM verifier 仍禁止持久化 |

## Pipe 与 evidence 边界

FD5 使用固定 binary framing：8-byte `CLM1NSEC` magic、1-byte version、32-byte
delivery binding digest、2-byte big-endian password byte length、UTF-8 password。拒绝尾随
字节、控制字符、DSN 和超过 1,024 bytes 的值。Binding digest 覆盖 source revision、
target/control-plane digest、实际 endpoint mode/hostname、5432、database、username suffix、
CA digest、management user 和 delivery timestamps；它不散列密码，避免留下可离线猜测的
password fingerprint。

M1p 成功 evidence 只包含固定枚举和布尔值，不包含 branch ref/id、hostname、CA、password、
runtime role 或 acquisition digest。允许的说法包括 actual connection mode、client-side
pinned-CA verification、真实 M1m composition、静态 source credential、一次读取 delivery、
factory-scope cross-open replay protection、PG17、实际 `pg@8.23.0`、caller source pin、
ACCEPTED terminal 和零 runtime residue。
不允许把它扩写成完整 transitive dependency attestation、底层短期凭据、KMS/Vault、
内存零残留、M1q Abort/timeout live proof、两种 endpoint 都已覆盖、Production ready、已部署
或 AI 功能已上线。

M1q 最终 evidence 中的 timeout/Abort、SQLSTATE `57014`、in-transaction monitor、
rollback/reset、targeted watchdog、pre-tombstone TLS hard-close、PID drain 与三 tombstone 字段，
来自同 revision 完整 live gate 和 parent/child 独立 postcheck。它们只适用于本节记录的 M1q
revision，不得反向归因给 M1p，也不得扩展成 12 秒 wall-clock 或 external-caller Abort 证据。

历史 final-review M1o candidate source revision 为
`7a0f19f782670acf663fd087a3e460df92048e2d2406b05efe20d900a182e011`；manifest 文件自身
SHA-256 为 `154cc1afe53597f1a2d547e9676b4e3a4aa2415acfe4a90ea2d14225ca235eae`。
精确 runner 参数为
`--expected-source-revision-sha256=7a0f19f782670acf663fd087a3e460df92048e2d2406b05efe20d900a182e011`。
该值保留为历史记录，不是 M1q 的 runner 输入。M1q 最终 runner 使用固定摘要
`8b84b0aa633892a2da9bf157702f005c06b48d3b98a2f1aef2bff78082b552b7`；任一 manifest/source
byte 改变都必须再次 review、重算，不能把本次 live evidence 归因给新摘要。

## Live 执行记录与后续重跑前置条件

本次 M1q 执行满足下列原子边界并在成功后删除 exact branch。任何后续重跑仍必须重新核对当时
的付费 Preview 价格、另行取得创建授权，并再次满足：

1. 创建 parent 为 `adocsnwnslxhxcjgbyee` 的 no-data、non-default、non-persistent
   PostgreSQL 17 Preview；保留真实 branch id/ref；
2. 使用同 revision 精确应用 40/40 migrations；runner 将数据库中的 ordered 14-digit
   version array 与 manifest 全等比较，并确认 generation/broker ledger 初始为空；
3. 从该 Preview 获取当前 Direct/Session connection candidates 与当前 CA，核对 CA SHA-256；
4. 通过 canonical reset envelope 的 stdin、五个 fixed args（branch ref、PG major、CA
   path、CA SHA-256、经同 revision review 锁定的 source revision SHA-256）和匿名 pipes 执行
   `communication-note-preview-approved-runtime-adapters-hosted.mjs`；branch id 不进入独立
   child config/control-plane digest，由 caller 只为后续精确删除保留；
5. 无论成功或失败，先完成 acquisition cleanup，再删除 exact branch；三次独立 branch
   listing 确认 id/ref 消失且只剩 `ACTIVE_HEALTHY` default Production。

Runner 自己不会创建或删除 Supabase branch，也不会修改 Production。任一非成功结果都要求
caller 删除 exact branch：runner 可清理 broker acquisition/runtime residue，但 setup 已提交的
synthetic generation ledger 必须依赖 disposable branch deletion 终结。删除 branch 才是静态
管理密码的最终撤销与确定性停止继续计费边界；pause 不能替代删除。若 branch 尚未删除，
不得声称费用已经停止或凭据已经完全撤销。

## 当前验证范围

原 M1n/M1o source batch 的 local/default-off gate 覆盖 credential schema、source-pin
mechanics/canonical 66-path manifest、磁盘与数据库 40-version exact policy、实际 `pg@8.23.0`
resolution、FD/env/status isolation、Direct/Session 5432 config、secret framing、truthful evidence、
all-acquisition cleanup、hash-only verifier-state policy、factory nonce replay registry、bounded admin
close、synchronous pipe failure、exact importer graph 和旧 M1l child behavior regression。Hosted
PG17、真实 TLS/PID、Abort/cancel、live cleanup 与 branch deletion 均尚未执行，因此不能作为
该历史 source batch 已通过事实。

历史 M1o candidate 已通过十文件聚焦 169/169 与全量 187 files / 2,565 tests；TypeScript、
全仓 ESLint、三个 Node runner syntax、whitespace/diff、73-file Codex adapter sync 与
Next.js 16.2.9 Webpack 64/64-page build 是同 revision closeout。没有执行 live-only test
branch。

M1q 的 source-level 三场景 fixture、exact-query injection、定向第六 timer 与 evidence/postcheck
contract 先通过 13 files / 224 focused tests、187 files / 2,571 full tests、TypeScript、全仓
ESLint、三个 Node runner syntax、73-file adapter sync、`git diff --check` 与 Next.js 16.2.9
Webpack 64/64-page build。Hosted 执行中的两次 setup SQL parse 失败均在第一 scenario 前完整
rollback，ledger/roles postcheck 为零；修复后的 PG17 parse-only rollback 与两轮 P0/P1/P2=0
复核通过。setup SQL 热修复后的同一最终源码又通过 2 files / 29 focused tests、187 files /
2,571 full tests、TypeScript、全仓 ESLint、三个 Node runner syntax、73-file adapter sync、
`git diff --check` 与 64/64-page Webpack build。最终固定 revision
`8b84b0aa633892a2da9bf157702f005c06b48d3b98a2f1aef2bff78082b552b7` 已通过三场景完整 gate，
exact branch 随后删除且三次 listing 只剩健康 default `main`。Production migration、Vercel
deployment、runtime dependency promotion、provider/model evaluation 与产品 activation 仍是后续
各自独立 gate。
