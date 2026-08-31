# Communication Note Preview approved runtime adapters M1m

## 状态与结论

M1m 为 M1l 的 durable runtime credential broker 补齐一组可审计的源码适配器：
受控 Supabase Preview 目标解析、nonce-bound 一次性管理 delivery、独占管理连接、独占 runtime
PostgreSQL 连接，以及把这些边界组合进 M1l resolver/runner 的 TestOnly composition。

这仍不是已上线能力。所有正式 `READY` latch 均为 `false`，approved export 均为
`undefined`，公开 factory 固定 fail closed；只有显式 TestOnly capability、依赖注入和
完整契约校验可以构造测试 bundle。M1m 没有应用 Production migration、没有部署、没有
调用 provider/model、没有产品流量，也没有接触真实护理数据。

| 模块 | policy digest | source SHA-256 |
|---|---|---|
| target | `18f77b59a92c65b58fac4090fa3b16e8c6281dedca8b11903cf09f7cf2e361d2` | `f2317b112215df56ec344a9910b8c1ff092c49900a5c813c08852f364c622cb1` |
| broker | `1498ea8e26014afcfc02a6f418f5eec783dd58a7485673d51edb04bef965fb0e` | `5a12b9d4c28fc963383dfa3643bdd2cf1d9fcec681e534750ef0324f9c901daa` |
| management session | `b52fae0bc088dc2d2ba6cfd298fc3da56426044c89d5fd4223295f1ca0acbaed` | `f2bc1365d5cf030a6399f3da4e06c49017bcde9b579aab7fe80ca46709940aaa` |
| runtime PostgreSQL session | `75d7aae46d34a6de369b68e57d448f6aa0a8267d14b4ed097081bd306c131f09` | `9b60786fc55c83df578885076ea2199a4b88106144c1899aa7005ee6940fda07` |
| composition | `8fe10547d33732388f5e6b97afc76da9679d63ae1d45eb04447ae21ac2462e31` | `071d1c5e8fb625695c6bd3918c319994779ddec0402e5a2f2a4eb79e60e0a040` |

## 适配器边界

| 层 | 固定边界 |
|---|---|
| target resolver | 仅接受无数据、非默认、非持久、非 Production、`ACTIVE_HEALTHY` 的 PostgreSQL 17 Preview；端口固定 5432，连接模式只允许 direct 或 Supavisor session；控制面观察、project-ref HMAC 与 pinned CA loader 必须是三个独立注入端口 |
| sealed target | 公共 descriptor 不含 project ref、hostname 或证书；私有 project ref、endpoint 与 CA bytes 保存在 `WeakMap` capability 中，并与 descriptor canonical SHA-256、受信 resolver clock 和单调读取顺序绑定 |
| management credential transport | 每次 open 由 factory 生成 256-bit nonce，credential 必须精确回显，并绑定 target descriptor、CA digest、派生 user 与固定 application name。Factory 只保存 nonce SHA-256 与单调 expiry，过期先清理，重复或 256-entry registry 已满均 fail closed。Supabase branch admin source 仍明确为静态、非一次性且只能通过 branch delete/password reset 撤销；不超过 60 秒且不晚于 target 的限制只属于 delivery envelope |
| management session | 每次 broker operation 打开新的独占 injected `Client`；固定 `postgres` database、pinned-CA `verify-full`、5 秒 connect/statement、1 秒 lock、5 秒 idle-in-transaction timeout，并验证 PostgreSQL 17、`current_user=session_user=postgres`、application name 与 `row_security=on` |
| broker adapter | `acquire`、`bind`、`tombstone`、`finalize` 与独立 `inspect` 使用固定 parameterized SQL；每个 operation 使用单独 session、零 retry，query/close 任一失败都权威拒绝 |
| runtime session | 一个 credential 只建立一个独占 injected `Client`；禁止 Pool、DSN、环境发现和连接复用；固定 runtime application name 与 RLS/timeout 配置，TLS 与数据库 PID 必须匹配；Abort/cancel 通过 hard-close 精确原 client 并永久禁止复用 |
| composition | 同一个 sealed target 同时派生 management 与 runtime profile，再接入 M1l durable caller credential resolver 和 resolved runner-terminal runtime port；返回 bundle 不暴露 broker、audit、capability、endpoint、CA 或 raw credential |

## 同靶与凭据安全

M1m 不接受调用方自报的 target digest 作为 management/runtime 同靶证明。Composition
先从 exact capability + descriptor 解封一次私有 target，验证 descriptor、endpoint、
project ref、CA digest 和有效期，再从这一个 binding 分别构造 management 与 runtime
connection profile。每次真正 open 前都重新读取 capability 并重新验证；descriptor
替换、capability 交叉混用、CA 替换、Production ref、过期以及 clock 回退均 fail
closed。

这里的 `WeakMap` capability 证明不可伪造与 exact-object 绑定，不是独立的
server-side 授权系统：同一源码模块仍导出供 composition 使用的 reader/access
symbol。M1m 通过 runtime-boundary 测试把这些 import 精确限制在审计过的
server-only composition 与测试文件；未来 approved 产品版应只暴露更高层 operation
或 composition surface，而不把低层 reader 当作权限边界。

