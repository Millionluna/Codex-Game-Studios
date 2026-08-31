# Communication Note Preview approved runtime Hosted harness M1n

## 状态与结论

M1n 增加了一个 source-pinned、default-off 的 Hosted Live harness，用来在未来得到
单独授权的 disposable no-data Supabase Preview 上，真实驱动 M1m composition。当前批次
只完成源码、边界和本地 default-off 验证；没有创建 Preview、没有连接 Hosted 数据库、
没有部署、没有调用 provider/model，也没有读取或写入 Production。

正式状态没有改变：所有 `READY` latch 仍为 `false`，approved export 仍为
`undefined`，产品代码没有 importer。即使未来 live gate 通过，也只形成 TestOnly
empirical evidence，不会自动批准 Production migration、部署或 activation。

## 本批次解决的凭据语义问题

Supabase Preview 的 `postgres` 密码是静态分支管理凭据；它只能通过密码重置或删除分支
撤销。匿名 pipe 的一次读取和 60 秒有效期只约束 delivery envelope，不能把底层密码变成
短期或一次性凭据。

因此 management-session source contract 升级为 v2，并明确区分：

- `credentialClass = STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD`；
- `sourceExpiresAt = null`；
- `sourceRevocation = BRANCH_DELETE_OR_PASSWORD_RESET`；
- `sourceCredentialSingleUse = false`；
- 仅 `deliveryIssuedAt`、`deliveryExpiresAt`、`deliveryOneUse` 受 30 秒 age / 60 秒
  lifetime 限制。

这项修订不会声称已经存在 KMS/Vault、leased database credential、部署身份、自动轮换、
全进程内存清零或服务端 SSL enforcement。已知 driver/password 引用会在连接后清除，但
证据明确保留 `rawCredentialMaterialInProcessDuringRun=true` 和
`processMemoryZeroizationAttested=false`。

## Harness 架构

| 层 | 固定边界 |
|---|---|
| outer runner | 复用受审计的 branch envelope policy；只接受 Production 的非默认、非持久、`with_data=false`、`ACTIVE_HEALTHY` child；先尝试 Direct 5432，仅在固定网络不可达错误时回退 Supavisor Session 5432 |
| source revision | canonical manifest 自身及其有序 66 paths 均按 `relative path + NUL + bytes + NUL` framed SHA-256；覆盖 package/pnpm lock/tsconfig、outer/channel、当前静态 import 闭包、setup SQL 和磁盘上精确 40 migrations。调用方必须提供固定摘要，outer 在读 stdin/连接数据库前比对，child 再独立重算；不声称 Node/Vitest/node_modules 的完整 transitive integrity |
| child channel | FD3 bounded public config、FD4 raw pinned CA、FD5 binary static-password envelope、FD6 fixed status；秘密不进入环境变量、argv、stdout/stderr 或 JSON config |
| target resolver | 使用同一 child 内 32-byte ephemeral HMAC key绑定 target/Production refs；control-plane observation、endpoint、CA digest 与 sealed target 相互绑定；key 在 composition 构造后清除 |
| synthetic chain setup | 在独立管理事务中创建一个无密码的 dummy LOGIN/NOINHERIT runtime-shaped role，仅用于执行现有 valid-chain setup policy；同事务撤销 membership 并 drop dummy role，随后构造与真实 catalog 一致的 ACCEPTED envelope |
| M1m drive | parent 与 child 都从实际 resolved `pg/package.json` 要求精确 `8.23.0`，再从同一 CJS package entry 取得 constructor 并注入 M1m management/runtime adapters；client 实例严格分离，唯一业务驱动入口是 `bundle.runtimePort.persist(envelope)` |
| durable lifecycle | 高层调用真实经过 acquire → runtime connect/PID → bind/NOLOGIN → transaction/persist → tombstone → exact session destroy → finalize → inspect；要求恰好五次 fresh management delivery |
| postcheck | child 外独立管理连接和 parent runner 分别证明终态 acquisition、runtime role/session/membership 与 schema/function/table/sequence API privilege 为零；parent cleanup 枚举、finalize、inspect 所有 acquisition（包括已 `REVOKED`）。成功发行后必须保留恰好一个 64-hex `credential_verifier_sha256` hash-only tombstone；never-issued 记录才要求 null，原始 password/SCRAM verifier 仍禁止持久化 |

