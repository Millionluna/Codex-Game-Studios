# Communication Note Preview product runtime provider bridges M1v

## 状态与结论

M1v 在 M1u 的默认关闭 provider protocol seam 之上新增两套 **source-only、默认关闭**
bridge：一套把 Vercel OIDC、Google WIF、service-account impersonation、Cloud KMS 与
regional Secret Manager 串成受限的 Node direct-REST bridge；另一套把一次性 custody intake
中的 Supabase OAuth client credential/refresh token 换成短时 Management API access token，
并只提供 M1t 允许的 list-branches HTTPS port。

两套正式 export 都不存在，正式 factory 固定 fail closed，`READY=false`、
`deploymentApproved=false`、`activationApproved=false`。唯一可构造路径要求显式 TestOnly
capability，供 source tests 使用；它不是 deployment wiring，也没有让 route、importer 或
Product API 可达。

| bridge | version | policy digest | 正式状态 |
|---|---|---|---|
| GCP direct REST | `gcp-rest-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1` | `c116c449fb025ecaca156e952d37b812c7dd272258120f677c8cef1e202326e3` | `READY=false`；formal export absent；source-only |
| Supabase Management | `supabase-management-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1` | `2c4c87bb7a15f3b101fd78c4438f44ed8b2e6dd28f782a615b92f87029e43c68` | `READY=false`；formal export absent；source-only |

M1v source 批次本身没有创建或改变任何 GCP WIF/IAM/KMS/Secret Manager resource，没有生成
service-account key，也没有创建 Supabase OAuth app/grant/token 或 Preview branch。随后获批的
外部操作只创建了最小权限 Supabase OAuth App；未创建 grant/token/Preview，没有连接
Preview/Production PostgreSQL，没有读取真实 care data，没有部署，也没有调用 AI provider/model。所有已运行的
bridge 与 composition evidence 都来自 injected/fake transport 的本地 source tests；没有 Node
transport live evidence。

## GCP direct-REST exact chain

GCP bridge 固定使用以下单向链路，顺序、origin、audience 与 resource pin 都不能由 caller
改写：

1. 通过 `@vercel/oidc.getVercelOidcTokenSync` 取得当前 Vercel workload 的 base token；
2. 仅向 `POST https://oidc.vercel.com/~token` 发送该 token，并把 custom audience 固定为
   `https://iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`；
3. 仅向 `POST https://sts.googleapis.com/v1/token` 执行 RFC 8693 token exchange，external-account
   audience 固定为
   `//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`；
4. 仅向 IAM Credentials
   `projects/-/serviceAccounts/careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com:generateAccessToken`
   换取最多 3,600 秒的 runtime service-account access token；
5. 仅用该短时 token 调用 pinned Cloud KMS `macSign` / `macVerify` 与
   `https://secretmanager.australia-southeast1.rep.googleapis.com` 的 regional Secret Manager
   `access`。

project 固定为 `careslink-m1u-security` / `288554824534`，region 固定为
`australia-southeast1`，WIF pool/provider 固定为
`vercel-careslink-preview` / `vercel-team-preview`。`macSign` 只允许 workload、deployment 与
project-ref 三把 runtime HMAC key；`macVerify` 只允许独立的 source-manifest verification key，
因此 runtime source 在 I/O 前就不能使用 manifest key 签名。三个 regional secret version 继续
使用完整 numeric version `1` allowlist；禁止 `latest`、`primary`、caller-supplied resource、
ambient ADC 与 service-account JSON key。

每个 HTTPS operation 都是 single shot：automatic retry 为 `0`，redirect 固定为 error，独立
wall-clock deadline 固定为 5 秒，并要求从 composition root 到 Vercel exchange、STS、impersonation、KMS 与 Secret
Manager 传递同一个 `AbortSignal`。request/response 有固定 byte cap；KMS 与 Secret Manager
响应在交付给 M1u port 前验证 exact resource、numeric version、shape、CRC32C 与长度边界。
access token 与 secret material 不作为返回 evidence 或日志内容。

这里使用 direct REST，而不是把 GAPIC client 当成完成证据：当前严格 contract 需要在每个
network boundary 证明 zero retry、5 秒 deadline、redirect rejection 与同一 root
`AbortSignal`。这只是 source implementation 选择；在真实 Node runtime 上执行和审查该
transport 仍是独立 blocker。

## Supabase OAuth 与 Management API bridge

Supabase bridge 固定采用 OAuth App 的 `environment:read` scope model；它不把
`branching_development_read` 或 `branching_production_read` fine-grained-token permission
伪装成 OAuth claim。唯一 Management API data request 仍是：

`GET https://api.supabase.com/v1/projects/adocsnwnslxhxcjgbyee/branches`

一次 bundle 的 credential 生命周期固定如下：

1. 先从显式 one-use intake custody callback 接收 client id、client secret、refresh token，及
   app/grant/principal/credential 的 canonical SHA-256 references；raw credential 不进入
   evidence；
2. 在第一次 Management credential consume 前，主动且最多一次向
   `POST https://api.supabase.com/v1/oauth/token` 发送 Basic-auth refresh request；不等待第一个
   branches request 返回 401 才刷新；
