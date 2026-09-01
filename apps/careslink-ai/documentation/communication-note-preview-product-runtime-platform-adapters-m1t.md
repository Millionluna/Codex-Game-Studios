# Communication Note Preview product runtime platform adapters M1t

## 状态与结论

M1t 是 M1s 外层的 server-only、source-only、default-off 平台协议适配器切面。它只负责把
受限的 workload identity、Supabase Management API 只读观察、managed HMAC、pinned CA
读取和数据库管理凭据 callback 协议组合成 M1s 已冻结的高层端口。本批不选择或配置
AWS、GCP、Azure、Vault 或其他 KMS/Secret Manager 供应商，也不创建任何平台资源。

正式状态继续固定关闭：`READY=false`，approved export 为 `undefined`，正式 factory 固定
抛出 `PRODUCT_API_DISABLED`，且不得读取或检查传入参数。唯一 TestOnly factory 只接受显式
注入、冻结且相互独立的低层协议端口；它不是 Product API、部署入口或 activation switch。

| 项目 | 固定值或状态 |
|---|---|
| platform-adapters version | `platform-adapters.communication.openai.synthetic-preview.2026-09-01.m1t.v2` |
| source status | `SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED` |
| activation | `false`；approved export absent |
| Supabase Management API method | 仅 `GET` |
| 唯一允许路径 | `/v1/projects/{production_ref}/branches` |
| authorization model | `SUPABASE_OAUTH_APP_SCOPE` |
| OAuth scope | exact `environment:read` |
| scope attestation | `PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT` |
| OAuth references | exact app SHA-256 + grant SHA-256；互不相同 |
| endpoint allowlist | enforced；仅固定 branch-list request |
| fine-grained token permission claimed | `false` |
| PAT | 禁止 |
| connection mode | 仅 Direct `5432` |
| PostgreSQL major | source pin + deployment attestation；数据库 session 再验证 `17` |
| provider selection/configuration | 未选择、未配置 |
| policy digest | `d1cbf263a7c6704f8cf24e58555c24ae2c45f4450b00b37d0f0897ecded76a6d` |
| source verification | M1s/M1t focused 2 files / 78 tests；TypeScript；full ESLint；`git diff --check` |

本批文档与源码验证不会访问 Supabase、Vercel、KMS、Secret Manager 或 PostgreSQL，不执行
SQL、migration、部署或 provider/model call，也不处理真实 care data。

## Supabase Management API 安全边界

控制面适配器的每次观察只允许向固定 origin `https://api.supabase.com` 构造无 query、无 redirect、
零自动 retry 的 `GET /v1/projects/{production_ref}/branches`。初次观察后，在数据库凭据释放前
必须再次构造相同请求并比较 exact safe snapshot。`production_ref` 必须是源码已知的 Production
parent；响应中必须恰好找到一个与请求 child ref 匹配的非默认、非持久、
`with_data=false`、parent 精确匹配且健康的 branch。响应、header、request id 和原始错误都
不得进入公开 bundle、evidence 或日志。

`GET /v1/branches/{branch_id_or_ref}` branch-config endpoint 被明确禁止。Supabase 官方响应
schema 包含 `db_pass` 与 `jwt_secret`；即使调用方只准备读取 host/version，原始响应仍会把
凭据带入控制面进程，违反 M1s 的 `rawCredentialMaterialPresent=false`、控制面观察与数据库
凭据保管分离，以及“数据库密码只能经一次 callback delivery”契约。

Management API identity 必须使用 OAuth App 上配置的 exact `environment:read` scope，并由
可信 custody metadata 绑定 pinned OAuth app reference 与该次 grant reference。Supabase 为
同一 endpoint 另列出的 `branching_development_read` / `branching_production_read` 是
fine-grained token 的权限要求，不是 OAuth access token 可额外自证的 permission；M1t v2
明确不声称该 permission。实际能力收窄由 `endpointAllowlistEnforced=true` 和固定 HTTPS
request 共同执行。PAT 携带签发用户的完整权限，不能由一次成功 GET 证明其没有 Production
权限，因此 M1t 固定拒绝 PAT。OAuth bearer token 只能在私有 callback 内交给 HTTPS port，
不得作为 composition option、普通环境 fallback、返回值或 evidence 字段。

