# Communication Note Preview product runtime GCP adapters M1u

## 状态与结论

M1u 选择 Google Cloud 作为 M1t provider-neutral 协议的首个具体平台目标：Vercel
Preview workload 通过 Workload Identity Federation（WIF）换取短时 Google 身份，再由
purpose-separated Cloud KMS HMAC keys、regional Secret Manager secrets 和 Supabase
Management API OAuth app/grant 实现 M1s/M1t 已冻结的端口。

本 handoff 同时记录已确认的选择、外部设置进度和已经通过本地验证的默认关闭 source-only
provider protocol seam；它不宣称平台接线已经完成。Google Cloud project
`careslink-m1u-security`（project number
`288554824534`）已经创建，但尚未关联 billing account。因此 WIF pool/provider、runtime
service account、IAM binding、KMS key ring/keys/versions、Secret Manager
secrets/versions 均尚未创建。Vercel 已选择 Team issuer；Supabase OAuth App 表单已填入
Environment Read-only，但 **Confirm 尚未点击**，所以 OAuth app/client credential、授权 grant、
access token 与 refresh token 均不存在。

正式状态保持关闭：`READY=false`，approved export absent，Product API route/importer、
Preview deployment 与 activation 均不存在。version 为
`gcp-adapters.communication.openai.synthetic-preview.2026-09-01.m1u.v1`，policy digest 为
`5a0b358626f1864cd13584e4abadf79254e5d365911b28586666e58a76c76c36`。
本地 source closeout 已通过 M1u/runtime-boundary 2 文件 24 项、M1s/M1t/M1u/runtime-boundary
4 文件 102 项、全量 191 文件 2,667 项、TypeScript、full ESLint、`git diff --check`、
64/64-page production build 与 24-chunk server-only leak scan。live deployment source
revision 与 live evidence 仍为 `TBD`；这些本地结果不得描述为 resource existence、真实 federation、
OAuth grant、数据库或部署证据。

本批没有创建 Supabase Preview、没有连接 Preview 或 Production PostgreSQL、没有执行 SQL 或
migration、没有读取 Production 或真实 care data、没有调用 provider/model，也没有产生 AI
费用或产品流量。

## 已确认与未完成的外部设置

| 平台 | 已确认状态 | 仍未发生 |
|---|---|---|
| Google Cloud | project `careslink-m1u-security` / number `288554824534` 已创建；regional resource location 选择 `australia-southeast1` | billing 未关联；API enablement 尚未在本 handoff 验证；WIF、service account、IAM、KMS、Secret Manager resource 均未创建 |
| Vercel | Team issuer 已选择；team/project pins 已确认 | 没有 M1u Preview deployment、route、environment secret 或 GCP federation live exchange |
| Supabase | OAuth App 表单名、website、redirect URI 与 Environment Read-only 已填写 | Confirm 未点击；app/client id、client secret、grant、access/refresh token 均不存在；没有 Preview 或数据库连接 |

Google Cloud project 的存在不等于 runtime identity 或 secret custody 已存在；Vercel issuer 的
选择也不等于某个 deployment 已取得 GCP 权限；Dashboard 表单尚未 Confirm 更不能描述为已
创建 OAuth credential。

## 固定 resource pins

### Vercel workload

| 项目 | 固定值 |
|---|---|
| team slug | `millionlunas-projects` |
| team id | `team_cFWfAk6zAa0b7X5bc1ONT4SA` |
| project name | `careslink-ai` |
| project id | `prj_AtdTukVr39wrGH9PYgKusfku2gvS` |
| issuer mode | Team |
| issuer | `https://oidc.vercel.com/millionlunas-projects` |
| normal Vercel audience | `https://vercel.com/millionlunas-projects`；只作默认值记录，不用于 GCP exchange |
| required environment | `preview`；`production` / `development` 均拒绝 |
| required subject | `owner:millionlunas-projects:project:careslink-ai:environment:preview` |

除 issuer/audience/subject 外，verifier 必须同时核对 immutable `owner_id` 与 `project_id`，并
把 `owner`、`project`、`environment`、`iat`、`nbf`、`exp` 与 source-target attestation 一起
验证。名称 claim 与 ID claim 缺一不可；名称变化或 ID 不匹配都 fail closed。

### Google Cloud workload identity

