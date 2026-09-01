# Communication Note Preview product runtime identities M1s

## 状态与结论

M1s 新增唯一的 server-only、default-off 身份与凭据保管组合边界：
`communication-note-preview-product-runtime-identities.server.ts`。它在 M1r
外层先验证一个显式注入的短时部署身份证明，再把同一身份证据绑定到一次原子的
Supabase 控制面身份与目标观察；project-ref HMAC、固定 CA 读取和管理凭据消费都必须
携带同一 source revision、部署身份证据摘要及控制面证据摘要。

这仍不是实际平台实现或运行激活。正式 factory 固定抛出
`PRODUCT_API_DISABLED`，`READY=false`，approved export 为 `undefined`。模块不读取
环境变量，不接收 PAT、OAuth token、API secret、数据库密码、DSN、host 或 CA 正文作为
composition 配置，也不拥有 Supabase/OpenAI SDK、网络调用、Secret Manager 或部署身份
adapter。唯一 TestOnly path 只验证和包装显式注入的端口，然后返回原 M1r/M1m frozen
high-level bundle；只保留原有 content-free `databaseTarget` descriptor，不导出部署身份、
raw project ref、endpoint、CA、credential transport 或 raw credential。

本批次没有创建或修改 Supabase 资源，没有执行 SQL、应用 Production migration、部署
Vercel、调用 provider/model 或处理真实 care data。

## 固定契约

| 项目 | 固定值 |
|---|---|
| identities version | `identities.communication.openai.synthetic-preview.2026-09-01.m1s.v1` |
| policy digest | `4c33184016b7335e39918715b79351673141c3f41c966b34b5b7a617d0a44db2` |
| source status | `SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED` |
| deployment audience | `CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME` |
| environment class | `NON_PRODUCTION_PREVIEW` |
| control-plane source | `SUPABASE_MANAGEMENT_API` |
| required permission class | `BRANCHING_DEVELOPMENT_READ` |
| maximum identity age / remaining | 5 minutes / 5 minutes |
| underlying credential class | `STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD` |
| source credential expiry | `null` |
| source revocation | `BRANCH_DELETE_OR_PASSWORD_RESET` |
| delivery envelope | one-use；maximum 60 seconds |
| activation | `false`；approved export absent |

Policy 绑定 M1r product composition digest
`1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0` 与 M1m
target digest
`18f77b59a92c65b58fac4090fa3b16e8c6281dedca8b11903cf09f7cf2e361d2`。
`deploymentIdentityImplementationPresent`、`controlPlaneIdentityImplementationPresent`、
`credentialTransportImplementationPresent` 与 `secretManagerImplementationPresent` 全部保持
`false`；`sourceRevisionAttestedByModule=false`，因为 source revision 仍是调用方 pin 与注入
attestation 的精确匹配，而不是模块自行证明其 transitive build revision。

## 私有信任链

TestOnly factory 只接受 exact plain-object 的十二项输入：capability、expected source
revision SHA-256、deployment identity attestation port、authenticated control-plane
observation port、project-ref HMAC port、pinned-CA loader、management credential custody
port、target request、verified authorization、runtime custody resolver、clock 与 entropy。
八个端口对象和函数必须相互独立；Proxy、accessor、missing/extra/symbol key、null prototype、
非单调 clock 与已 Abort context 均 fail closed。

信任链顺序固定为：

1. 注入的 deployment attestor 接收 source revision、目标 ref 与 CA digest，返回 audience、
   environment、revision 精确匹配且新鲜的 content-free identity observation；M1s 对完整
   request + observation 做 canonical SHA-256 聚合。
2. 单次 authenticated control-plane port 原子返回 control-plane identity 与 branch
   observation，避免“先证明身份、后读目标”的两步替换窗口。身份必须是非 Production
   permission class，观察仍需通过 M1m 的 non-default、non-persistent、with-data=false、
   PostgreSQL 17、`ACTIVE_HEALTHY`、Direct/Session 5432 与 pinned-CA 全部校验。
3. M1s 对 deployment evidence、control-plane identity、完整 observation 与 source revision
   再做 canonical SHA-256 聚合。目标有效期取部署身份、控制面身份与观察有效期的最早值。
4. target/Production project-ref HMAC 与 CA loader 请求都加入两层聚合证据；随后由 M1m
   继续执行不同 HMAC、相同 key reference、CA byte digest 与 sealed WeakMap target 校验。
