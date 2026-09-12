# QA Plan：控制者退出后的 Workspace/TLS 恢复准入

- 日期：2026-09-12（Australia/Melbourne）
- 工作流：仓库 `qa-plan`，按 CaresLink AI 本地集成测试范围调整
- 状态：第一阶段 14 项测试随 PR #50 合并；第二阶段新增 10 项已实现并通过，本地共 24 项，审阅通过并纳入本地提交，推送/PR 为下一步
- 范围：一个 Integration 功能；两阶段实际验证及各自证据见本文后段
- 第一阶段基线：PR #49 合并提交 `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9`
- 第一阶段分支：`codex/careslink-workspace-task-controller-recovery`（保留）
- 当前实现基线：PR #50 合并提交 `481d1815ac624e0e343e3ae3c7195c5c47d11b16`
- 当前本地分支：`codex/careslink-workspace-task-multilease-recovery`
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

## PR #50 合并与本地基线同步 — 2026-09-12

[PR #50](https://github.com/Millionluna/Codex-Game-Studios/pull/50) 已发布为草稿，完成远端差异与证据审阅、转为正式审阅，并于 `2026-09-12T03:23:14Z`（墨尔本 `2026-09-12 13:23:14 +10:00`）普通合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并提交为 `481d1815ac624e0e343e3ae3c7195c5c47d11b16`，两个父提交依次为 `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9` 与审阅提交 `7fb3eded5ee8b4cec0eafb83b6f14f2af0b6ead1`；文件树 `1228f33fbbcec70b9c82de9f1ff2f52eedc97d77` 与审阅提交一致。

合并前逐项比较了三个远端补丁和 blob SHA，范围为 3 文件、1,228 行新增、无删除；最新 head/base 未变化，GitHub 显示 CLEAN / MERGEABLE。检查汇总、外部审阅及行内审阅记录均为空，不能称为 GitHub CI 已通过。普通合并绑定审阅 head，没有管理员绕过、自动合并或分支删除。

本地已经从 `careslink-ai-conflict` 获取并核验该合并，切换到 `codex/careslink-workspace-task-multilease-recovery`。第一阶段的 14 项矩阵、139 相关通过 / 1 跳过、6,291 全套通过 / 54 跳过、静态检查和 11 项额外可读性警告仍是已合并版本的原始结果，没有当作本阶段新执行。三份历史失败根和相应未知/失败证据继续保留，受保护源工作树保持 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

## 第二阶段实现：多租约恢复与部分完成状态（新增 10 项通过）

### 选择依据与可验证边界

第一阶段的实际进程恢复由一条遗留 ISSUED 或 FENCED 租约驱动；恢复后的第二条记录是新请求创建的租约，不代表启动时恢复了两条遗留记录。当前 `src/lib/communication-note-task-preview-issuer.server.ts` 的 inventory 接口接受最多 **4 条**、requestId 唯一的 ISSUED/FENCED 记录；先完整校验返回数组，再逐条 await fence/finalize，最后请求 ready。service 等待 recover 完成，HTTPS 随后才创建 listener。第二阶段直接验证这条已有行为在多记录、部分提交和失败时的完整进程路径。

既有 issuer 单元测试已覆盖单条重启恢复、重复/超量/错误 epoch 的 inventory，以及多记录 sweep。本轮相关回归包含这些测试；新增矩阵补足的是**控制者实际死亡后，多条由真实请求产生的遗留记录共同恢复**、部分恢复后失败，以及这些结果与实际 listener/资源收尾的关系。没有对应 story、GDD 公式或 ADR，条件来自上述实现和现有 QA，不新增游戏故事完成声明。

| 范围 | 分类 | 自动化 | 人工复核 |
|---|---|---|---|
| 两条混合记录与四条容量边界 | Integration | 真实 Workspace/TLS 请求、R 退出、原观察者、逐条恢复和 listener 检查点 | 每条 scope、操作顺序与原 Map 保留 |
| 中途失败及提交后丢失回复 | Integration | 指定记录/操作故障、实际启动失败和失败新代收尾 | 已完成/未完成记录分别保留，不虚构回滚 |
| 非法 inventory 与既有 REVOKED 记录 | Integration | 仅变换模拟 broker 回复，实际解析失败；已撤销记录不再恢复 | 区分回复变换与账本写入；不把局部成功当作整批就绪 |

继续使用 T/R/L/S 拓扑、原始 O-L/O-S 和现有三角色夹具；T、Auth/PG 模拟及原 Map 在两代之间存活。扩大账本样本不等于真实数据库持久性，也不增加一层祖先进程、已部署 supervisor 或恢复重试策略。每个用例最多一次后继创建，失败新代仍不能创建第三代。

### 构造与观测方法

已扩展现有 `communication-note-workspace-task-controller-recovery.process.test.ts`。逐字比较确认 CR-01 至 CR-07 的原 14 个测试体及 setup/teardown 块保留。在 T 侧为 Gate/故障增加本代 nonce、操作和完整 scope 的精确匹配，并记录实际 RPC id、scope、执行前/后状态、模拟提交与失败标记。按实际到达的 issue 捕获 scope，再绑定对应 fence/finalize 检查点，不凭第几个任意回调选择故障对象。沿用原 retired 检查、回复闭包及资源登记；增加本文件内具名辅助函数，没有提取共享测试框架。

所有合法遗留行都由原代实际 Workspace 请求通过真实 HTTPS issue/revoke 路径产生。用模式 NORMAL 和 T 侧回复屏障分别停在 issue 已模拟提交及 fence 已模拟提交，先等到命名屏障再启动下一条请求，最后核对不同 requestId 与完整 scope。不得在两代之间 clear/reseed Map、直接改旧行 state/计数或调用协议函数伪造恢复。两个混合状态用例明确在 R 丢失前有重叠请求；四条边界用例允许有界地建立四条未完成请求，不测试超出产品容量的成功场景。

R 退出后每个旧请求均返回 503 且无 taskPage，旧请求流实际 close；多个旧 held RPC 逐一结清。新增用例均在释放前和只释放一个 RPC 后尝试恢复，证明剩余旧工作仍令准入拒绝且没有新进程/socket/broker start。全部原退出、审计、监听及请求/RPC 证据满足后，只消费一次准入。

新代在 inventory、首条 finalize 已模拟提交但回复暂停、最后一条 finalize/ready 回复暂停等命名位置，以新的 inspect challenge 核对 STARTING、address=null、listening=false、无 ready/instance。逐项保存原 Map 引用、requestId/scope、状态与 role/session/membership 计数。暂停必须短于已有产品预算并及时释放；不用 sleep 猜测，不提高产品超时，不关闭 sweep/watchdog 来通过测试。

### 已执行矩阵

| ID | 场景 | 已断言的结果 | 通过项数 |
|---|---|---|---:|
| MR-01 | R 正常退出 / SIGKILL，遗留一条 ISSUED 和一条 FENCED | 两个旧请求失败；未结清最后一个 RPC 时仍拒绝恢复；一次新代按 inventory 中的实际 scope 完成两次 fence/finalize；首条完成和整批 ready 回复暂停时均不监听；旧绑定 503，新绑定在自己的 revoke 回复后才 200 | 2 |
| MR-02 | 四条合法未完成记录达到既有上限（含 ISSUED/FENCED），R SIGKILL | 四个 requestId 全部由原请求产生；恢复严格遍历收到的四条记录，没有漏项、重复项或越过未回复 finalize；最终四条均保留为零计数 REVOKED，随后才监听 | 1 |
| MR-03 | 三条原始 ISSUED；第一条完成后，在第二条 fence / finalize 执行前分别失败 | 第一条保持 REVOKED；第二条分别保持 ISSUED / FENCED；第三条仍 ISSUED 且未调用其 fence/finalize；无 ready、新 issue 或 PG reader；实际 startup-failed、NEVER_OPENED，不启动第三代 | 2 |
| MR-04 | 三条原始 ISSUED；第二条 finalize 已模拟提交后丢失有效回复 | 第一、二条实际 Map 已 REVOKED，第三条仍 ISSUED；实际 issuer 接收失败结果而停止恢复，无第三条恢复或 ready；保留提交后未知确认，不把前两条回滚或把整批标成完成 | 1 |
| MR-05 | 有合法遗留 Map，但新代 inventory 回复分别为重复 requestId、5 条记录、错误 epoch | 在任何恢复 fence/finalize 之前拒绝整个回复；原遗留状态不变；无 listener/ready/新 issue，实际失败新代按已有顺序收尾 | 3 |
| MR-06 | 原代已完成一次请求并保留其 REVOKED 记录，再产生两条未完成记录 | 恢复 inventory 不含已撤销行，后继不对该行再 fence/finalize；该原行和 scope/零计数完整保留，两条遗留行经实际恢复清零；新请求完成后旧行仍在 | 1 |

实际共 **10 项新增用例通过**，与第一阶段 14 项合计 **24 项通过**。MR-01 至 MR-06 同时作为测试名称与逐代报告 caseId；原有 CR 报告的 caseId 为 null。

MR-03 的故障发生在指定操作执行前；MR-04 只在指定 finalize 真正改变 Map 后返回失败，没有重新执行它。这里的 committed 表示模拟协议操作完成，不代表真实 SQL 提交；MR-04 是在实际 IPC broker 路径中用失败回复扣留成功确认，不是独立的网络断线实验。MR-05 只改返回给真实 issuer 的 inventory 副本：5 条唯一记录的回复对应原 Map 中的 3 条合法租约，重复或错误 epoch 没有污染原 Map。每种故障均记录实际注入位置与后续未调用项。

失败新代继续复用第一阶段 `FAILED_STARTUP_SERVICE_FIRST`：验证 owner FAILED / cleanupConfirmed=false 与 NEVER_OPENED，释放 S，等原观察者及仍存活 L 的真实 child-close，再结束 R/L。成功后继的终止结果与先前恢复就绪分开报告。所有原本不可观察的 native 事件仍为未知；不以账本部分清理或资源 teardown 成功改写 owner cleanup。

### 执行顺序、证据与完成条件

先实现并运行了一个 **MR-01 SIGKILL 混合状态控制**，两条遗留记录、两个旧请求及两代资源均可达并完成收尾，再扩展其余矩阵。本轮没有失败运行；没有重试历史失败根或被阻止的 PG16 fixture。

本阶段实际运行命令，应用目录为 `apps/careslink-ai/`：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts -t 'MR-01 SIGKILL' --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts src/lib/communication-note-workspace-task-controller-exit.process.test.ts src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts src/lib/communication-note-workspace-task-parent-exit.process.test.ts src/lib/communication-note-workspace-task-https.process.test.ts src/lib/communication-note-task-process-observation.process.test.ts src/lib/communication-note-task-preview-host.process.test.ts src/lib/communication-note-task-preview-https.server.test.ts src/lib/communication-note-task-preview-issuer.server.test.ts src/lib/communication-note-task-preview-service.server.test.ts src/lib/communication-note-task-preview-transport.server.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/typescript/bin/tsc --noEmit --incremental false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/eslint/bin/eslint.js src/lib/communication-note-workspace-task-controller-recovery.process.test.ts
```

新日志采用 `/private/tmp/careslink-multilease-recovery-*`，每次运行独立文件名，没有覆盖本文件第一阶段列出的原始证据。仍使用夹具接受的 `cl-task-controller-*` 私有根；成功运行核对路径/资源后删除自己的根。除默认 Lint 外，额外复杂度建议留在下一步审阅中单独记录；第一阶段的 11 项警告仍是旧版本测量，本轮没有重新测量或关闭对应规则。

执行环境为 macOS arm64、Node `v22.23.2`，日期为 `2026-09-12`，下表开始时间均为 Australia/Melbourne。所有运行均移除了 `CARESLINK_TASK_ISSUER_LOCAL_SOCKET`，退出码均为 **0**。

| 执行 | 实际结果 | 开始 / 总时长 | 原始日志（位于 `/private/tmp/`） |
|---|---|---|---|
| 首个 MR-01 SIGKILL 控制 | 1 通过 / 15 名称过滤；当时只定义了原 14 项和 MR-01 两项 | 14:52:38 / 1.92s | `careslink-multilease-recovery-control.log` |
| 完整进程矩阵 | 24 通过，1 文件 | 14:56:01 / 17.72s | `careslink-multilease-recovery-matrix.log` |
| 相关 11 文件 | 334 通过 / 1 既有跳过，11 文件通过 | 14:57:58 / 19.00s | `careslink-multilease-recovery-focused.log` |
| 全套 | 6,301 通过 / 54 跳过；326 文件通过 / 5 跳过 | 14:58:31 / 30.07s | `careslink-multilease-recovery-full.log` |
| 最终 TypeScript / 默认 ESLint | 均无输出、退出 0 | 最终测试代码版本 | `careslink-multilease-recovery-types.log` / `careslink-multilease-recovery-lint.log` |

首个控制的类型检查另保留于 `careslink-multilease-recovery-control-types.log`，无输出、退出 0。仓库 `python3 tools/sync_codex_adapters.py --check` 核对 73 文件通过；最终 `git diff --check` 和三个目标文件的完整 whitespace 检查通过。产品、依赖及构建配置没有变化，本轮没有额外运行 build 或客户端边界检查。

矩阵、相关和全套三份日志各保留 **42 份逐代报告**：原 CR 22 份、新 MR 20 份；23 个原代、19 个一次准入后继。每份日志的统计均为 38 VERIFIED / 4 预期 UNVERIFIED，恢复 23 NOT_STARTED / 10 READY / 9 FAILED，listener 33 CLOSED / 9 NEVER_OPENED，收尾 33 CONTROLLER_FIRST / 9 FAILED_STARTUP_SERVICE_FIRST。新增十项单独对应 4 次 READY 和 6 次 FAILED；后者分别是操作故障三项及非法 inventory 三项。

每份日志保留 **62 条准入拒绝**：ADMISSION_USED 26、CONTROLLER_EXIT_UNVERIFIED 1、DESCENDANT_EXIT_UNVERIFIED 3、AUDIT_EVIDENCE_INVALID 2、LISTENER_UNVERIFIED 9、OLD_WORK_PENDING 21。全部 42 代均为 owner FAILED / cleanupConfirmed=false，controllerClose=true、pendingRpc=0、pendingRequests=0，请求流与审计通道关闭，teardown=CONFIRMED。全部 L 的原生 exit/code/signal/close 仍未知；9 个启动失败新代 S 由仍存活 L 观察到 exit/close、code=1、signal=null，其余 33 个 S 的原生事件仍未知，没有以 T 的观察报告补造原 owner 事件。

复核新增报告确认 RPC id 在本代唯一、nonce 匹配本代，原代快照的 requestId 集合来自实际 issue，完整 scope.requestId 与行标识一致。MR-03 第二条 fence/finalize 的失败前后快照相同，最终分别保留 `[REVOKED, ISSUED, ISSUED]` 与 `[REVOKED, FENCED, ISSUED]`；MR-04 第二条 finalize 的提交标记为 true、失败标记为 true，最终为 `[REVOKED, REVOKED, ISSUED]`，第三条未恢复。MR-05 的 broker 已交付畸形副本，所以该 RPC 的 committed=true / failed=false；实际 issuer 拒绝它并令 startup FAILED，原 Map 仍为 `[ISSUED, FENCED, ISSUED]`。这两个层次分别记录，没有把成功交付回复等同于恢复成功。

最终进程清点没有存活的 `cl-task-controller-*` 夹具或进程观察器。临时根只剩三份原有失败证据 `cl-task-controller-5mppdT`、`cl-task-controller-75ZRdn`、`cl-task-controller-m4PfOY`；没有新根遗留，disconnect/parent/chain/observe/host/https 相关根均为空。没有删除或重新标记历史失败证据。

开发者 smoke 为：真实请求形成混合遗留记录 → R 退出 → 所有旧工作与原退出证据完成 → 单次新代恢复 → 逐条完成时仍不监听 → 整批 ready → 新请求成功且撤销 → 两代资源收尾。人工复核完整 scope 与故障前后状态，重点确认没有直接改 Map 或假造整体回滚。无 UI/Visual/Feel 范围，不需要截图/playtest，也不捏造外部签字。

- [x] 首个 MR-01 控制通过，再完成全部计划用例；原 14 项断言不删减。
- [x] 每条合法遗留行均来自原请求；原 Map、完整 scope 及已撤销行跨代保留。
- [x] 所有拒绝、部分完成、整批就绪和旧请求清理有实际证据；失败新代不自动重试。
- [x] 每个 owned 进程、原观察者、请求/流、RPC 和审计 listener 收尾可核验；失败证据单独保留。
- [x] 新矩阵、相关/全套、类型、默认 Lint、73 文件适配器及 whitespace 检查完成；估计数量更新为实际结果。
- [x] QA/M1Y 更新后完成代码审阅，审阅记录与三个目标文件纳入本地提交；发布/合并为后续步骤。

实施结束时，文件范围恰为现有 process test、本 QA 与 M1Y，三个文件未暂存或提交，HEAD 为 `481d1815ac624e0e343e3ae3c7195c5c47d11b16`。夹具、观察者、全部产品模块、其他原有测试、依赖及配置没有变化，原 successor 准入条件保留。此前仅两个文档变化的规划步骤及本节实施结果均为各自检查点；随后审阅与本地提交见下节，没有推送或新建 PR。

## 第二阶段本地代码审阅与提交 — 2026-09-12

按仓库 `code-review` 流程完成只读审阅后，将结论记入本 QA/M1Y，作为用户已授权的本地提交步骤。审阅覆盖测试全文、QA 与 M1Y 本批差异，并对照真实 issuer 的完整 inventory 校验、逐条 revoke、service.start 与 HTTPS listener 路径，以及三角色夹具的 IPC 失败回复。没有委派、外部审阅或游戏 story 完成声明。

- **Engine specialist：N/A。** 未配置引擎；本批为本地 TypeScript 集成测试，无游戏帧循环、shader 或 UI 范围。
- **Testability：TESTABLE。** MR-01 至 MR-06 的十项均有实际路径和断言；旧 held RPC 未全部结清时拒绝且不增加资源，新代首条/末条完成与 ready 回复暂停时不监听。故障按本代与完整 scope 匹配，部分状态不回滚，非法 inventory 只改变回复副本，原已撤销行不再恢复。
- **ADR：NO ADRS FOUND。** 目标差异、新测试头与相关提交消息没有 ADR 编号引用；没有对应 story，跳过 ADR 合规检查。
- **Architecture / SOLID：无阻塞项。** 仅扩展本地编排，没有新增产品依赖方向或改变产品接口。旧回复仍捕获原 R/nonce；模拟 broker、恢复编排和证据快照可分别检查。身份审计不承载 broker 数据，失败新代不重试。
- **资源与证据：符合本批验收。** 重新解析控制、矩阵、相关及全套原始日志，逐代统计、62 次拒绝与上一节一致；新增 trace 的 nonce/RPC id/issue 来源、部分失败状态、owner 未确认清理和 native 未知项均保留。测试登记的 AST 比较确认原七组 CR 注册（展开十四项）及完整 lifecycle hook 块逐字不变。

六项规范按测试范围逐项评估，不宣称全部游戏规范通过：

| 检查 | 审阅结果 |
|---|---|
| 公共 API 注释 | 无新增公开产品 API；模拟/真实边界和 inventory 副本变换有注释 |
| 圈复杂度小于 10 | 未全部满足；额外阈值 10 检查有 11 项警告，见下段 |
| 方法不超过 40 行 | 只有外层 describe 注册回调为 259 行；它包含用例和 hooks，不是一个产品操作 |
| 依赖注入 | 既有 Binding、模拟 Auth/PG 与本地地址解析继续注入；每代 fixture/RPC 独立登记 |
| 配置来自数据文件 | 保留既有常量/工厂形式，四条容量边界为被测条件；合成配置可后续提取 |
| 接口边界 | 复用 Scope、Binding 和已有产品入口，没有新增公开产品耦合 |

额外 ESLint 仅通过命令行启用 `complexity: [warn, 10]` 与 `max-lines-per-function: [warn, {max: 40, skipBlankLines: true, skipComments: true}]`，使用最终测试文件，退出 **0**，**0 errors / 12 warnings**。原始 JSON 为 `/private/tmp/careslink-multilease-recovery-review-lint.json`。复杂度依次为 protocol（52 行）19、audit 数据回调（255 行）18、executeProtocol（334 行）13、receive（371 行）26、start（396 行）12、verified（452 行）12、report（516 行）28、cleanup（551 行）12、controllerExited（574 行）11、recoveryBlock（589 行）11、afterEach（780 行）13；describe（762 行）的 259 行是第十二项长度警告。与已合并第一阶段的 11 项总警告相比，新增 executeProtocol 警告，start/report 复杂度各增加 1，describe 长度增加；没有修改或关闭仓库规则。

**Required changes：无。** **Suggestions：**后续可把 executeProtocol 的故障选择与 trace 构造进一步拆为具名步骤，并展开密集语句；旧 audit/receive/report 的校验拆分及合成配置提取仍可独立改善。保留完整恢复路径及失败证据，不为指标机械拆散用例。**Verdict：APPROVED WITH SUGGESTIONS。** 优点是按实际 scope 的故障绑定、保留同一 Map 的部分状态，以及通过真实 inspect 检查点证明恢复先于监听。

审阅中的测试 blob 为 `2acf508eb7d6fc8cfb13718ca7771796d0cb9de6`，实现没有改变，沿用本阶段 24 项矩阵、334 相关通过 / 1 跳过、6,301 全套通过 / 54 跳过及默认静态检查，未重复运行 runtime 测试。提交前重新核对 73 文件适配器、差异与全文件 whitespace、暂存文件及内容一致性；本地提交仅包括现有测试、本 QA 与 M1Y，父提交为 `481d1815ac624e0e343e3ae3c7195c5c47d11b16`。受保护源保持 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

## 持续限制与下一步

T/宿主机死亡、真实 PostgreSQL 持久性和物理清理、已部署监督和恢复授权、工作负载/密钥来源、Linux/Windows 均未验证。本阶段新增的准入仅在本地测试 harness 中，不把本地成功当作 Hosted 激活依据。

不重试被阻止的 PG16 fixture，不创建替代 Preview，不接触真实 Auth/数据库角色或迁移、IAM、安装密钥、护理数据、真实 AI、Points/支付、云资源或生产部署。所有 readiness 标志保持 false，`HOSTED_WORKSPACE_READ_BINDING` 保持 undefined，受保护源工作树保持 `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

**下一步：**将本地审阅提交推送到 `Millionluna/Codex-Game-Studios` 的 `codex/careslink-workspace-task-multilease-recovery` 分支，并以 `codex/careslink-ai-documents-v1-auth-gate` 为基线创建草稿 PR；正文携带实际验证、可读性建议和本地模拟限制。本次审阅/本地提交阶段不包含远端发布。