管理凭据 transport 是注入的安全边界，不是 M1m 自己实现的 secret manager。M1n 修正了
原先容易把 delivery lifetime 误读成 source credential lifetime 的语义：
`STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD` 的 `sourceExpiresAt=null`、
`sourceCredentialSingleUse=false`，撤销方式固定为 branch delete/password reset；只有
`deliveryIssuedAt`、`deliveryExpiresAt`、`deliveryOneUse` 与 factory 生成的 64-hex
`deliveryNonce` 证明 callback 的单次短时交付。Nonce 原值不进入 registry；同一 factory
仅保留 nonce SHA-256 和单调 expiry，因而旧 envelope 跨 open 重放会在 Client 构造前拒绝。
适配器还证明绑定字段、已知密码引用清除、错误脱敏以及精确 client 关闭语义；它不声称
已经有 KMS/Vault、部署身份、secret rotation、底层短期密码或全进程内存清零证据。
Runtime credential 仍由 M1l durable broker contract 签发，并在 bind 后由数据库提交
`NOLOGIN` fence。

## 连接与取消语义

Direct 与 Supavisor Session 都固定使用 5432，保留物理 session；不允许 transaction
pooler 6543。TLS 配置使用 pinned CA、`rejectUnauthorized=true` 与 PostgreSQL SSL
negotiation，连接后还要验证底层 stream 已加密且证书授权成功。

Runtime query 单飞。Abort 或超时只操作创建该 session 的 exact client：先 hard-close
其原始 stream/client，再等待 in-flight query settle；该 session 此后不可重用。管理
session 的 Abort、query timeout、driver error、close timeout 或 close failure 同样销毁
exact stream；broker 生命周期 mutation 继续由独立的新管理连接完成，因此不会依赖已
隔离的 runtime connection。

M1o 还为 Hosted outer admin Client 增加两秒有界 close：`end()` 拒绝或悬挂时尝试
hard-destroy 已验证的 exact TLS stream；Direct 网络失败只有在优雅关闭成功或 destroy
确认未抛错且 `stream.destroyed === true` 后才可回退 Session Pooler，missing、throwing
或 silent no-op destroy 会在构造第二个 Client 前 fail closed。最终 admin close 失败固定
映射为 cleanup failure，并要求 caller 继续 exact branch-delete recovery。

Management/runtime query 都会在起点复验 target/lease，数据库 statement timeout 固定
为五秒，因此一条已经开始的语句最多可能跨过 expiry 这一个 timeout 窗口；M1l 的
terminal/persist/commit freshness fence 会拒绝过期结果。若未来要求 expiry 瞬间之后
完全没有 SQL 执行，还需要把 query timeout 裁到 remaining TTL 或增加数据库侧 deadline。

## 依赖与非目标

- 适配器不读取 `process.env`，不构造 connection string，不导入 Supabase/OpenAI SDK，
  不自行执行网络发现，也不记录原始错误或秘密。
- `pg` 目前仍是开发依赖；源码通过注入的 `Client` constructor 测试。因为 approved
  bundle 尚不存在、产品入口没有 importer，本批次不把 `pg` 宣称为已部署 runtime
  dependency。
- M1m 没有修改 M1l migration、preflight/coordinator pins 或数据库 readiness；第 40
  条 migration 仍未应用到 Production。
- M1n 已增加 source-pinned、default-off 的 Hosted harness；M1o 又补齐 factory nonce
  防重放、有界 admin close 与同步 pipe failure 收敛。M1n/M1o source batch 当时没有创建
  Preview；后续 M1p 首次授权执行已通过 child metadata/TLS/PG17 与 40/40 migration gate，
  但在 synthetic setup 前因 Vitest 的 `pg` namespace Proxy false negative 固定失败，因此
  真实 PID/persist/cleanup lifecycle 仍未通过；详见
  `documentation/communication-note-preview-approved-runtime-hosted-harness-m1n.md`。

## 验证与后续 gate

M1o 当前同一源码通过 M1m/M1n 十文件聚焦 169/169（含 runtime boundary 12/12）和完整
Vitest 187 files / 2,565 tests、TypeScript、全仓 ESLint、三个 Node runner syntax、
whitespace/diff、73-file Codex adapter sync 与 Next.js 16.2.9 Webpack 64/64-page build。
这些本地结果只能证明 source contract 一致，不表示部署或 Production greenlight。