| 项目 | 固定值 |
|---|---|
| project id / number | `careslink-m1u-security` / `288554824534` |
| regional location | `australia-southeast1` |
| WIF pool / provider | `vercel-careslink-preview` / `vercel-team-preview` |
| provider resource | `projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview` |
| runtime service account | `careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com` |

两种 audience 表示必须逐字节区分：

- `@vercel/oidc` 的 `getVercelOidcToken({ audience })` 请求 exchanged token 时，token `aud`
  固定为
  `https://iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`；WIF provider 的 Allowed audiences 只允许该值。
- `google-auth-library` `ExternalAccountClient` 配置中的 `audience` 固定为
  `//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`。

不得把 Vercel 的默认 audience、上述 `https://` token audience 与 external-account 的
`//iam.googleapis.com/` resource audience 互换或做宽松归一化。使用 provider-specific custom
audience 是 confused-deputy 防线，不得回退到任意 caller-supplied audience。

### Cloud KMS 与 Secret Manager

KMS key ring 固定为
`projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview-m1u`。
下列 HMAC key 都必须使用显式 numeric version `1`，禁止 `primary`、`latest` 或运行时发现：

1. `hmac-workload-identity-v1/cryptoKeyVersions/1`；
2. `hmac-deployment-source-target-v1/cryptoKeyVersions/1`；
3. `hmac-supabase-project-ref-v1/cryptoKeyVersions/1`；
4. `hmac-source-manifest-v1/cryptoKeyVersions/1`。

regional secrets 固定为以下完整 numeric version `1`，禁止 `latest`：

1. `projects/careslink-m1u-security/locations/australia-southeast1/secrets/supabase-management-oauth-credential/versions/1`；
2. `projects/careslink-m1u-security/locations/australia-southeast1/secrets/supabase-preview-pinned-ca-pem/versions/1`；
3. `projects/careslink-m1u-security/locations/australia-southeast1/secrets/supabase-preview-branch-admin-password/versions/1`。

以上都是 **planned pins**；当前没有对应 resource 或 version，因而也没有 KMS、secret-access、
CRC32C、rotation、disable、destroy 或 teardown evidence。

source-manifest 的 build/attestation signer identity 仍是 `TBD`，且不得默认为 runtime service
account。该 identity 未固定、未审查前，`hmac-source-manifest-v1` 不能形成可信 live
attestation。

## 候选 supply-chain pins

当前 M1u source worktree 与 lockfile 固定以下 exact versions：`@google-cloud/kms@5.7.0`、
`@google-cloud/secret-manager@6.3.0`、`@vercel/oidc@3.8.5`、`fast-crc32c@2.0.0`、
`google-auth-library@11.0.2` 与 `jose@6.2.10`。lockfile、tests、TypeScript、ESLint 与 build
已通过；当前 source seam 只使用 `jose` 与 `fast-crc32c`。Google/Vercel SDK packages 尚未接入
concrete bridge，因此不得把“已安装并锁定”写成“已验证真实 SDK 调用”或“已部署”。

### Supabase target 与 OAuth app

| 项目 | 固定值或当前状态 |
|---|---|
| organization id | `dupupgakxfikiqeqseej` |
| Production parent ref | `adocsnwnslxhxcjgbyee`；永远不是 SQL target |
| OAuth app name | `Careslink AI M1u Preview` |
| website | `https://careslink.com.au` |
| redirect URI | `http://localhost:32119/m1u/supabase/oauth/callback` |
| app scope | Environment Read-only；其他 scope No access |
| allowed Management API request | only `GET https://api.supabase.com/v1/projects/adocsnwnslxhxcjgbyee/branches`；no query、no redirect、zero retry |
| app/grant reference pins | raw identifiers 尚不存在；Confirm + authorization 后只保留 canonical metadata SHA-256 references |

## Supabase OAuth scope 与 fine-grained permission 的区别

Supabase Management API 文档对同一个 list-branches endpoint 同时列出两套授权模型：OAuth app
使用 `environment:read` scope；fine-grained token 则需要
`branching_development_read` 或 `branching_production_read` permission。它们不是一个 token 上
必须同时出现的两个 claims，也不能互相推导。

M1u 明确采用 **Supabase OAuth app scope model**：