## Pipe 与 evidence 边界

FD5 使用固定 binary framing：8-byte `CLM1NSEC` magic、1-byte version、32-byte
delivery binding digest、2-byte big-endian password byte length、UTF-8 password。拒绝尾随
字节、控制字符、DSN 和超过 1,024 bytes 的值。Binding digest 覆盖 source revision、
target/control-plane digest、实际 endpoint mode/hostname、5432、database、username suffix、
CA digest、management user 和 delivery timestamps；它不散列密码，避免留下可离线猜测的
password fingerprint。

成功 evidence 只包含固定枚举和布尔值，不包含 branch ref/id、hostname、CA、password、
runtime role 或 acquisition digest。允许的说法包括 actual connection mode、client-side
pinned-CA verification、真实 M1m composition、静态 source credential、一次读取 delivery、
PG17、实际 `pg@8.23.0`、caller source pin、ACCEPTED terminal 和零 runtime residue。
不允许把它扩写成完整 transitive dependency attestation、底层短期凭据、KMS/Vault、
内存零残留、Abort/timeout live proof、两种 endpoint 都已覆盖、Production ready、已部署
或 AI 功能已上线。

当前 reviewed source revision 为
`5bf672d6819b6d6129f806e2fc7ab62c661a57cffbbc5403fcfa7967d39cfc31`；manifest 文件自身
SHA-256 为 `154cc1afe53597f1a2d547e9676b4e3a4aa2415acfe4a90ea2d14225ca235eae`。
runner 必须收到
`--expected-source-revision-sha256=5bf672d6819b6d6129f806e2fc7ab62c661a57cffbbc5403fcfa7967d39cfc31`；
任一 manifest/source byte 改变都必须重新 review、重算并更新 handoff，不能在运行时自选
新的摘要。

## Live 执行前置条件

未来执行必须另行取得 Preview 创建授权，并在同一原子批次内满足：

1. 创建 parent 为 `adocsnwnslxhxcjgbyee` 的 no-data、non-default、non-persistent
   PostgreSQL 17 Preview；保留真实 branch id/ref；
2. 使用同 revision 精确应用 40/40 migrations；runner 将数据库中的 ordered 14-digit
   version array 与 manifest 全等比较，并确认 generation/broker ledger 初始为空；
3. 从该 Preview 获取当前 Direct/Session connection candidates 与当前 CA，核对 CA SHA-256；
4. 通过 canonical reset envelope 的 stdin、五个 fixed args（branch ref、PG major、CA
   path、CA SHA-256、reviewed source revision SHA-256）和匿名 pipes 执行
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

本批次的 local/default-off gate 覆盖 credential schema、reviewed source pin/canonical
66-path manifest、磁盘与数据库 40-version exact policy、实际 `pg@8.23.0` resolution、FD/env/
status isolation、Direct/Session 5432 config、secret framing、truthful evidence、all-acquisition
cleanup、hash-only verifier-state policy、exact importer graph 和旧 M1l child behavior regression。Hosted PG17、
真实 TLS/PID、Abort/cancel、live cleanup 与 branch deletion 均尚未执行，因此不能作为本批次
已通过事实。

同一源码已通过十文件聚焦 151/151、全量 187 files / 2,547 tests、TypeScript、全仓
ESLint、三个 Node runner syntax、whitespace/diff、73-file Codex adapter sync 和 Next.js
16.2.9 Webpack 64/64-page production build；两轮独立复核最终为 P0=0、P1=0。没有执行
live-only test branch。

当前 source batch 已到 commit/PR 交接点；合并前仍需同 revision review。随后才可根据
独立授权创建一次短时 Preview，运行 live gate并立即删除。Production migration、Vercel
deployment、runtime dependency promotion、provider/model evaluation 与产品 activation
仍是后续各自独立 gate。