M1p 的本地修复候选使用 Node `createRequire` 加载已经固定版本和 package-root entry 的
`pg@8.23.0`，并保留 Client/prototype/method 形状与 Proxy 检查。候选 source revision 为
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb`；它通过 live 文件
5/5、五文件聚焦 97/97、全量 187 files / 2,566 tests、TypeScript、全仓 ESLint、73-file
adapter sync 与 64/64-page Webpack build。失败 Preview 已删除并三次确认只剩健康的 default
Production；这仍不是完整 Hosted gate pass，旧 revision review 和旧费用授权均不能复用。

PR #18 合并后，修正版 source revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb` 已在第二个单独授权的
no-data、non-default、non-persistent PG17 Preview 上通过完整 Hosted positive-path gate。
40/40 migration 单事务 gate、真实 `pg@8.23.0` Direct/pinned-CA TLS、M1m composition、
`ACCEPTED` terminal、factory replay protection 与终态零 role/session/membership/API privilege
均得到 live evidence；caller 随后删除 exact branch 并三次确认只剩健康 Production。该结论
不覆盖 Abort/timeout/adversarial replay negative path、Session Pooler fallback、服务端 SSL
enforcement、底层短期凭据、轮换、全进程内存清零或 transitive dependency attestation；raw
branch-admin password 在运行期间存在于进程内存。它也不改变 readiness/activation 的
false/undefined 状态。

### M1q Hosted timeout/Abort negative-path 源码候选 — 2026-08-31

M1q 在同一个 default-off Hosted runner 内加入三条彼此域隔离的 synthetic chain：positive、
PostgreSQL statement timeout 与 runtime watchdog Abort。每条 chain 分别派生 auth identity、
authorization nonce、run/client/provider request/response id，不复用 M1p positive fixture 的身份或
ledger key。源码和本地测试只证明这些输入、注入点、计数不变量与 fail-closed 分支已经被编码；
**本批次没有创建或连接新的付费 Preview，也没有运行 live-only 分支**，因此不能把下述预期写成
已经取得的 Hosted 证据。

Timeout 候选只在事务完成 `BEGIN` 与四条固定 `SET LOCAL` 后的 exact `BASE_IDENTITY` 查询处
注入 `pg_catalog.pg_sleep(30)`。真实 Hosted gate 若通过，必须证明数据库固定 5 秒
`statement_timeout` 先以 SQLSTATE `57014` 取消语句，连接仍处于失败事务，再由同一个 live
client 各完成一次 `ROLLBACK` 与 session reset；negative chain 不得写 terminal。这里的 12 秒
高层 settlement watchdog 是另一个独立上限，不能拿 timeout 结果冒充 watchdog 证据。

Abort 候选则只拦截 runtime query 顺序中的第六个、时长精确为 12 秒的 watchdog callback；前五
个 12 秒定时器和其他 timer、`Date`、`performance` 都保持真实。监控连接先观察 exact
`(backend PID, backend_start)` 正在事务内执行 injected `pg_sleep`，然后测试才定向触发该
callback。成功必须证明 exact TLS stream/client 在 broker 的 exact tombstone query 开始前已
hard-close，且 monitor tuple 与对应 durable acquisition tuple 完全相等；随后还要证明 PID drain
与永久禁止复用。这一顺序把 Abort close 与常规 tombstone 后 session cleanup 区分开。此测试设计
**不是实际等待 12 秒**，也**不是外部 caller Abort**；未来 evidence 必须保留
`highLevelDatabaseSettlementDeadlineWallClockTested=false` 与
`externalCallerAbortLiveTested=false`，不能扩大表述。

只有 future same-revision Hosted gate 整体通过后，才可声明三条 chain 的最终 ledger 为
`[3,0,3,3,3,1]`，依次代表 authorization、authorization revocation、claim、dispatch
reservation、dispatch receipt 与 runner terminal：只有 positive chain 有一个 `ACCEPTED`
terminal，两个 negative chain 都无 terminal；三次 acquisition 均已 revoke，并各保留一个
64-hex hash-only credential-verifier tombstone。该说法是“三个 hash-only verifier residue”，不是
“零 credential residue”；raw password、SCRAM verifier 或 DSN 仍必须为零。M1p revision
`fa7e7a00fdd7fc908bc233f40a009043b1f70b807337b9440a7f4138198b8ceb` 的历史 live evidence 继续
明确记录 `Abort=false`、`timeout=false`，不会被 M1q 源码候选反向改写。

M1q 仍保持所有 `READY=false`、approved export 为 `undefined`，没有 Product API importer、
Production migration/连接/写入、部署、provider/model 调用或真实护理数据。当前固定 source
revision 为 `5e39ecc8be35fcf48f0a88fac08a30e5afffcad882bc3bc604de1dc34fa4fb90`；同一
快照通过 13 files / 224 focused tests、187 files / 2,571 full tests、TypeScript、全仓 ESLint、
三个 Node runner syntax、73-file adapter sync、`git diff --check` 与 Next.js 16.2.9 Webpack
64/64-page build，独立安全复核为 P0=0、P1=0。这些仍是 local/default-off 结果；若随后要运行
付费 Preview，必须先重新核对当时价格并取得新的创建授权，旧 M1p 价格确认和授权不能复用。

若要实际接通 AI 应用，后续仍需分别取得：

1. M1q Abort/timeout negative path 源码候选的同 revision review 与独立 live 证据；
2. approved target resolver、控制面身份、KMS/Vault credential transport、部署身份与
   runtime dependency 的审查；
3. Production migration、部署与 activation 的独立授权；
4. provider/model evaluation、费用与产品流量的独立授权。

在这些 gate 完成前，M1m 不启用 Product API route，不产生模型调用，不写 Production，
readiness/approval 保持 false/undefined。