- app 配置固定为 Environment Read-only，即 `environment:read`；
- 不声称 OAuth access token 带有或可证明 `branching_development_read`；
- 更不请求或声称 `branching_production_read`；
- control-plane evidence 通过 pinned OAuth app metadata 与实际 authorization grant 的两个
  canonical SHA-256 reference pins，连同 exact endpoint allowlist 证明授权边界；
- raw app id、grant id、client secret、authorization code、access token、refresh token、header
  和原始响应不得进入 evidence 或日志。

当前 worktree 的 M1s/M1t v2 contract 已采用相同区别并完成本地 source closeout；它仍未因此
自动成为已合并、已部署或已运行的 fine-grained permission evidence。

参考：
[Supabase OAuth app scopes](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes)、
[List all branches](https://supabase.com/docs/reference/api/v1-list-all-branches)、
[Build a Supabase integration](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration)。

## 最小 IAM 设计

1. WIF provider 必须验证 exact issuer、provider-specific `https://` audience、team/project
   slug/name + immutable IDs、`preview` environment 与 token freshness。只把 exact mapped
   principalSet 绑定到 runtime service account 的 `roles/iam.workloadIdentityUser`；禁止 pool
   wildcard、其他 provider、Production 或 Development principal。
2. 不创建或下载 service-account key。Vercel workload 只能经 WIF/STSv1 取得短时凭据；任何
   JSON key、长期 access key 或本地 ADC fallback 都 fail closed。
3. runtime service account 不得拥有 Owner、Editor、IAM Admin、Service Account Admin、KMS
   Admin、Secret Manager Admin、OAuth app administration、branch write 或 Production
   database 权限。
4. KMS 权限必须按 exact CryptoKey 收窄。三个 runtime-binding HMAC keys 只授予运行所需的
   `cloudkms.cryptoKeyVersions.get`、`useToSign` / `useToVerify` 最小集合；source-manifest signer
   与 runtime verifier 必须分离，runtime 不得取得 source-manifest `useToSign`。若预定义
   `roles/cloudkms.signerVerifier` 比所需权限更宽，应使用 reviewed custom roles，不得把宽角色
   授予 project 或 key ring。
5. `roles/secretmanager.secretAccessor` 只绑定到上述三个 exact secret resource，不在 project
   层授予。SDK 请求必须使用 explicit regional endpoint 与 numeric version `1`；即使 IAM 可见
   其他版本，adapter 也必须在访问前拒绝别名、其他 version 和其他 secret。
6. provisioning operator 与 runtime service account 分离。创建/设置 IAM、KMS/Secret resource、
   OAuth app/grant 或 billing 的人工权限只在经批准的 provisioning batch 使用，不能留给
   runtime。

参考：
[Vercel OIDC reference](https://vercel.com/docs/oidc/reference)、
[Vercel custom audiences](https://vercel.com/changelog/custom-oidc-token-audiences)、
[Google WIF best practices](https://cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)、
[Secret Manager access](https://cloud.google.com/secret-manager/docs/manage-access-to-secrets)。

## Secret custody 与撤销边界

- `supabase-management-oauth-credential` 的候选 schema 只接受短时 access token、app/principal
  与 grant/credential 的 canonical SHA-256 references、`observedAt` 和 `expiresAt`；access token
  在未来 concrete HTTPS port 中只能经单次 callback 交付；当前 TestOnly seam 不写环境变量、
  argv、stdout/stderr、普通 JSON config 或 evidence。OAuth client secret、authorization code
  与 refresh token **不属于该 secret
  version**；它们的授权/交换/刷新 custody 尚为独立 `TBD` blocker，不能被暗中塞入当前 payload
  或在 runtime 内临时发明。
- `supabase-preview-pinned-ca-pem` 只保存本次 exact Preview 当前 CA PEM；CA 不是 bearer
  credential，但必须有独立 expected SHA-256、size/PEM/X509 校验并禁止 private key。旧 branch
  或旧 digest 不得复用。
- `supabase-preview-branch-admin-password` 保存 exact child 的静态 `postgres` password。它不是
  短期 credential；60 秒只约束 M1m one-use callback delivery。最终撤销仍是 exact branch
  delete 或 password reset。Secret version disable/destroy 不能替代 branch deletion。
- Secret Manager CRC32C、resource name、version、payload length 与 expected digest/shape 必须在
  callback 前验证；原始 payload 不进入异常文本。JavaScript/SDK process-memory zeroization 仍
  未被证明，不得声称内存零残留。
- 一次性 live gate 默认在 branch 删除后撤销 Supabase grant/token 并 disable secret versions；
  是否保留 OAuth app、WIF、KMS 或 secrets 供后续 Product Preview 使用，必须由 owner 在 teardown
  前单独确认。KMS version destroy、secret destroy、OAuth app delete 等不可逆动作不得从本
  handoff 自动推断授权。

## 当前 source 与 live blockers

默认关闭的 M1u protocol seam 已与 M1t v2 的 OAuth evidence 和 database-password custody request
shape 对齐；OIDC precheck 现逐项固定 issuer、custom audience、subject、immutable IDs、名称、
`preview`、`iat`、`nbf`、`exp` 与 `jti`。descriptor-safe exact-object validation、Proxy/symbol/getter
拒绝、独立 callable、uint32 CRC32C、monotonic clock、OAuth evidence freshness、manifest response
integrity，以及 CA digest/PEM/X.509 CA/private-key rejection 均有本地负测。上述旧静态 mismatch
不再是 blocker。

M1u 仍不能与 M1t 形成可运行或可部署 bundle，且 provisioning/live gate 保持 **NO-GO**：

1. 当前只有 injected-client TestOnly seam，没有 M1t 所需的 concrete Supabase Management HTTPS
   port，也没有真实 `@vercel/oidc` → GCP WIF/STS/service-account impersonation → KMS/Secret Manager
   SDK normalization。五秒 timeout、同一 AbortSignal、no redirect、zero retry 和 SDK response
   normalization 仍须实现与负测。
2. 独立 source-manifest build signer identity、canonical artifact producer、revision-to-deployment
   传递、anti-replay 与 signer/runtime IAM 分离尚未固定。runtime service account 不能获得
   source-manifest sign 权限。
3. Supabase OAuth app/grant 仍不存在；actual canonical app/grant references、client-secret/code
   intake、refresh/revoke custody、401 handling 与 live scope evidence 尚未闭合。
4. 在上述 bridge 完成后，仍需 M1u→M1t→M1s→M1r→M1m composition smoke、同一 revision review
   与 source-manifest artifact evidence，才能进入 resource provisioning 和一次性 Preview gate。

后续源码修复必须继续保持 `READY=false`，以 focused/full tests、build 和 leak scan 做同 revision
closeout。当前不得运行 live gate、不得把 provider flags 改为 true，也不得创建 Product API importer。

## Action-time confirmation blockers

以下每项都改变外部状态、权限、费用或 secret custody；在执行当刻必须重新展示 exact target
与影响并取得明确确认：

1. 为 `careslink-m1u-security` 关联 billing account，并确认 KMS、Secret Manager、WIF/STS、
   logging 与可能的 network/egress 费用；
2. 启用所需 Google APIs，创建 exact WIF pool/provider、service account 与最小 IAM bindings；
3. 创建 regional key ring、四个 HMAC keys 和 numeric version `1`；
4. 创建三个 regional secrets/version `1`、写入实际 credential/CA/password，并授予 exact
   secret access；
5. 在 Supabase Dashboard 点击 OAuth App **Confirm**，安全接收新 client credential，随后由
   用户完成 OAuth authorization/PKCE grant；
6. 在 Vercel 配置或部署任何会让 M1u route/importer 可达的 Preview runtime；
7. 读取当时 Supabase branch 实时价格、创建 fresh no-data/non-default/non-persistent Preview、
   取得 branch credential、执行同 revision live gate，并无论成功或失败删除 exact branch；
8. Production migration、Production deployment/alias/env、provider/model evaluation、真实产品
   流量与 activation；这些仍是彼此独立的后续授权，不包含在 M1u provisioning 中；
9. 固定并审查独立 source-manifest build signer identity；runtime service account 不得同时
   获得该 source-manifest key 的签名权；
10. 删除或安排销毁 KMS version、secret、WIF/IAM、OAuth grant/app 等 material external
   resources；teardown 也必须明确确认，不因“测试结束”自动扩大为 destructive authority。

在 billing 仍未关联、OAuth app 尚未 Confirm 且 concrete bridge/signer/OAuth custody 尚未闭合的
当前状态，下一步只能先实现和审查这些 live blockers，再选择一个经 action-time 确认的
provisioning batch；不得运行 live gate，不得把 `READY` 改为 true，也不得创建 Product API
importer。
