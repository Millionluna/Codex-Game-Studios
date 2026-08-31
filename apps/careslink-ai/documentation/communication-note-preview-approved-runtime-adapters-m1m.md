# Communication Note Preview approved runtime adapters M1m

## 状态与结论

M1m 为 M1l 的 durable runtime credential broker 补齐一组可审计的源码适配器：
受控 Supabase Preview 目标解析、一次性管理凭据传输、独占管理连接、独占 runtime
PostgreSQL 连接，以及把这些边界组合进 M1l resolver/runner 的 TestOnly composition。

这仍不是已上线能力。所有正式 `READY` latch 均为 `false`，approved export 均为
`undefined`，公开 factory 固定 fail closed；只有显式 TestOnly capability、依赖注入和
完整契约校验可以构造测试 bundle。M1m 没有应用 Production migration、没有部署、没有
调用 provider/model、没有产品流量，也没有接触真实护理数据。

| 模块 | policy digest | source SHA-256 |
|---|---|---|
| target | `18f77b59a92c65b58fac4090fa3b16e8c6281dedca8b11903cf09f7cf2e361d2` | `f2317b112215df56ec344a9910b8c1ff092c49900a5c813c08852f364c622cb1` |
| broker | `1498ea8e26014afcfc02a6f418f5eec783dd58a7485673d51edb04bef965fb0e` | `5a12b9d4c28fc963383dfa3643bdd2cf1d9fcec681e534750ef0324f9c901daa` |
| management session | `2dc462675834a2741941e5b11a0f277cfbc6d08c6a0b4edc04346aa97dd59ce3` | `9413f751c9f41941f2444792c56072c86d20fff2d2947af87cd82aac31add2e7` |
| runtime PostgreSQL session | `75d7aae46d34a6de369b68e57d448f6aa0a8267d14b4ed097081bd306c131f09` | `9b60786fc55c83df578885076ea2199a4b88106144c1899aa7005ee6940fda07` |
| composition | `7dd9bdc893147146a2e519b59f71cb958b9afdf2117589bf8ca42239a1ac1dc5` | `74f1fde8e1dcbaff3106e327197e93a0da508d0d2523c615e037f2de0373260d` |

## 适配器边界

| 层 | 固定边界 |
|---|---|
| target resolver | 仅接受无数据、非默认、非持久、非 Production、`ACTIVE_HEALTHY` 的 PostgreSQL 17 Preview；端口固定 5432，连接模式只允许 direct 或 Supavisor session；控制面观察、project-ref HMAC 与 pinned CA loader 必须是三个独立注入端口 |
| sealed target | 公共 descriptor 不含 project ref、hostname 或证书；私有 project ref、endpoint 与 CA bytes 保存在 `WeakMap` capability 中，并与 descriptor canonical SHA-256、受信 resolver clock 和单调读取顺序绑定 |
| management credential transport | 密码只能穿过一次性 delivery callback；credential 必须绑定 target descriptor、CA digest、派生 user 与固定 application name。Supabase branch admin source 明确为静态、非一次性且只能通过 branch delete/password reset 撤销；不超过 60 秒且不晚于 target 的限制只属于 delivery envelope |
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
`deliveryIssuedAt`、`deliveryExpiresAt`、`deliveryOneUse` 证明 callback 的单次短时交付。
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
- M1n 已增加 source-pinned、default-off 的 Hosted harness，但本批次没有创建新的
  Preview，也没有执行它。真实 PostgreSQL 17 driver/TLS/PID/cleanup gate 仍留给得到
  独立授权的后续 disposable no-data Preview；详见
  `documentation/communication-note-preview-approved-runtime-hosted-harness-m1n.md`。

## 验证与后续 gate

最终同一源码通过 M1m/M1n 十文件聚焦 151/151（含 runtime boundary 12/12）、完整
Vitest 187 files / 2,547 tests、`tsc --noEmit`、全仓 ESLint、Node runner syntax、tracked
与全部新增文件 whitespace check、73-file Codex adapter sync，以及 Next.js 16.2.9 Webpack
production build（64/64 pages）。独立复核最终为 P0=0、P1=0。这些本地结果只能证明
source contract 一致，不表示部署或 Production greenlight。

下一 gate 是同 revision source review/merge。随后若要实际接通 AI 应用，仍需分别取得：

1. disposable no-data PostgreSQL 17 Preview、真实 `pg` driver 和 pinned-CA/Abort 行为的
   明确授权与 same-revision 证据；
2. approved target resolver、控制面身份、KMS/Vault credential transport、部署身份与
   runtime dependency 的审查；
3. Production migration、部署与 activation 的独立授权；
4. provider/model evaluation、费用与产品流量的独立授权。

在这些 gate 完成前，M1m 不启用 Product API route，不产生模型调用，不写 Production，
readiness/approval 保持 false/undefined。
