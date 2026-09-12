# QA Plan：控制者退出后的 Workspace/TLS 恢复准入

- 日期：2026-09-12（Australia/Melbourne）
- 工作流：仓库 `qa-plan`，按 CaresLink AI 本地集成测试范围调整
- 状态：14 项本地测试及验证完成；代码审阅 APPROVED WITH SUGGESTIONS，本记录纳入本地提交；推送/草稿 PR 为下一阶段
- 范围：一个 Integration 功能，14 项本地测试
- 基线：PR #49 合并提交 `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9`
- 分支：`codex/careslink-workspace-task-controller-recovery`
- 引擎 / story / sprint / GDD / ADR：未配置或无对应条目；验收依据为 M1Y 未验证项及下列实际实现

## 合并基线与本阶段选择

[PR #49](https://github.com/Millionluna/Codex-Game-Studios/pull/49) 于 `2026-09-12T01:39:47Z`（墨尔本 `2026-09-12 11:39:47 +10:00`）普通合并到 `codex/careslink-ai-documents-v1-auth-gate`。两个父提交为 `a3a71512990cd3dd1d3efd05afe8ccac88632fc7` 和审阅提交 `c092b23d5ada6756327a8a09ce40beb3e3afef67`；合并文件树 `14fa0ef18752eb75daa073181cc7becdf9b6933b` 与审阅提交完全一致。范围为 4 个文件、1,137 行新增、无删除。合并前没有 GitHub 检查或外部审阅记录；普通合并没有使用管理员绕过、自动合并或分支删除。

该基线的本地证据为相关套件 **125 通过 / 1 既有跳过**，全套 **6,277 通过 / 54 跳过**，类型、Lint、73 文件适配器同步及 whitespace 检查通过。两次最终运行各有 12 份进程报告：8 VERIFIED、4 预期 UNVERIFIED，全部确认测试资源收尾。每轮实际发生两次 broker 发送失败；旧 owner 保持 FAILED / cleanupConfirmed=false，L/S 的原生子进程退出码、信号、close 保持未知。这些是已经合并的测试结果，不能作为新恢复准入已经验证的证据。

PR #49 只诊断控制者 R 死亡，没有后继启动入口。PR #47 已联合验证 launcher 死亡后的单后代退出证据与实际 issuer 恢复。本阶段选择 M1Y 中仍未验证的**控制者丢失后的恢复准入**：在 T 存活、旧 R/L/S 的身份及退出证据完整的本地条件下，验证一次新的 R/L/S 链能恢复原模拟账本，再接收实际 Workspace/TLS 请求。

该测试编排规则已完成下述本地验证。不能把 PR #49 的 `diagnosticEvidence=VERIFIED` 直接当作授权，也不能把新本地结果称为已安装的监督策略。主机/T 死亡、真实数据库持久性和清理、部署监督、工作负载/密钥来源、其他平台仍留在范围之外。没有再增加一层祖先进程来声称覆盖主机死亡。

## 输入与测试分类

仓库没有 `production/epics`、`production/sprints`、`design/gdd/systems-index.md` 或 `docs/architecture/control-manifest.md`，没有对应游戏公式或 story。以下直接把已有模块行为和未验证边界转为可证伪条件；不补造 GDD、ADR 或 story 完成状态。

下列路径相对于 `apps/careslink-ai/`：

| 来源 | 本阶段依据 |
|---|---|
| `documentation/communication-note-product-integration-m1y.md` | 合并记录、控制者丢失后的恢复缺口及持续限制 |
| `documentation/communication-note-workspace-task-controller-exit-qa-plan.md` | T/R/L/S 拓扑、双原观察者、审计身份、失败保留和收尾条件 |
| `src/lib/communication-note-workspace-task-controller-exit.process.test.ts` | 实际控制者退出、真实 Workspace/TLS 请求、原 Map 与双审计连接 |
| `scripts/preview-e2e/communication-note-task-controller-exit-local-child.mjs` | 已有三角色夹具及 begin/inspect/release-exit 控制；保留 broker-send 失败修正 |
| `scripts/preview-e2e/communication-note-task-process-observer.py` | 已有 macOS kqueue 单 PID 退出观察，不提供原生退出码或 close |
| `src/lib/communication-note-workspace-task-parent-exit.process.test.ts` | 单代 RPC/请求收尾、一次恢复准入、阻塞恢复回复、旧绑定和新绑定请求 |
| `src/lib/communication-note-task-process-observation.process.test.ts` | PR #46 要求清理确认的严格 successor 检查；本阶段不改 |
| `src/lib/communication-note-task-preview-issuer.server.ts` | `recover()` 实际执行 start → inventory → fence/finalize → ready，新 epoch 完成恢复后才允许 issue |
| `src/lib/communication-note-task-preview-service.server.ts` | start 等待 issuer.recover；恢复失败进入 FAILED，未完成恢复不声明 cleanupConfirmed |
| `src/lib/communication-note-task-preview-https.server.ts` | service.start 成功且健康后才创建 listener；启动失败关闭接收入口 |
| `src/lib/communication-note-task-preview-host.server.ts` | 实际专用进程 owner、ready/finished 与停止行为；不包含已部署监督器 |

| 验证范围 | 类型 | 自动化 | 人工复核 |
|---|---|---|---|
| 旧链退出与恢复准入 | Integration | 原生 R 退出、两个原观察者、审计失败保持、拒绝时零启动副作用 | 证据归属、未知字段与准入条件 |
| 非空账本恢复与新请求 | Integration | 实际 issuer/service/HTTPS，恢复检查点，旧绑定拒绝与新绑定成功 | 模拟状态与真实 TLS/产品生命周期的区别 |
| 迟到回复及正式入口 | Integration | 旧 RPC 隔离、单次准入、失败启动与 formal route/import guard | 无自动重启、无真实产品激活 |

## 拓扑与复用边界

T 始终存活，持有实际 Workspace 请求驱动、模拟 Auth/PG 回复、唯一原始 leases Map，以及每代 R 和两个原观察者的 ChildProcess 句柄。每代均为 `T → R → L → S`，L/S 各有单独绑定到 T 的审计 socket。旧 R 正常退出或 SIGKILL 后，L 仍执行现有父 IPC 丢失策略：对其 owned S 发 SIGTERM，然后立即失败退出，不等待 S 的退出报告。

新代必须拥有新 R 句柄、新 nonce、新审计 socket 路径和新注册的 O-L/O-S。新身份通过原 IPC 和审计连接的 fresh challenge 核对；不能仅凭 PID 数字不同证明新代，也不能因 OS 复用了 PID 就接纳旧证据。broker 路径只允许本代 `T↔R↔L↔S` 原生 IPC，任何审计 socket 都不能送 SQL、broker 回复或恢复结果。

优先直接复用 PR #49 已提交的三角色夹具和 Python 观察者，不改它们的生命周期策略。新增测试文件在 T 侧分离“构造并核验身份”“开始恢复”“等待实际 ready”三个步骤；T 的模拟 broker 可以按本代操作设置有界的回复检查点或失败。现有 begin/inspect 控制足以观察未完成恢复的新 S，不需要重写 service、伪造健康状态或增加生产监督器。PR #45 至 #49 的既有套件、PR #46 successor 和 PR #47 startRecovery 检查保持原样。

本阶段允许在新测试文件内提取具名的身份、审计和准入校验函数，以减少多条件表达式；不为了本批另行改造所有旧 harness。

## 两个独立条件

### 1. 仅允许启动一次恢复进程

新测试 harness 中的 `startControllerRecovery` 核对旧代原始对象，而非只读诊断摘要或 `done` 布尔值。下列条件全部满足后，才同步消费一次准入，再创建新代：

1. 旧 R 的原生 exit、close 均实际取得，code/signal 与触发方式相符；旧 broker 接收入口已因实际 disconnect/exit 退役，控制者无非预期进程错误，IPC 身份及帧解析没有损坏。受控 broker-send-failed 可作为断连路径的真实故障记录保留，不能因此改写 owner 结果，也不能用它跳过其余准入条件。
2. 旧 L、S 的身份各自在原观察者 armed 后通过原启动链和审计新挑战核验；**两个原观察者**各自有唯一匹配 PID/nonce/observerPid 的 kernel-exit，并以 code=0、signal=null 正常 close，无解析错误或 unverified 事件。
3. 旧 L/S 的两条审计通道均身份正确、顺序合法、没有额外连接或任何历史坏帧；S 有真实 owner-finished 和匹配本次 challenge 的 exit-released，没有 fixture-failed。旧监听已确认关闭，审计连接/监听器的实际关闭均已等待。
4. 旧 Workspace 请求已返回失败，相关 HTTPS 请求/流已实际关闭；旧 RPC 集合已经结清。需要同时检查请求任务与传输关闭，不能以 `destroy()`、AbortSignal 或一个计数代替完成事件。
5. 此旧代从未消费恢复准入。检查与设置 consumed 必须先于异步新代创建；重复调用、并发第二次调用、第一次新代启动失败均不能再次使用旧代许可。

任一条件不满足，拒绝必须发生在创建新 R、观察者、审计 listener 或调用新代 broker start 之前。测试同时核对实际进程/代数登记、socket 登记及 broker 操作计数，不仅检查错误字符串。若错误实现真的启动了后继，仍要登记并收尾它，不能让负向断言造成测试泄漏。

旧 owner 的 FAILED / cleanupConfirmed=false 不会因此改成成功。这一单独的本地准入只允许尝试恢复，与 PR #46 要求清理确认的 successor 条件用途不同；后者不被放宽。L/S 在原父死亡后拿不到的原生 exitCode/signal/close 仍为 UNVERIFIED / ORIGINAL_OWNER_EXITED。验证的内核退出用于本次明确限定的本地恢复条件，不冒充原父句柄事件。

只有 teardown-only 观察者成功、原观察者失败时，依然拒绝恢复；收尾观察者必须在 R 死亡前为仍存活且重新核验的目标预注册，且不得替换原对象。

### 2. 新服务恢复完成后才允许接收请求

新代使用原 Map，保留旧 requestId、scope、租约和计数，不能重新 seed、清空、删除旧行或直接写 REVOKED。仅在测试用例之间重置夹具状态，绝不在同一用例两代之间重置。

由真实 issuer 发起新 epoch 的 `start → inventory → fence → finalize → ready`。T 的模拟 broker 执行并记录这些实际收到的操作；模拟记录不等于真实数据库提交。三个检查点分别为 inventory 执行前、finalize 已模拟提交但尚未回复、ready 已模拟执行但尚未回复。每个检查点都通过本代 S 的新 inspect challenge 证明 address=null、listening=false、无 ready 通知/新 instance 绑定、无新 issue。

只有所有旧记录已由实际恢复调用变为 REVOKED、模拟 role/session/membership 计数归零、真实 issuer 收到有效 ready 回复且 service 健康后，才允许出现实际 HTTPS listener 并交付新绑定。不强制物理端口变化；以新 instanceId、新代 nonce/句柄和原实际启动流程判定代际。

向新 endpoint 使用旧 instance 绑定，实际 Workspace 请求必须为 503 且无 taskPage，不新增 broker issue 或 PG reader；使用新绑定才可完成 200 响应。新请求撤销回复尚未交付时不得提前返回成功，之后分别核对旧租约与新租约的模拟清理计数、实际 TLS 属性、mock PG 的 end/destroy 和密码引用清除。任何新代结果均不能补写旧 owner 的清理成功。

## 自动化矩阵（14 项已实现并通过）

已新增 `src/lib/communication-note-workspace-task-controller-recovery.process.test.ts`。

| ID | 场景 | 核心验收 | 实际项数 |
|---|---|---|---:|
| CR-01 | R 正常退出 / SIGKILL × ISSUE_COMMITTED / FENCE_COMMITTED | 旧实际请求 503；原 Map 保留非空；双原观察者及旧资源完成后准入一次；三处恢复检查点均不监听；恢复后旧绑定拒绝、新绑定请求及撤销成功；重复准入拒绝 | 4 |
| CR-02 | R/L 已退出、owner 已完成、listener 已关闭，但 S 仍处于审计退出屏障 | 新 challenge 证明 S 活着；没有 S kernel-exit，恢复拒绝且零创建副作用；真实释放/退出后再核对完整条件 | 1 |
| CR-03 | 原 O-L 零超时 / 对原 O-S owned handle 发 SIGKILL | 原观察者失败保持；预注册的独立收尾观察者确认资源释放后，恢复仍拒绝，无第二代 | 2 |
| CR-04 | 有效退出释放之后，S 的真实绑定审计 socket 发错误 nonce / 重复 seq | 历史审计错误保持；即使双内核退出与收尾完成也拒绝恢复，无第二代 | 2 |
| CR-05 | 新代 inventory / finalize / ready 的模拟 broker 操作分别失败 | 实际 startup-failed 和 owner FAILED；没有 ready/instance/listener、新 issue 或新 PG reader；保留失败阶段账本快照，不自动启动第三代，旧准入不可重用 | 3 |
| CR-06 | 旧 issue 已模拟提交但回复暂停，R 被 SIGKILL | 旧请求失败/退出后，未结清 RPC 阻止准入；释放旧回复并结清后可启动新恢复；在新 inventory 检查点重播旧回复仍只绑定死去的 R/旧 nonce，不能改变新 epoch、Map、操作或满足新 pending RPC | 1 |
| CR-07 | 测试 Preview flags 下正式 route/runtime 与导入边界 | formal runtime undefined、route 503；不调用 Auth/TLS/PG，不导入过程夹具/观察者，不启动进程；HOSTED_WORKSPACE_READ_BINDING 仍 undefined | 1 |

CR-05 的失败应在选定操作执行前注入，明确记录这个位置。inventory 失败时旧记录尚未恢复；finalize 失败时已执行 fence 但尚未完成撤销；ready 失败时旧记录可能全部已 REVOKED，仍不得监听。不能以 Map 非空或全部计数归零中的任一项单独推断恢复就绪。

未就绪的新代可能从未获得 port。此时依据真实 startup-failed、owner outcome、inspect 的空地址/无 listener、无 ready 事件以及后续退出，记录 `NEVER_OPENED`，不能向 undefined 或上一代端口探测并声称关闭了新 listener。曾经监听的代则要求自身端口的实际连接拒绝及已登记流关闭；新 harness 的失败收尾不能直接套用只接受 ready 代的端口检查。

CR-06 的回复闭包必须捕获旧 R 句柄和 nonce，不使用“当前控制者”全局变量。暂停点释放后先检查 retired 再进行任何尚未执行的模拟操作；已执行操作的迟到回复只允许丢弃，不重新执行该操作。对新代 pending 和 epoch 的断言必须在新代真实运行时观察。

## 证据、收尾与失败处理

每个用例、每代单独记录：触发方式、身份核验、R 原生 exit/close、两个原观察者的内核退出和 close、审计有效性/关闭、原生后代未知项、owner outcome、listener、RPC/请求关闭、恢复准入次数及拒绝阶段、恢复操作顺序、账本状态、ready/instance、新旧绑定响应和 teardown 结果。区分 `recoveryOutcome=NOT_STARTED/FAILED/READY` 与 `teardownEvidence`；不要将负向测试通过写成恢复成功。

成功后继的收尾也沿用现有受控 R 退出与 S 屏障策略。它可能再次因 broker 丢失报告 FAILED / cleanupConfirmed=false，这应按其实际结果记录，不能为了要求退出 code=0 而改夹具策略；之前的恢复就绪、请求撤销证据与最终停止结果分别保存。

实施首轮矩阵发现，**已启动失败的新代**需要另一种收尾顺序：实际 owner 完成时已移除 SIGTERM 处理器并断开自己的 IPC，随后先结束 R 会让 L 的 SIGTERM 在屏障释放前终止 S。新 harness 应先验证 startup-failed、owner FAILED 和 NEVER_OPENED，再释放该 S 的退出屏障，等待原观察者内核退出及仍存活 L 的真实 child-close，最后结束 R/L。这只处理已经失败的新代，不改变旧代控制者死亡触发或夹具/产品策略；此路径实际获得的 S 原生退出码/close 必须如实记录，不能强行标成未知。首轮 11 通过 / 3 失败的日志与临时根继续保留。

启动前登记全部 owned 资源，包括未 ready 或初始化失败的新代。暂停回复必须在失败收尾中释放并等待结清；每个旧/新 R、原观察者、收尾观察者及已核验 L/S 均需实际退出证据。未知后代不得用旧 PID 发信号、按进程名/端口终止，或重建观察者伪造成功。信号仅通过本用例 owned ChildProcess 句柄发送。

使用自建 `/private/tmp/cl-task-controller-*` 根（复用夹具的固定路径校验），每代不同 socket 文件和 nonce，根权限 0700、合成私钥 0600。成功用例等待所有请求、流和审计 listener 关闭，再删除核验过 realpath 的本次根。失败保留有界诊断和该根，不声明已成功收尾；任何 watchdog、超时、缺失身份/退出/释放或非预期输出都必须显式失败。不得放宽产品超时、旧套件 skip 或删掉失败断言来获得通过。

PR #49 的早期失败根 `/private/tmp/cl-task-controller-75ZRdn` 和 `/private/tmp/cl-task-controller-5mppdT` 继续单独保留；不能把它们计为本阶段残留或删除后假称基线全部成功。新一轮证据不能补写旧失败运行的缺失证据。

## 文件范围与执行顺序

| 文件 | 本阶段动作 |
|---|---|
| 本 QA 计划 | 已新增并更新真实实施结果 |
| `documentation/communication-note-product-integration-m1y.md` | 已记录 #49 合并、阶段计划及实际结果 |
| `src/lib/communication-note-workspace-task-controller-recovery.process.test.ts` | 已新增 14 项测试及本地编排 |
| 现有 controller-exit 三角色夹具与 Python 观察者 | 直接复用；不预先安排改动 |
| 产品模块、旧测试、依赖/配置 | 保持不变 |

先完成 CR-01 的一个 SIGKILL / ISSUE_COMMITTED 非空恢复控制，验证两代所有资源收尾，再展开完整矩阵。首轮发现已失败新代的收尾顺序问题，按上节先记录具体原因再修改新 harness；已有夹具、观察者、产品及旧测试均未修改。

以下命令已在本地执行。目录为 `apps/careslink-ai/`，始终取消实际 issuer socket 环境值，没有启动 PG16 fixture：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts -t 'CR-01 SIGKILL ISSUE_COMMITTED' --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts src/lib/communication-note-workspace-task-controller-exit.process.test.ts src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts src/lib/communication-note-workspace-task-parent-exit.process.test.ts src/lib/communication-note-workspace-task-https.process.test.ts src/lib/communication-note-task-process-observation.process.test.ts src/lib/communication-note-task-preview-host.process.test.ts src/lib/communication-note-task-preview-https.server.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/typescript/bin/tsc --noEmit --incremental false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/eslint/bin/eslint.js src/lib/communication-note-workspace-task-controller-recovery.process.test.ts
```

根目录已执行 `python3 tools/sync_codex_adapters.py --check`、`git diff --check` 和新文件 whitespace 检查。日志使用本阶段独立文件名，没有覆盖 controller-exit 的原始证据。实际日期、平台、数量、退出码、每代结果及资源库存见下节。本机为 macOS arm64 / Node `v22.23.2`；产品与依赖未变，没有重复 build/client-boundary。

## 人工 QA、smoke 与完成条件

开发者 smoke：旧请求产生非空租约 → R 实际退出 → 旧请求失败、双退出和旧资源证据完成 → 单次恢复准入 → 三处检查点均未监听 → 原 Map 恢复 → 旧绑定拒绝 → 新请求成功且撤销 → 两代资源收尾。审阅者核对原始日志、准入拒绝的零副作用及实际 issuer/service/HTTPS 行为。没有 UI/Visual/Feel 范围，不需要截图或 playtest；不捏造外部评审签字。

完成实施前需全部满足：

- [x] CR-01 至 CR-07 均有可执行断言和真实结果。
- [x] 原失败、未知 native 事件、旧 owner 清理结果、新恢复状态与资源收尾分别保留。
- [x] 准入仅消费一次，证据不足不创建后继；新代恢复失败不自动重启。
- [x] 原 Map 未跨代重置，实际恢复先于 listener，新旧绑定及迟到回复结果符合预期。
- [x] 新套件、相关套件、全套、类型、Lint、适配器和 whitespace 检查完成；跳过单独列出。
- [x] 最终 owned 资源确认收尾，早期失败证据单独保留；源工作树未改变。
- [x] QA/M1Y 已更新实际结果。
- [x] 代码审阅完成，无必须修复项；审阅记录与三个目标文件纳入本地提交，推送/PR 为后续步骤。

## 2026-09-12 实施与验证记录

| 运行 | 墨尔本开始时间 | 实际结果 | 用时 / 退出码 |
|---|---|---|---|
| 首个 CR-01 SIGKILL / ISSUE_COMMITTED 控制 | 11:59:08 | 1 通过 / 3 项按名称过滤；当时只写入 CR-01 四项 | 1.51 秒 / 0 |
| 首轮完整矩阵 | 12:01:18 | 11 通过 / 3 失败，失败套件保留资源标记 | 8.85 秒 / 1 |
| 修正后独立矩阵 | 12:03:16 | 14 通过 | 8.94 秒 / 0 |
| 最终相关套件 | 12:04:41 | 139 通过 / 1 既有跳过；8 文件通过 | 12.71 秒 / 0 |
| 最终全套 | 12:05:15 | 6,291 通过 / 54 跳过；326 文件通过 / 5 跳过 | 25.29 秒 / 0 |

首个控制已证明原 Map 保留、三处恢复检查点未监听、新旧绑定分别返回 200/503，以及两代完整收尾。首轮完整矩阵的三个失败均来自 CR-05 收尾时向已经结束的 S 审计 socket 写入 release-exit（EPIPE）。结合实际 owner 完成后移除 SIGTERM 处理器及 L 的信号策略，定位为已失败新代先结束 R 的顺序问题；原失败报告没有 S 的最终原生信号记录，不据此补造退出码/信号。调整仅限新 harness 的失败新代收尾，使用真实屏障释放、原观察者退出和 L 的 child-close 断言后再结束 R。

独立矩阵通过后补充了“失败的新代自身也不得继续启动第三代”的实际准入拒绝断言；最终相关和全套运行覆盖最终实现。TypeScript `--noEmit --incremental false` 与新测试文件 ESLint 均退出 0，日志为空；73 文件适配器同步、差异及三个改动文件 whitespace 检查通过。已有三角色夹具、Python 观察者、旧套件、产品与依赖对基线没有差异。

最终相关与全套各有 **22 份代际进程报告**，逐份核对如下：

- 13 个初始代和 9 个恢复代；9 次准入各只消费一次，恢复代为 6 READY / 3 FAILED。
- 18 份诊断 VERIFIED；4 份故障诊断仍 UNVERIFIED（两个原观察者失败、两个坏审计帧），没有以收尾成功覆盖失败。
- 19 代实际 listener 关闭，3 个启动失败的新代为 NEVER_OPENED。所有 22 代均保持实际 owner FAILED / cleanupConfirmed=false、R 原生 close 已确认、审计与请求流已关闭、RPC/请求集合为空、teardown CONFIRMED。
- 19 代采用 CONTROLLER_FIRST；3 个已失败新代采用 FAILED_STARTUP_SERVICE_FIRST，实际取得 S 原生 code=1、signal=null、child-close。其余 S 及全部 L 的不可观察原生事件仍保留 UNVERIFIED / ORIGINAL_OWNER_EXITED。
- 全套实际记录 20 次准入拒绝：ADMISSION_USED 10、CONTROLLER_EXIT_UNVERIFIED 1、DESCENDANT_EXIT_UNVERIFIED 3、AUDIT_EVIDENCE_INVALID 2、LISTENER_UNVERIFIED 3、OLD_WORK_PENDING 1。每次都核对代数/进程/socket 登记和 broker start 没有增加。
- CR-01 四种组合均在 inventory、finalize 已提交和 ready 回复暂停时证明没有 listener；旧绑定未新增 issue 或 PG reader，新请求等待自己的撤销回复后才返回 200。CR-06 在新代真实暂停时核对旧回复没有改变新 epoch、Map、操作或 pending RPC。

原始日志均位于 `/private/tmp/`：`careslink-controller-recovery-control.log`、`careslink-controller-recovery-matrix.log`（首轮失败）、`careslink-controller-recovery-matrix-final.log`、`careslink-controller-recovery-focused.log`、`careslink-controller-recovery-full.log`、`careslink-controller-recovery-types.log`、`careslink-controller-recovery-lint.log`。

最终进程检查没有发现本批夹具或观察者仍在运行。成功运行的本次根已删除；首轮失败根 `/private/tmp/cl-task-controller-m4PfOY` 按计划保留，包含对应 bundle/合成证书，不能称为成功收尾。原始失败日志保存了三个失败新代的身份、原观察者 code=0/close、内核退出和审计关闭，但缺失有效退出释放，teardown 仍为 NOT_COMPLETED；之后的成功运行不改写这些记录。PR #49 的两个历史失败根继续保留。其他 `cl-task-disconnect-*`、`cl-task-parent-*`、`cl-task-chain-*`、`cl-task-observe-*`、`cl-task-host-*`、`cl-task-https-*` 库存为空。受保护源工作树仍 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

## 2026-09-12 本地代码审阅

按仓库 `code-review` 流程审阅新测试全文、QA 及 M1Y 本批差异，并对照既有夹具、实际 issuer/service/HTTPS/owner 的恢复与退出路径。依照根 AGENTS 在本任务内完成 QA 可测试性复核，没有委派或外部审阅签字。本阶段只补充文档记录，测试实现保持最终相关/全套运行时的版本。

- **Engine specialist：N/A。** 未配置引擎，本批为 TypeScript 本地集成测试，无游戏帧循环、shader 或 UI 范围。
- **Testability：TESTABLE。** CR-01 至 CR-07 的 14 项映射均可执行；检查真实启动/退出/流事件、恢复操作和原 Map，并在拒绝时验证没有创建副作用。准入用原观察者对象，消费许可先于异步构造；失败新代先释放 S、取得真实 child-close，再结束 R。没有用诊断摘要或 teardown-only 成功替代原证据。
- **ADR：NO ADRS FOUND。** 本批目标、新测试头及基线提交消息没有 ADR 编号引用，没有对应 story，跳过 ADR 合规检查。
- **Architecture / SOLID：无阻塞项。** 本地编排只依赖既有产品入口和夹具；broker 回复捕获本代 R/nonce，审计通道不传恢复结果。实际恢复先于监听；新测试没有成为正式 runtime 的依赖，旧 guard、产品及依赖未修改。模拟 broker、身份校验、准入与报告分别可检查，但密集分支仍有维护成本。
- **资源与证据：通过本次范围复核。** 重新解析最终相关/全套日志，各 22 份报告及 20 次拒绝与上节一致；首次失败日志实际包含三个 CR-05 的 EPIPE 及收尾失败标记，未补造 S 信号。保留的三个失败根仍存在，受保护源工作树仍 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

规范六项按本地测试范围评估，不宣称全部满足游戏代码标准：

| 检查 | 结果 |
|---|---|
| 公共 API 注释 | 无新增公开产品 API；恢复准入与真实/模拟边界有注释 |
| 圈复杂度小于 10 | 有建议：额外启用阈值 10 后得到 10 项复杂度警告，未修改仓库 Lint 规则 |
| 方法不超过 40 行 | 额外检查只有外层 describe 注册回调得到 201 行警告；其包含用例和 hook 定义，不是单一生产操作 |
| 依赖注入 | 产品组合使用既有 binding；外部 Auth/PG 和地址解析由测试注入；每代进程/RPC 对象独立 |
| 配置来自数据文件 | 测试保留既有 CaresLink harness 的常量/工厂惯例，未引入游戏调参或产品配置；可后续提取合成夹具数据 |
| 接口边界 | 使用已有 Binding、Scope 和产品入口；没有新增产品 concrete-class 耦合 |

额外只读检查使用 ESLint `--rule 'complexity: [warn, 10]' --rule 'max-lines-per-function: [warn, {max: 40, skipBlankLines: true, skipComments: true}]'`，退出 0，**0 errors / 11 warnings**。其中复杂度为 protocol（52 行）19、audit 数据回调（247 行）18、receive（327 行）26、start（352 行）11、verified（407 行）12、report（471 行）27、cleanup（505 行）12、controllerExited（528 行）11、recoveryBlock（543 行）11、afterEach（612 行）13；另一项是 describe（594 行）的长度。该补充诊断与默认 ESLint 无警告的既有结果分别记录，不能称为“所有复杂度检查通过”。

**Required changes：无。** **Suggestions：**后续可把 audit/receive/report 的身份及报告条件拆成具名校验，展开同一行的多条语句，提取合成配置；保持完整集成路径及失败证据，避免仅为降低指标拆散验收场景。本批不增加公共测试框架或改造旧套件。**Verdict：APPROVED WITH SUGGESTIONS。**

可保留的实现优点是准入同步单次消费、原失败证据不被新结果覆盖，以及用实际恢复检查点证明未提前监听。相关/全套验证继续采用上节最终运行；没有实现改动触发重跑。提交前另核对适配器、whitespace、暂存范围和受保护源状态。提交仅包含新测试、本 QA 和 M1Y，父提交为 `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9`。

## 持续限制与下一步

T/宿主机死亡、真实 PostgreSQL 持久性和物理清理、已部署监督和恢复授权、工作负载/密钥来源、Linux/Windows 均未验证。本阶段新增的准入仅在本地测试 harness 中，不把本地成功当作 Hosted 激活依据。

不重试被阻止的 PG16 fixture，不创建替代 Preview，不接触真实 Auth/数据库角色或迁移、IAM、安装密钥、护理数据、真实 AI、Points/支付、云资源或生产部署。所有 readiness 标志保持 false，`HOSTED_WORKSPACE_READ_BINDING` 保持 undefined，受保护源工作树保持 `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

**下一步：**将本地审阅提交推送到 `Millionluna/Codex-Game-Studios` 的 `codex/careslink-workspace-task-controller-recovery` 分支，并以 `codex/careslink-ai-documents-v1-auth-gate` 为基线创建草稿 PR；正文列出实际验证、首次失败与持续限制。本次审阅/本地提交阶段不包含远端发布。
