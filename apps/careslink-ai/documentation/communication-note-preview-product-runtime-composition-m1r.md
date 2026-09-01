# Communication Note Preview product runtime composition M1r

## 状态与结论

M1r 把固定版本 `pg@8.23.0` 从开发依赖晋级为产品运行依赖，并新增唯一的
server-only 产品 composition 源边界：
`communication-note-preview-product-runtime-composition.server.ts`。该模块通过静态
`pg.Client` import 为未来经批准且可达的 Node server build 提供依赖追踪边，同时在模块
加载时校验实际 package name/version、constructor/prototype 形状和 Proxy 状态；校验不会
构造 Client、连接数据库或执行 query。

这不是运行激活。正式 factory 始终抛出固定 `PRODUCT_API_DISABLED`，`READY=false`，
approved composition export 为 `undefined`，且没有 App Route、component 或 Product API
importer。Cold import 与正式 factory 不读取或发现环境、DSN、凭据或目标；M1r 不自行拥有
Supabase/OpenAI SDK 或网络发现。唯一 TestOnly path 只把显式注入的 resolver/transport 委托
给 M1m。本批验证没有调用真实 resolver/credential/database，没有创建 Preview、执行 SQL、
应用 Production migration、部署 Vercel 或调用 provider/model。

## 固定契约

| 项目 | 固定值 |
|---|---|
| composition version | `composition.communication.openai.synthetic-preview.2026-09-01.m1r.v1` |
| policy digest | `1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0` |
| source status | `SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED` |
| runtime package | production dependency `pg@8.23.0` |
| type-only package | development dependency `@types/pg@8.23.0` |
| runtime | Node.js required；Edge 不支持 |
| activation | `false`；approved export absent |

Policy 同时绑定 M1m approved-runtime-adapters policy digest
`8fe10547d33732388f5e6b97afc76da9679d63ae1d45eb04447ae21ac2462e31`。
`next.config.ts` 不需要增加 `serverExternalPackages`：当前 Next.js 已自动将 `pg`
作为 server external package；本批次采用静态 import 作为明确可追踪的依赖边。

## 私有组合边界

正式 factory 不解析任何入参并固定拒绝。TestOnly factory 只接受 exact plain-object 和
八个字段：capability、target resolver/request、verified authorization、custody resolver、
management credential transport、clock 与 entropy。调用方不能提供 `Client`、DSN、host、
CA、数据库密码或环境读取器。

模块把一个私有、已验证的实际 `PgClient` constructor 同时放入 M1m 的 management 和
runtime constructor slots；M1m 后续仍为每个 operation 建立相互分离的实例。M1r 只返回
M1m 原有的 frozen high-level bundle，不导出 constructor、target reader、capability、
credential transport、endpoint、CA 或 raw credential。

Malformed、missing、extra、accessor、null-prototype 与 Proxy options 会在调用 M1m 之前
fail closed。固定关闭路径即使收到 hostile Proxy 也不触发其 get/ownKeys/prototype traps，
错误不包含调用方内容。

## 边界与后续 gate

Source tests 固定以下约束：

- 非测试源码中只有 M1r module 可 import `pg` / `pg/package.json`；
- M1r module 只能由自己的测试 import，`src/app` 与 `src/components` importer 必须为零；
- M1m composition 新增的唯一非测试 importer 是 M1r module；
- package 与 lock importer 必须把 `pg@8.23.0` 归入 production、把
  `@types/pg@8.23.0` 归入 development；
- cold import、policy 读取、正式 factory 与输入拒绝都保持零 Client 构造、connect、query
  和 end；
- 源码禁止环境发现、DSN、网络模块、SDK、日志 sink 与 `new PgClient`。

## 本地验证

同一未部署源码通过 M1r/M1m/runtime-boundary 聚焦 3 files / 36 tests，以及完整
Vitest 188 files / 2,578 tests。TypeScript、全仓 ESLint、73-file Codex adapter sync、
`git diff --check` 与 Next.js 16.2.9 Webpack 64/64-page production build 均通过。
`pnpm list --prod pg --depth 0` 只把 `pg@8.23.0` 列为 production dependency；build 后
scanner 检查 24 个 `.next/static/chunks` 文件，未发现 M1r version、status、policy digest
或 secret sentinel。

这些结果不包含 Hosted/Production 连接、Product API route trace、Vercel deployment 或
provider/model execution。

M1r 只关闭“运行包可安装且产品组合源边界存在”这一项。真实 AI 应用仍需分别完成并授权：

1. approved target resolver、控制面身份、KMS/Vault credential transport 与部署身份；
2. Product API route/importer wiring、Production migration、Vercel 部署和 activation；
3. provider/model evaluation、费用、真实产品流量与人类语义验收。

完成这些 gate 前，不得把 source composition 描述为已部署、已连接数据库或 AI 应用已上线。