3. 接受任意 2xx token response，验证 bearer access token、`expires_in` 与可选 rotated refresh
   token；若 response 带 `scope`，它必须精确为 `environment:read`。向下游 attestation 暴露的
   有效期最多为 5 分钟，并在同一 bundle 内复用该 credential；raw access token 只在当前
   credential callback 打开期间可用于 Management HTTPS port，callback 关闭后立即失效；
4. rotated refresh token **不持久化**。当前没有独立、经审查的 token writer，因此 response
   中即使出现新 refresh token 也不会写入 Secret Manager、环境变量、文件、日志或 evidence；
5. list-branches request 本身也是 single shot、5 秒 timeout、no redirect、zero retry，并使用
   同一个 root `AbortSignal`。如果返回 401，bridge 立即把本 bundle access 标记为 revoked；
   **不再次刷新，也不 replay 原请求**，后续请求继续 fail closed。

OAuth refresh 与 branches response 都有固定 byte cap 和 shape/content-type/status validation。
raw client secret、refresh token、access token、Authorization header 与原始 app/grant identifier
不会进入固定错误文本。

## Actual source composition smoke

M1v source tests 已把两套 bridge 与现有真实 source modules 组合为：

`M1u → M1t → M1s → M1r → M1m`

该 smoke 在 injected fake HTTPS/KMS/Secret transport 上完成 OAuth refresh、唯一 list-branches
GET、四个 purpose-separated KMS MAC operation 与 pinned CA secret access，并取得最终 M1m
bundle。composition 阶段没有构造 PostgreSQL Client，没有读取 branch-admin password，也没有
调用 terminal database credential custody resolver。这个结果证明 source port shape 与调用顺序
能够闭合；它不证明真实 WIF、IAM、KMS、Secret Manager、Supabase OAuth、网络、TLS、数据库或
deployment 已经工作。

## Source verification

本 revision 的收口门禁通过：6 个聚焦文件 / 82 项测试、全量 194 个文件 / 2,683 项测试、
TypeScript、全量 ESLint、73 文件 Codex-adapter 同步检查、`git diff --check`、64/64 页生产构建，
以及 fresh build 上 24 个静态 chunk 的 M1r/M1s/M1t/M1u/M1v server-only marker leak scan。
其中 GCP Node transport 的绝对 5 秒 deadline 由 fake timer 覆盖；M1v integration 使用实际
GCP REST bridge → M1u 与实际 Supabase bridge → M1t/M1s/M1r/M1m，而不是旧 M1u mock。
这些仍全部是本地 source evidence。

## 当前外部状态与 blockers

- GCP project `careslink-m1u-security` 已存在，但没有关联 billing account；当前操作者没有可用
  billing account administrator 权限。因此 API enablement、WIF pool/provider、runtime service
  account、IAM binding、KMS key ring/keys/versions 与 regional secrets/versions 均未创建。
- Supabase OAuth App `Careslink AI M1u Preview` 已创建，website 为 `https://careslink.com.au`，
  callback 为 `http://localhost:32119/m1u/supabase/oauth/callback`，唯一 scope 为
  `environment:read`。raw client id 不写入本文，client-id inventory marker SHA-256 为
  `4b7a6fef8101c33fee65eae04d24cae31f59770773a21cb61af8299702bda77b`。一次性 client
  secret 未持久化到 workspace、环境变量或 credential store；authorization grant、
  access/refresh token 与 canonical app/grant references 均不存在。
- 没有 Vercel M1u/M1v Preview deployment，也没有 live Node HTTPS transport、federation exchange
  或 provider audit evidence。

进入一次性 no-data Preview 之前仍需按顺序闭合：

1. 关联 GCP billing，并创建和审查 exact WIF/IAM/KMS/Secret Manager resources；
2. 固定独立 source-manifest signer identity，生成 canonical artifact，并闭合
   artifact/revision-to-deployment handoff；runtime service account 不得取得 manifest sign 权限；
3. 安全托管或轮换已创建 App 的 client secret，固定 canonical app reference，完成
   authorization grant 和受控 client-secret/code/refresh-token intake，并增加经审查的
   rotated-refresh-token writer；
4. 在同一 revision 上取得 Node transport 的 live 5 秒/Abort/no-redirect/zero-retry 与 provider
   response normalization evidence；
5. 经执行时再次确认价格、exact target 和 teardown 后，创建一次 fresh、无数据、
   non-default/non-persistent Preview，运行同 revision live gate，并无论成功或失败删除 exact
   Preview；Production、真实 care data 与 AI model call 始终不在该批范围内。

在这些 blocker 全部闭合前，formal `READY`、deployment、activation 与 Product API importer
必须继续保持关闭。

## 官方参考

- [Vercel OIDC with Google Cloud](https://vercel.com/docs/oidc/gcp)
- [Vercel OIDC reference](https://vercel.com/docs/oidc/reference)
- [Google Workload Identity Federation best practices](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)
- [Regional Secret Manager quickstart](https://docs.cloud.google.com/secret-manager/docs/samples/secretmanager-regional-quickstart)
- [Cloud KMS `macVerify`](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/macVerify)
- [Build a Supabase OAuth integration](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)
- [Supabase OAuth token endpoint 2xx change](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201)