5. 每次 management open 时，M1s 私有 transport 把 source revision、两层证据、target
   descriptor、CA、user、application、credential source semantics、factory nonce 与 delivery
   deadline 一并绑定后才委托 custody port。callback exact-once、late/double/replay、delivery
   freshness 与密码形状仍由 M1m 执行；M1s 不读取、hash、记录或返回密码。

所有端口都只是 TestOnly source contract。上游返回的 content-free attestation 不能单靠
普通 JSON 自证真实云身份；未来正式 adapter 必须由实际工作负载身份、管理 API 授权、
KMS/HMAC 与 secret custody 系统产生并接受独立运行证据。

## Supabase credential 语义

M1s 没有把现有静态 branch admin password 伪装成短时 secret。60 秒限制只属于 M1m 的
delivery envelope；底层 password 仍可复用，`sourceExpiresAt=null`，只能通过 branch delete
或 password reset 撤销，且 JavaScript process-memory zeroization 没有被证明。

截至 2026-09-01，Supabase Management API PAT 权限等同签发用户，应只留在受信后端；
publishable/anon 与 secret/service-role 是 Data API key，其中 secret/service-role 会绕过 RLS，
但它们都不是 PostgreSQL password 或 Management API identity。Temporary Access 是另一套
Postgres/Supavisor JIT role mapping；若未来采用，必须另起 M1m credential-class/policy/live
gate，分别建模 token expiry、database authorization expiry 与 revocation，不能在 M1s 中把
它塞入 `STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD`。

参考：
[Management API authentication](https://supabase.com/docs/reference/api/introduction)、
[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、
[Temporary Access](https://supabase.com/docs/guides/platform/temporary-access)。

## 隔离与后续 gate

M1s module 的 direct importers 现在精确为自己的测试、M1t 测试与 M1t source module；
`src/app` 与 `src/components` importer 仍均为零。
M1t source module 自身的 direct importer 仅为 M1t 测试。
M1r 仍是唯一非测试 `pg` importer，M1s 不新增 package 或 lockfile 变化。静态边界禁止环境
读取、Supabase/OpenAI SDK、fetch、HTTP/TLS socket、DSN、connection string、credential
环境名与日志 sink；production build 后继续扫描 client chunks 中的 M1r/M1s/M1t
version/status/digest 与 secret sentinel。

同一未部署源码通过 M1s/M1r/M1m-target/runtime-boundary 聚焦 4 files / 76 tests，以及
完整 Vitest 189 files / 2,609 tests。TypeScript、全仓 ESLint、73-file Codex adapter sync、
`git diff --check`、package/lock 相对 M1r exact-no-change、Next.js 16.2.9 Turbopack 64/64-page
production build 与 24-file client-chunk scan 均通过。首次沙箱内 build 因 Turbopack CSS
worker 无权绑定本地端口而失败；在获批的沙箱外以同一源码重跑后成功，这不是源码或测试
失败，也没有启动可访问部署。

M1s 只关闭“默认关闭的身份、控制面观察与凭据保管 source composition 契约”这一项。
M1t 已完成并验证 provider-neutral、source-only、default-off 的平台协议适配器：
Management API 只允许 `GET /v1/projects/{production_ref}/branches`；会返回 `db_pass` 与
`jwt_secret` 的 branch-config endpoint 必须固定禁止；Vercel OIDC 还必须叠加独立的
source-manifest attestation。M1t 不选择供应商、不创建资源，也不改变本模块的
`READY=false`、正式 factory 固定关闭或 approved export absent。

进入真实产品接线前仍需分别授权并完成：

1. 由 M1u 另行选择和授权真实 deployment workload identity、Supabase Management API OAuth、
   KMS/HMAC、pinned-CA custody 与 secret-manager
   transport，确认费用、创建资源并产生同 revision 运行证据；
2. Product API route/importer wiring、Production migration、Vercel deployment 与 activation；
3. provider/model evaluation、费用、真实产品流量与人类语义验收。

完成这些 gate 前，不得把 M1s 描述为已配置云身份、已接入 Vault/KMS、已连接数据库或 AI
应用已上线。

详见
[`communication-note-preview-product-runtime-platform-adapters-m1t.md`](communication-note-preview-product-runtime-platform-adapters-m1t.md)。