参考：
[Management API authentication](https://supabase.com/docs/reference/api/introduction)、
[OAuth App scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)、
[List all branches](https://supabase.com/docs/reference/api/v1-list-all-branches)、
[Get branch config](https://supabase.com/docs/reference/api/v1-get-a-branch-config)。

## Vercel deployment identity 与 source revision

M1t 本身不读取或验签 Vercel OIDC；它只校验注入 verifier 返回的 content-free workload
observation。issuer、audience、team/project、`preview` environment、token 时效与独立
source-manifest attestation 必须由 M1u 的具体 verifier 完成加密验证。Vercel OIDC 的
标准/附加 claims 不包含 CaresLink source revision，因此 M1t 不能把 OIDC、
`VERCEL_GIT_COMMIT_SHA` 或调用方提供的 hash 单独描述为 source attestation。

TestOnly workload verifier 的有效结果必须同时绑定：

1. 经验证的 Vercel OIDC workload identity；
2. 独立 managed source-manifest attestation；
3. exact source revision SHA-256、target child ref、pinned-CA digest、team/project 和 Preview
   environment，以及固定 `postgresMajor=17` / `connectionMode=DIRECT`；
4. 不超过五分钟的派生 observation/expiry。

未来正式接线还必须说明 source manifest 如何在 build 阶段生成、由哪个不可导出 key
attest、runtime 如何验证 key version 与 artifact，以及部署回滚时如何避免把旧 attestation
复用于新 source。参考：[Vercel OIDC reference](https://vercel.com/docs/oidc/reference)。

## Direct-only、PG17 与 custody 协议

M1t 的最小连接切面只允许 Direct：hostname 必须从已验证 child ref 唯一推导为
`db.{child_ref}.supabase.co`，port 固定 `5432`，database 固定 `postgres`，user 固定
`postgres`。本批不发现或接受 caller-supplied host，也不支持 Session/Transaction Pooler；
未来增加 pooler 必须另有安全、无 secret 的 endpoint provenance。

branch-list 响应不提供可信 PostgreSQL major。`postgresMajor=17` 只能由同 source revision 的
deployment-attested pin 提供，并由下游 M1m 建立真实数据库 session 后再次检查。两项证明
缺一不可；本批没有真实 session，因此不产生 PG17 live evidence。

Managed HMAC、pinned CA、Management API credential 和静态 branch-admin database password
都只通过显式协议端口使用：

- HMAC 请求使用固定 domain/purpose，并绑定 source revision、deployment evidence、
  control-plane evidence、target/Production ref；raw key 永不进入模块。
- CA loader 只返回有界字节副本并核对固定 SHA-256；CA 不是 bearer credential，但仍是 TLS
  integrity authority。
- Management API token 与数据库密码使用不同 custody port，不能交叉替代。
- 数据库密码仍是 `STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD`，`sourceExpiresAt=null`，只能由
  branch delete 或 password reset 撤销；最多 60 秒只约束一次 callback delivery envelope。
- JavaScript/SDK process-memory zeroization 没有被证明，错误和 evidence 不得声称零残留。

这些是 provider-neutral protocol ports，不是已配置的 KMS、CA store 或 Secret Manager。
Management HTTPS request 中的五秒 timeout 是交给低层 HTTPS port 的强制协议字段；M1t 本身
没有网络实现或第二个隐藏计时器。M1u 的具体 provider adapter 必须以测试和运行证据证明它
实际执行该 timeout、同一个 AbortSignal、禁止 redirect 且不自动 retry，不能只接收后忽略字段。

## 本批验证结果与 M1u gate

固定 policy digest、exact seven-export surface、正式 factory hostile Proxy 零 trap、安全 branch-list
请求、可选官方字段、redirect/response URL/content type/body cap、429/5xx、缺失/重复 target、未知
字段、secret-bearing/畸形/重复键 JSON、workload source/PG17/time mismatch、clock rollback、branch
snapshot recheck、Abort 与 sequential/pending duplicate credential callback 均已离线通过。真实
M1t→M1s→M1r→M1m source smoke 通过且 composition 阶段 `pg.Client` 构造数为零；runtime importer
quarantine 与 24 个 client chunks 的 version/status/digest/sentinel negative scan 通过。

本次 v2 OAuth 授权模型修订的实际命令结果为：M1s/M1t focused 2 files / 78 tests、
TypeScript、全仓 ESLint 与 `git diff --check` 全部通过。本批未重跑完整 Vitest、production
build 或 client-chunk scan，因此早期 v1 的更广验证数字不作为 v2 证据。这些仍只是 source
证据，没有读取真实 token、调用 Management API、连接 PostgreSQL 或创建/部署资源；低层
HTTPS port 的真实五秒 timeout 仍须由 M1u provider adapter 实证。

M1t 只关闭 provider-neutral 平台协议源码切面。M1u 必须另行取得明确授权后才能：

1. 选择具体 cloud/KMS/Secret Manager 供应商并批准 pinned resource identities、SDK 依赖与
   supply-chain pins；
2. 确认费用，创建 workload federation、KMS key、CA asset custody、OAuth app/credential 与
   database-password secret/version；
3. 在同 source revision 上形成真实 identity/KMS/secret/Management API 运行证据及 teardown；
4. 再单独进入 Product API route、Preview deployment、Production migration、provider/model
   evaluation 和 activation gate。

完成 M1u 前，不得把 M1t 描述为已配置云身份、已接入 Vault/KMS、已连接 Supabase 数据库或
AI 应用已经上线。
