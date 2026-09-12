# QA Plan：控制者退出后的 Workspace/TLS 恢复准入

- 日期：2026-09-12（Australia/Melbourne）
- 工作流：仓库 `qa-plan`，按 CaresLink AI 本地集成测试范围调整
- 状态：四个阶段共 36 项已随 PR #50/#51/#52/#53 合并；本地合并基线已同步，两份合并交接记录审阅通过并纳入本地文档提交；下一步推送与草稿 PR
- 范围：一个 Integration 功能；四个阶段的实际验证分别记录
- 第一阶段基线：PR #49 合并提交 `d5ef6a20421f07d7dc25831e7dc7c41105c5d0b9`
- 第一阶段分支：`codex/careslink-workspace-task-controller-recovery`（保留）
- 第二阶段基线：PR #50 合并提交 `481d1815ac624e0e343e3ae3c7195c5c47d11b16`
- 第二阶段分支：`codex/careslink-workspace-task-multilease-recovery`（保留）
- 第三阶段基线：PR #51 合并提交 `66cca8bd3902cf878b59b8926034fc93faef7034`
- 第三阶段分支：`codex/careslink-workspace-task-recovery-interruption`（保留）
- 第四阶段基线：PR #52 合并提交 `08d1d73413c184fb82a9fe5fb299bece7df1d8de`
- 第四阶段分支：`codex/careslink-workspace-task-successive-recovery`（保留）
- 当前本地基线：PR #53 合并提交 `3dddf743b16e474b26146d1cf47a9b0a8ce2da4e`
- 当前本地分支：`codex/careslink-workspace-task-recovery-handoff`
- 引擎 / story / sprint / GDD / ADR：未配置或无对应条目；验收依据为 M1Y 未验证项、已有恢复契约及下列实现/计划

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

## PR #51 合并与本地基线同步 — 2026-09-12

[PR #51](https://github.com/Millionluna/Codex-Game-Studios/pull/51) 已完成草稿发布、远端差异/证据审阅与转正式审阅，于 `2026-09-12T05:57:04Z`（墨尔本 `2026-09-12 15:57:04 +10:00`）普通合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并提交为 `66cca8bd3902cf878b59b8926034fc93faef7034`，两个父提交依次是 `481d1815ac624e0e343e3ae3c7195c5c47d11b16` 与审阅提交 `099004c3f0c0628ee0ac16f1b84ebb079aa928df`；文件树 `fa6e7002e81abc22ba2d191f5f00fad0637c508c` 与审阅提交完全一致。

合并前逐项比较了三个远端补丁和 blob SHA，范围为 3 文件、617 行新增、21 行删除，PR 正文与准备稿一致。最新 head/base 未变化，GitHub 显示 CLEAN / MERGEABLE；检查、外部审阅、讨论及行内审阅记录均为空，不称为 GitHub CI 或外部批准通过。普通合并绑定审阅 head，没有管理员绕过、自动合并或分支删除。

本地已从 `careslink-ai-conflict` 获取并核验合并提交，从该提交建立 `codex/careslink-workspace-task-recovery-interruption`，保留第二阶段分支。已合并证据仍为 24 项矩阵、334 相关通过 / 1 既有跳过、6,301 全套通过 / 54 跳过及 12 项额外可读性警告；每轮矩阵/相关/全套各有 42 份逐代报告和 62 次准入拒绝。这些是第二阶段原始结果，本次同步没有重新执行 runtime 测试。三份历史失败根继续保留，受保护源仍 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

## 第三阶段实现：恢复尚未完成时后继控制者再次退出（新增 8 项通过）

### 选择依据、分类与范围

已合并 CR/MR 用例验证原控制者死亡后准入一次新代、多记录恢复及 broker 返回失败。成功后继的终止发生在已 ready 或完成请求之后；失败恢复用例则先收到 broker 失败并观察 startup-failed，再按服务优先顺序收尾。本阶段已补足**后继仍在 STARTING、实际恢复 RPC 被暂停时，该后继自己的控制者再次正常退出或被 SIGKILL**的直接进程验证。

本阶段沿用既有验收边界：实际 `issuer.recover()` 完整校验 inventory 并依次 await revoke，`service.start()` 等待恢复且在异常/中止后不提供就绪状态，HTTPS 在 service.start 成功之后才监听；本地 `recoveryBlock` 不准许从 NEVER_OPENED 代继续创建后继。该组合要求来自现有代码与本 QA，没有新增产品策略或第三次恢复重试。仓库仍没有对应 story、GDD 公式或 control manifest，不补造游戏故事和签字。

| 验证部分 | 分类 | 自动化 | 人工复核 |
|---|---|---|---|
| 后继 R 在恢复暂停点实际退出 | Integration | 原生正常退出/SIGKILL、原 O-L/O-S、真实 owner/startup/inspect 事件 | 区分 broker 故障与真实控制者死亡，确认退出时仍 STARTING |
| 未执行/部分完成/全部完成但未确认的账本 | Integration | 原请求 scope、原 Map、操作快照、迟到回复释放/重播 | 模拟已提交状态不回滚，模拟 ready 不等于 service ready |
| 失败保持及禁止第三代 | Integration | 两代完整收尾、双来源拒绝及零创建副作用 | 原 owner 失败和 native 未知保持，不用新诊断重授权限 |

每个用例由 T 保持存活：先通过原代 `R0/L0/S0` 的两个真实 Workspace/TLS 请求形成两条不同 requestId 的 ISSUED 记录，固定对 R0 使用 SIGKILL，按 MR 的既有路径结清所有旧工作并完成原退出证据。随后仅准入一次 `R1/L1/S1`；矩阵中的正常退出/SIGKILL 均作用于这个正在恢复的 R1。两条原始记录保持 ISSUED，以明确区分首次 fence 与首次 finalize 的状态；混合状态和四条容量边界继续由既有 MR 回归覆盖。

不增加祖先进程，不杀 T/宿主机，不启动第三代来证明“可以再次恢复”，不改变一次准入或 NEVER_OPENED 拒绝条件。Auth/PG 和原 Map 始终模拟；真实数据库、已部署监督、恢复授权与其他平台仍未验证。

### 已实现的构造方法与矩阵

已在现有 process test 中增加 `interruptedLedger`、`holdRecovery`、`recoveryState` 与 `interruptRecovery` 四个辅助函数及八项参数化用例。AST 比对限定 `it` / `it.each` 测试注册，确认原 13 组 CR/MR 注册（展开 24 项）与完整 lifecycle hook 块逐字保留。复用原三角色夹具、Python 观察者和 NORMAL 模式；T 为 R1 的独立 fixture 安装命名 Gate，记录真实 nonce/RPC id，fence/finalize 绑定由原请求捕获的完整 scope。通过原 IPC 身份校验、原观察者和新的 inspect challenge 确认恢复正在目标位置暂停且尚无 startup-failed，之后才调用 R1 的实际 terminate 路径，没有手改产品状态或账本。

逐代报告新增安全的 `interruption` 元数据：操作、模拟执行前/后、实际 nonce/RPC id 与 scope；仅被中断的 R1 填写，其余代为 null。账本快照另记录模拟 `brokerReady`，与真实服务 health/ready/listener 分开。RI-01 的 held id 没有已执行 trace；其余三处各有且仅有一条匹配、已模拟执行但尚未交付的成功 trace。退出、释放和重播前后比较整个账本、epoch、mock ready、操作/trace、broker 调用数量及 PG/HTTPS 请求数量，避免只检查最终行状态。

| ID | R1 退出前的命名暂停点 | R1 退出及 held RPC 结清后已断言的结果 | 通过项数 |
|---|---|---|---:|
| RI-01 | inventory 已到达 T，但尚未执行 | `[ISSUED, ISSUED]`；R1 仅执行 start，已退役的 inventory 工作释放后不得进入模拟协议；没有 fence/finalize/ready | 2：normal / SIGKILL |
| RI-02 | 第一条 fence 已模拟执行，其成功回复暂停 | `[FENCED, ISSUED]`；只有 start、inventory 和第一条 fence，无 finalize 或第二条恢复操作 | 2：normal / SIGKILL |
| RI-03 | 第一条 finalize 已模拟执行，其成功回复暂停 | `[REVOKED, ISSUED]`；首条清零、第二条原样保留，无第二条 fence/finalize 或 ready | 2：normal / SIGKILL |
| RI-04 | 两条已 finalize，模拟 ready 已执行，其成功回复暂停 | `[REVOKED, REVOKED]`；模拟账本 ready=true 可保留，但实际服务从未 ready/监听，最终 FAILED，不因零计数或 mock ready 重授准入 | 2：normal / SIGKILL |

实际新增 **8 项通过**，与已合并 24 项合计 **32 项通过**。四个检查点各有 normal / SIGKILL 两项；首条恢复操作以实际 inventory 顺序和完整 scope 绑定。下面保留原验收要求，八项均已取得对应结果。

每项共同验收：

1. R1 退出前，通过 fresh inspect 证明 STARTING、address=null、listening=false、无 ready 通知/port/instance，目标 RPC 实际 held；R0/R1 使用不同 nonce、句柄、审计路径和原观察者。只用 owned ChildProcess 句柄触发退出，不按 PID/名称补杀后代。
2. 实际正常退出需 R1 code=0 / signal=null，SIGKILL 需 code=null / signal=SIGKILL，并等待原生 exit/close 与 retired。随后观察真实 startup-failed、owner FAILED / cleanupConfirmed=false 和空地址/无 listener，不向旧端口或 undefined 端口探测以伪造 NEVER_OPENED。
3. 使用 R1 原 O-L/O-S 和原审计证据完成退出释放及通道关闭。这里由恢复中的 R1 实际退出触发 CONTROLLER_FIRST；不能预先让 S1 启动失败并套用 MR 的 FAILED_STARTUP_SERVICE_FIRST 来替代被测事件。若发生缺失证据、EPIPE、watchdog 或非预期退出，保留实际失败并定位，不延长预算或改写未知 native 事件来获得通过。
4. 记录退出前、后及 held RPC 释放后的 epoch、Map 身份、完整 scope、状态与 role/session/membership 计数；未撤销行保持 1/0/2，REVOKED 行保持 0/0/0。旧工作实际结清之前不得声称 teardown 完成。RI-01 释放后不能执行未提交操作；RI-02/03/04 的成功回复只绑定已退役 R1，丢弃及重播都不能再执行协议、改变账本或交付 ready。
5. R0 再次申请恢复仍为 ADMISSION_USED；R1 在原退出、审计关闭与 pending 结清后申请仍为 LISTENER_UNVERIFIED。每次拒绝核对 fixtures、进程、socket、代数及 broker start 均不增加；全用例恰为两代、两次 start。R1 的 consumed 不可直接设为 true 来绕过 NEVER_OPENED 检查。
6. R1 没有 ready 通知、listener、instance、新 issue 或新增 PG reader；其 recoveryOutcome 应根据实际启动失败记录为 FAILED。owner cleanup 与资源 teardown 分开保存，L/S native 事件只按实际可观察性填写。两代所有请求、流、RPC、进程、观察者及审计资源均需确认收尾，仍保留原 24 项回归的证据规则。

### 执行顺序、日志与完成条件

先实现并通过了一个 **RI-03 SIGKILL 首条 finalize 回复暂停控制**，实际验证“非空原请求账本 → 一次后继恢复部分完成 → 后继实际死亡 → NEVER_OPENED/失败保持 → 两代完整资源收尾”。恢复中的 parent-loss 与 S 屏障顺序可达，无需修改夹具或收尾策略。本轮没有失败 runtime 运行，没有重试历史失败根或被阻止的 PG16 fixture。

控制通过后扩展其余矩阵，并补充 held RPC id 与已执行 trace 的对应断言，运行完整进程文件、相关 11 文件、全套及类型/默认 Lint。应用目录为 `apps/careslink-ai/`，本阶段实际运行命令如下：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts -t 'RI-03 SIGKILL' --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts src/lib/communication-note-workspace-task-controller-exit.process.test.ts src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts src/lib/communication-note-workspace-task-parent-exit.process.test.ts src/lib/communication-note-workspace-task-https.process.test.ts src/lib/communication-note-task-process-observation.process.test.ts src/lib/communication-note-task-preview-host.process.test.ts src/lib/communication-note-task-preview-https.server.test.ts src/lib/communication-note-task-preview-issuer.server.test.ts src/lib/communication-note-task-preview-service.server.test.ts src/lib/communication-note-task-preview-transport.server.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/typescript/bin/tsc --noEmit --incremental false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/eslint/bin/eslint.js src/lib/communication-note-workspace-task-controller-recovery.process.test.ts
```

日志以 `/private/tmp/careslink-recovery-interruption-*` 命名，控制、矩阵、相关、全套、类型、默认 Lint 分别留档，没有覆盖前两阶段证据。保留夹具的 `cl-task-controller-*` 私有根校验，成功运行在实际资源确认后删除自己的根；历史失败根保持原样。额外复杂度建议留在后续代码审阅中单独测量，前阶段 12 项警告不代表当前版本测量。

人工 QA 已按原始 scope、RPC、退出和状态报告复核上述 smoke，不需要 UI 截图、游戏 playtest 或外部签字。本次实施范围恰为现有 process test、本 QA 与 M1Y；三角色夹具、Python 观察者、所有产品模块、其他既有测试、依赖及配置均未变化。前一同步/规划步骤只改两个文档，本节记录其后的实际实施。实施结束时 HEAD 为 `66cca8bd3902cf878b59b8926034fc93faef7034`，三个文件未暂存或提交；随后审阅与本地提交见下节，没有推送或新建 PR。

- [x] RI-03 SIGKILL 控制可达并完成两代实际资源收尾。
- [x] RI-01 至 RI-04 八项取得真实结果，原 24 项断言与 lifecycle hook 保留。
- [x] 未提交工作、部分完成及 mock ready 已执行但实际未就绪三类结果分别保留。
- [x] 双来源第三代启动拒绝无创建副作用；原 nonce/RPC/scope、owner 失败和 native 未知项未被覆盖。
- [x] 矩阵、相关/全套、类型、默认 Lint、73 文件适配器、whitespace 与资源库存核对完成。
- [x] QA/M1Y 回填实际结果并完成代码审阅，审阅记录与三个目标文件纳入本地提交；推送/PR 为后续步骤。

### 2026-09-12 第三阶段实际验证记录

环境为 macOS arm64、Node `v22.23.2`，下表开始时间均为 Australia/Melbourne。所有命令均移除 `CARESLINK_TASK_ISSUER_LOCAL_SOCKET`，退出码均为 **0**。

| 执行 | 实际结果 | 开始 / 总时长 | 原始日志（位于 `/private/tmp/`） |
|---|---|---|---|
| 首个 RI-03 SIGKILL 控制 | 1 通过 / 24 名称过滤；当时只定义原 24 项及一个控制 | 16:10:08 / 1.68s | `careslink-recovery-interruption-control.log` |
| 完整进程矩阵 | 32 通过，1 文件 | 16:11:34 / 24.75s | `careslink-recovery-interruption-matrix.log` |
| 相关 11 文件 | 342 通过 / 1 既有跳过，11 文件通过 | 16:12:31 / 26.50s | `careslink-recovery-interruption-focused.log` |
| 全套 | 6,309 通过 / 54 跳过；326 文件通过 / 5 跳过 | 16:13:17 / 33.42s | `careslink-recovery-interruption-full.log` |
| 最终 TypeScript / 默认 ESLint | 均无输出、退出 0 | 最终测试代码版本 | `careslink-recovery-interruption-types.log` / `careslink-recovery-interruption-lint.log` |

首个控制的类型检查另保留于 `careslink-recovery-interruption-control-types.log`，无输出、退出 0。`python3 tools/sync_codex_adapters.py --check` 核对 73 文件通过，最终差异和三个完整目标文件 whitespace 检查通过。产品、依赖和配置不变，未额外运行 build 或客户端边界检查。

矩阵、相关、全套每份日志均有 **58 份逐代报告**：原 CR 22 份、MR 20 份、新 RI 16 份；31 个初始代、27 个一次准入后继。各有 54 VERIFIED / 4 预期 UNVERIFIED，恢复结果为 31 NOT_STARTED / 10 READY / 17 FAILED，listener 为 41 CLOSED / 17 NEVER_OPENED，收尾为 49 CONTROLLER_FIRST / 9 FAILED_STARTUP_SERVICE_FIRST。

各日志保留 **102 次准入拒绝**：ADMISSION_USED 42、CONTROLLER_EXIT_UNVERIFIED 1、DESCENDANT_EXIT_UNVERIFIED 3、AUDIT_EVIDENCE_INVALID 2、LISTENER_UNVERIFIED 17、OLD_WORK_PENDING 37。全部 58 代为 owner FAILED / cleanupConfirmed=false、controllerClose=true、pendingRpc=0、pendingRequests=0、请求流和审计通道关闭、teardown CONFIRMED。全部 L 的原生事件仍未知；S 的 9 份原生 code=1 / signal=null / exit/close 仍仅来自原有 service-first 失败路径，其余 49 份 S 原生事件保持未知。

新增 RI 的 8 个 R0 均 SIGKILL，8 个 R1 为 4 normal / 4 SIGKILL；16 代均按 CONTROLLER_FIRST 收尾，所有 R1 为 FAILED / NEVER_OPENED。RI-01 释放已退役 inventory 工作后仅保留 start trace，没有执行 inventory。其余 6 项的模拟成功回复释放、再重播均只丢弃，完整状态与调用数量不变。RI-04 两项在 mock brokerReady=true、两行 REVOKED 的同时仍保留真实启动失败和第三代拒绝。R0 的两条 scope 均可回溯到实际 issue，跨代 scope、nonce/RPC id 与命名暂停点对应，账本快照在退出/释放/重播后保持一致。

最终只读进程清点没有存活的本批控制者夹具或观察器。临时根仍仅有历史 `cl-task-controller-5mppdT`、`cl-task-controller-75ZRdn`、`cl-task-controller-m4PfOY`，没有新增根遗留；disconnect/parent/chain/observe/host/https 相关根均为空。原失败证据未删除或重标记，受保护源仍 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

## 第三阶段本地代码审阅与提交 — 2026-09-12

按仓库 `code-review` 完成只读审阅后，将结论记入本 QA/M1Y，作为用户已授权的本地提交步骤。审阅覆盖测试文件、两个文档的本批差异及原始验证证据，并对照已有 RPC gate/retired 检查、原生 IPC 与审计通道、issuer.recover、实际 service/HTTPS 启动和 owner 收尾路径。没有委派或外部签字，没有对应游戏 story 完成声明。

- **Engine specialist：N/A。** 未配置引擎；本批为本地 TypeScript 进程集成测试，无帧循环、shader 或 UI 范围。
- **Testability：TESTABLE。** RI-01 至 RI-04 各有 normal/SIGKILL 两项，先用实际 inspect 确认 STARTING，再终止 R1；暂停点绑定真实 nonce/RPC id，fence/finalize 另绑定原首条完整 scope。已退役 inventory 不执行，其余回复释放及重播不改变账本或调用数量。
- **ADR：NO ADRS FOUND。** 测试头、本批差异及相关提交没有 ADR 编号引用，也没有对应 story，跳过 ADR 合规检查。
- **Architecture / SOLID：无阻塞项。** 四个私有辅助函数分别承担状态断言、暂停编排、快照及中断收尾。产品接口和准入条件不变，模拟 brokerReady 与实际 FAILED/NEVER_OPENED 分开；不把后继失败转成第三代启动授权。
- **资源与证据：符合本批验收。** 三份矩阵/相关/全套日志各 58 份报告、102 次拒绝与上节一致；逐项核对 RI 原 issue 来源、跨代完整 scope、RPC id、账本计数、mock readiness、退出及原生未知项。实际控制者退出后才释放 S 屏障，所有旧 RPC 真正结清后才确认测试资源收尾。

六项规范按测试范围逐项评估，不宣称全部游戏规范通过：

| 检查 | 审阅结果 |
|---|---|
| 公共 API 注释 | 无新增公开 API；现有模拟/真实边界与 retired 检查注释保留 |
| 圈复杂度小于 10 | 未全部满足；额外阈值 10 检查有 12 项复杂度警告 |
| 方法不超过 40 行 | 外层 describe 注册回调为 270 行，含用例和 hooks；新增四个辅助函数均未触发此检查 |
| 依赖注入 | 复用已注入的 Binding、Auth/PG 和地址解析；暂停点仅存于本代 fixture |
| 配置来自数据文件 | 沿用合成常量/工厂；内联两条记录、四个暂停点与操作前缀是本批精确被测条件，可读性提取属于建议 |
| 接口边界 | 复用 Scope、Fixture 和既有产品入口，没有新增产品耦合 |

额外 ESLint 在最终测试文件上仅用命令行启用 `complexity: [warn, 10]` 与 `max-lines-per-function: [warn, {max: 40, skipBlankLines: true, skipComments: true}]`，退出 **0**，**0 errors / 13 warnings**。原始 JSON 为 `/private/tmp/careslink-recovery-interruption-review-lint.json`。复杂度依次为 protocol（52 行）19、audit 数据回调（256 行）18、executeProtocol（335 行）13、receive（372 行）26、start（397 行）12、verified（453 行）12、report（517 行）29、cleanup（552 行）12、controllerExited（575 行）11、recoveryBlock（590 行）11、holdRecovery（777 行）11、afterEach（853 行）13；describe（835 行）的 270 行是第十三项长度警告。相比第二阶段实测 12 项，新增 holdRecovery 一项；report 因可选 interruption 元数据复杂度由 28 增至 29，describe 由 259 增至 270 行。没有修改或关闭仓库规则。

**Required changes：无。** **Suggestions：**后续可将 holdRecovery 的 gate 选择与 held trace 断言提为具名步骤，展开密集语句；旧 audit/receive/report 校验和合成配置也可独立整理。保留有序 RPC 检查及原证据来源，不为指标机械拆散完整场景。**Verdict：APPROVED WITH SUGGESTIONS。** 主要优点是通过实际控制者死亡验证部分完成状态不变，以及在 mock ready 已执行时仍明确证明实际服务没有就绪。

测试 blob 为 `3cf0bae4244a5c5bf51bf679a98813c9393e2853`，审阅没有改动实现。AST 比较确认原十三组 CR/MR 注册（展开 24 项）及完整 lifecycle hook 块逐字不变。沿用本阶段 32 项矩阵、342 相关通过 / 1 跳过、6,309 全套通过 / 54 跳过及已通过的类型/默认 Lint，未重复运行未变化的 runtime 测试。提交前重新核对 73 文件适配器、差异与三个完整文件 whitespace、准确文件范围及暂存内容。

本地提交仅包含现有 process test、本 QA 与 M1Y，父提交为 `66cca8bd3902cf878b59b8926034fc93faef7034`。只读资源复查没有存活的夹具或观察者，仍仅保留上节三个历史失败根；受保护源为 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。推送、PR 和合并均未在本步骤执行。

## PR #52 合并与本地基线同步 — 2026-09-12

[PR #52](https://github.com/Millionluna/Codex-Game-Studios/pull/52) 已完成草稿发布、远端差异/验证证据审阅、Ready for review 转换及合并前核对，于 `2026-09-12T08:16:49Z`（墨尔本 `2026-09-12 18:16:49 +10:00`）普通合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并提交为 `08d1d73413c184fb82a9fe5fb299bece7df1d8de`，两个父提交依次为 `66cca8bd3902cf878b59b8926034fc93faef7034` 与审阅提交 `b1fed2413eebf63db7ad0abe9819c5a47a4b93a1`；文件树 `a49fa3af4bf0f1f962a8e74ba57cb2e69b613e17` 与审阅提交完全一致。

合并范围为 3 文件、482 行新增、8 行删除。远端 diff、三个 blob、单个提交及最终 PR 正文均与本地审阅版本匹配。最终 head/base 未变化，GitHub 显示 CLEAN / MERGEABLE；检查、外部审阅、讨论、行内意见和审阅请求均为空，不能称为 GitHub CI 或外部批准通过。普通合并使用 `--match-head-commit` 绑定 `b1fed24`，没有管理员绕过、自动合并或分支删除；仓库当时的自动删除分支设置为 false。

本地已从正确远端 `careslink-ai-conflict` 获取并核验该合并，从 `08d1d73` 建立 `codex/careslink-workspace-task-successive-recovery`，无 upstream。原第三阶段本地及远端分支均保留在 `b1fed24`。已合并证据仍为 32 项矩阵、342 相关通过 / 1 既有跳过、6,309 全套通过 / 54 跳过及 13 项额外可读性警告；每份矩阵/相关/全套日志各有 58 份报告和 102 次准入拒绝。本次同步没有重新执行 runtime 测试，也没有新增阶段通过结果。

## 第四阶段实现：成功恢复后的连续两次接管（新增 4 项通过）

### 选择依据与测试分类

前三阶段的成功用例只创建 R0 → R1，并在 R1 ready 或完成新请求之后收尾；RI 则验证尚未成功启动的 R1 退出，并拒绝继续接管。本阶段已补足**R1 确实恢复成功且运行后再次退出，由同一个存活 T 按 R1 自己的完整退出证据准入 R2**的端到端证据。

选择依据是已有 `startControllerRecovery` 的逐代单次消费、原 owner 退出/审计/pending 门槛，issuer 的 start → inventory → 逐条 revoke → ready 顺序，以及现有墓碑保留和旧 instance 拒绝规则。没有对应 story/sprint/GDD 公式或 control manifest；不新增生产恢复策略或游戏验收。实施前按仓库 `qa-plan` 流程写入现有 QA/M1Y，再按 `dev-story` 的实施/证据流程执行；TR registry 存在但 requirements 为空，无本批 governing ADR，不创建平行的 production 文档或游戏 story 完成声明。

| 验证范围 | 类型 | 自动验证 | 人工复核 |
|---|---|---|---|
| R1 已 ready 后失去控制者，R2 恢复非空或空 inventory | Integration | 四项真实进程/Workspace/TLS 用例，模拟 Auth/SQL/账本 | 三代 nonce/epoch/完整 scope、准入来源、监听与资源收尾证据 |
| 两个旧代的回复与 instance 在 R2 中隔离 | Integration | 每项按实际旧 RPC 重播并发送旧 instance 请求 | 原来源不重绑定，账本和调用数量无额外变化 |

测试仍扩展 `src/lib/communication-note-workspace-task-controller-recovery.process.test.ts`，保留已有 32 项和 lifecycle hooks，复用三角色夹具与 Python 观察者。每项恰为三代 R/L/S、两次接管；T 与原 Map 全程存活，不添加祖先进程或启动第四代。每个退出代只能消费自己的准入一次；RI 中 FAILED / NEVER_OPENED 的 R1 拒绝条件保持原样。

### 公共前置与已完成矩阵

所有新用例先在 R0 用实际 Workspace/TLS 请求形成两条不同 scope 的 A 记录 `[ISSUED, FENCED]`，固定 SIGKILL R0，结清旧请求/RPC及原观察者/审计证据，再准入 R1。R1 必须实际完成 A 的恢复、收到 ready、取得新 instance 并通过 inspect 确认监听；A 的两条 REVOKED 墓碑完整保留。以下 normal/SIGKILL 均指**第二个退出控制者 R1**。

| ID | R1 退出前条件 | R2 接管实际结果 | 实际数量 |
|---|---|---|---|
| SR-01 | R1 通过自己的实际请求新增两条 B 记录 `[ISSUED, FENCED]`，两个请求重叠且各有真实 held RPC；R1 分别正常退出 / SIGKILL | R1 请求 503，旧工作全部结清前拒绝；R2 inventory 只包含 B，顺序恢复 B，A 墓碑不变，ready 后新请求成功并完成撤销 | 2 通过 |
| SR-02 | R1 完成一次新请求 C，等待真实 finalize 回复才向 Workspace 返回 200，账本只剩 A+C 三条 REVOKED；R1 分别正常退出 / SIGKILL | 原退出/审计证据仍是准入前提；R2 inventory 确为空，恢复阶段仅 start/inventory/ready，无旧行 fence/finalize，ready 后新请求成功并撤销 | 2 通过 |

实际新增 **4 项**、完整进程文件 **36 项通过**。原规划数量已由实际结果替换；相关/全套数量、报告数与拒绝次数见下方原始日志统计。

### 必须保留的断言与证据

1. 三代的 `fromNonce` 连成 R0 → R1 → R2，nonce、epoch、原进程句柄、观察者及审计路径分别独立。每轮真实 start 产生新 epoch；Map 身份、旧行完整 scope 和 REVOKED 墓碑跨三代保留，不 clear/reseed 或直接改账本来形成场景。
2. R1 存活时拒绝接管；R1 退出后仍需原 O-L/O-S、owner FAILED / cleanupConfirmed=false、实际旧 listener 关闭及审计通道关闭。SR-01 必须验证两个 held RPC 尚未全结清时 OLD_WORK_PENDING；SR-02 的 pending=0 不能代替原退出证据，至少在 S1 仍停留于退出屏障时验证 DESCENDANT_EXIT_UNVERIFIED。每次拒绝均无新进程/socket/start 副作用。
3. R0 准入始终已消费；R1 通过自己的准入创建 R2 时同步消费，重复申请返回 ADMISSION_USED。R0/R1 的消费状态不复位；每项最终只创建三代、执行三次 broker start。R2 由 R1 的完整证据准入，不借用 R0 的诊断，也不改动既有 guard。
4. R2 inventory 回复前先暂停并实际 inspect STARTING / 空地址 / 不监听。SR-01 另在首条及末条 B finalize、ready 成功回复暂停时证明仍未监听；inventory 的 scope 集合严格等于 B，操作 trace 中没有 A。SR-02 的 inventory 必须为 `[]`，ready 回复前仍不监听，旧墓碑不触发 revoke。mock brokerReady 与真实 ready 分别断言。
5. R2 inventory 暂停时，分别重播捕获自已退役 R0 和 R1 的真实成功回复。SR-01 使用旧未完成请求的 held 回复；SR-02 使用 R1 已完成 C 请求捕获的 finalize 回复。每条闭包保留原 R/nonce/RPC id，不编造帧或重绑到 R2。旧 dropped 数增加，但全量账本、epoch、mock readiness、协议 trace 及 broker/PG/HTTPS 调用数不变，R2 不提前 ready。
6. R2 实际 ready 后，向其当前 TLS listener 分别使用 R0/R1 旧 instance 发起真实 Workspace 请求，预期 503，不能新增 issue、PG reader 或账本行；随后使用 R2 instance 发起新请求，必须等该请求 finalize 回复才返回 200。记录 TLS 验证及 PG 凭据/连接释放。旧 instance 和 nonce 不互相替代。
7. SR-01 在 R2 新请求前应有 A+B 四条 REVOKED，新请求后五条；SR-02 相应为 A+C 三条、加新请求后四条。这些是全 Map 墓碑计数，**不是** unfinished inventory 超过四条的成功测试；该容量限制仍按未完成记录判断。每条最终 REVOKED 保持 role/session/membership 计数 0/0/0。
8. 最后按现有正常控制者退出方式收尾 R2，保留三代原生事件的真实可观察性。R1/R2 曾实际 READY 的恢复结果不能因后续 owner FAILED 被重写成 NEVER_OPENED；owner 清理确认与测试资源收尾分别记录。所有请求、流、RPC、R/L/S、原观察者及审计 listener 都需确认完成；不得用 teardown 观察替换原缺失证据。

### 实施顺序、smoke 与完成条件

先实现并通过一个 **SR-01 SIGKILL 非空第二次接管控制**，证明同一 Map 上三代身份、两次独立准入、旧墓碑保留及三代真实资源收尾可达，再扩展剩余三项并增加显式 mock readiness 断言。`recoveredBatch` 仍面向至少两条记录，仅增加可选的 inventory 回复前回调，用于 SR 的双旧代重播；原调用保留原行为。SR-02 使用专用 `recoveredEmpty` 空 inventory 屏障编排，没有注入假行。旧用例、lifecycle hooks、退出/超时/容量条件、产品和夹具均未修改。

实际日志使用新的 `/private/tmp/careslink-successive-recovery-*` 前缀。控制、矩阵、相关、全套、类型和默认 Lint 分别留档；本阶段没有失败 runtime 运行，也没有重试或删除历史失败根。应用目录内已执行的控制命令为：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-recovery.process.test.ts -t 'SR-01 SIGKILL' --reporter verbose --silent false
```

随后已使用第三阶段列出的完整矩阵、相关 11 文件、全套、TypeScript `--noEmit --incremental false` 和默认 changed-file ESLint 命令，将输出保存到本阶段前缀。适配器 73 文件、whitespace、原 32 项注册及 lifecycle 块、准确改动范围与实际资源库存均已核对。本次实际实现范围为既有 process test、本 QA 和 M1Y；产品、三角色夹具、Python 观察者、其他测试、依赖及配置均不变。

开发者 smoke：R0 真请求遗留 → R1 恢复并真实 ready → R1 留下 B 或完成 C → R1 实际退出并结清原证据 → R2 先恢复后监听 → 拒绝两个旧 instance → 新请求撤销后返回 → 三代完整收尾。人工 QA 复核 nonce 链、逐代 inventory/trace、完整 scope、旧回复丢弃及最终计数。无 UI/Visual/Feel 或游戏场景，无截图/playtest或外部签字要求。

- [x] 首个 SR-01 SIGKILL 控制取得三代实际验证结果，再完成另外三项。
- [x] 非空与空第二次恢复、逐代单次准入、双旧代回复/instance 隔离均有可核对证据。
- [x] 已合并 32 项及 lifecycle hooks 保留；本批 runtime/static 检查和实际资源清点完成。
- [x] QA/M1Y 回填实际结果，保留历史计划与前阶段验证记录。
- [x] 代码审阅完成，无必须修复项；三个目标文件及审阅记录纳入本地提交，推送/PR及合并为后续步骤。

前一同步/规划步骤只修改 QA 与 M1Y，未实施或运行 SR；本节及下节记录其后的实际实施。实施完成时的检查点为 HEAD `08d1d73413c184fb82a9fe5fb299bece7df1d8de`，三个目标文件尚未暂存或提交，没有推送或创建 PR；后续审阅和提交见下节。三份历史失败根保持原样，受保护源仍 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

### 2026-09-12 第四阶段实际验证记录

执行环境为 macOS arm64、Node `v22.23.2`，开始时间均为 Australia/Melbourne。所有测试/静态命令均移除 `CARESLINK_TASK_ISSUER_LOCAL_SOCKET`，退出码均为 **0**。

| 执行 | 实际结果 | 开始 / 总时长 | 原始日志（位于 `/private/tmp/`） |
|---|---|---|---|
| 首个 SR-01 SIGKILL 控制 | 1 通过 / 32 名称过滤；当时定义 33 项 | 18:55:52 / 1.94s | `careslink-successive-recovery-control.log` |
| 完整进程矩阵 | 36 通过，1 文件 | 18:58:12 / 27.24s | `careslink-successive-recovery-matrix.log` |
| 相关 11 文件 | 346 通过 / 1 既有跳过，11 文件通过 | 18:59:22 / 28.90s | `careslink-successive-recovery-focused.log` |
| 全套 | 6,313 通过 / 54 跳过；326 文件通过 / 5 跳过 | 19:00:29 / 39.31s | `careslink-successive-recovery-full.log` |
| 最终 TypeScript / 默认 ESLint | 均无输出、退出 0 | 最终测试代码版本 | `careslink-successive-recovery-types.log` / `careslink-successive-recovery-lint.log` |

首个控制另有成功且为空的类型日志 `careslink-successive-recovery-control-types.log`。控制的三代报告均 VERIFIED / CLOSED / CONTROLLER_FIRST / teardown CONFIRMED；R0 为 NOT_STARTED，R1/R2 为 READY。随后扩展 normal 与空 inventory 用例，完整矩阵、相关、全套均使用同一最终测试 blob `dc05ab4e8329b59fe86a6466852eb178e362df21`，没有后续实现改动或失败 runtime 重试。

新增八个私有辅助函数分别负责重播验证、墓碑对照、三代身份、旧 instance 拒绝、撤销后返回的完成请求、空工作退出屏障、空 inventory 恢复及三代收尾。R2 报告新增 `replays`，逐条保存真实来源 nonce/RPC id/op/完整 scope 和 dropped 前后计数；其他代为空数组。唯一既有编排扩展是 `recoveredBatch` 的可选 inventory 前回调。AST 比较确认原十四组 CR/MR/RI 注册（展开 32 项）及完整 lifecycle hook 块逐字不变。

矩阵、相关、全套每份日志均有 **70 份逐代报告**：CR 22、MR 20、RI 16、SR 12；35 个初始代、35 个后继。各有 66 VERIFIED / 4 预期 UNVERIFIED；恢复结果为 35 NOT_STARTED / 18 READY / 17 FAILED，listener 为 53 CLOSED / 17 NEVER_OPENED，收尾为 61 CONTROLLER_FIRST / 9 FAILED_STARTUP_SERVICE_FIRST。

每份日志均有 **136 次准入拒绝**：ADMISSION_USED 58、CONTROLLER_EXIT_UNVERIFIED 5、DESCENDANT_EXIT_UNVERIFIED 5、AUDIT_EVIDENCE_INVALID 2、LISTENER_UNVERIFIED 17、OLD_WORK_PENDING 49。全部 70 代为 owner FAILED / cleanupConfirmed=false、controllerClose=true、pendingRpc=0、pendingRequests=0、请求流和审计通道关闭、teardown CONFIRMED。全部 L 原生事件仍未知；S 仅原有 9 份 service-first 失败路径保留 code=1 / signal=null / 原生 exit/close，其余 61 份仍未知。

SR 的四个 R0 均 SIGKILL，四个 R1 为 2 normal / 2 SIGKILL，四个 R2 均 normal 收尾；12 代均 CONTROLLER_FIRST，8 个后继保留实际 READY / CLOSED。每项恰为三代、两次各自准入、三个不同 epoch/nonce/instance。SR-01 的 R2 inventory 仅含两条 B，最终 A+B+新请求为五条 REVOKED；SR-02 的 R2 inventory 为 `[]`，恢复阶段没有 fence/finalize，最终 A+C+新请求为四条 REVOKED。每条最终 role/session/membership 计数均为 0/0/0。

每份完整日志的 R2 共记录 **8 次旧回复重播**，nonce/RPC id/完整 scope 均对应原代实际成功 trace，dropped 各增加 1。R2 inventory 暂停时的全量快照保持不变；所有 ready 回复暂停点均是 mock brokerReady=true 而实际 inspect 仍 STARTING / 不监听。各 R2 的真实 Workspace 响应为 `[503, 503, 200]`：两个旧 instance 均无新 issue、PG reader 或账本行，最后一条仅在 finalize 回复后返回。SR-02 还在 pending=0、S1 仍存活的退出屏障上实际拒绝接管。

只读证据复核脚本与结果分别为 `/private/tmp/careslink-successive-recovery-check-evidence.py` 和 `/private/tmp/careslink-successive-recovery-evidence-check.log`，三份日志的统计、原 issue 来源、代际链、重播来源、部分/最终账本、响应和退出证据全部核对通过。人工 smoke 复核完成；无需 UI/playtest 或外部签字。

最终进程清点没有存活的本批控制者夹具或观察者。仅保留历史失败根 `cl-task-controller-5mppdT`、`cl-task-controller-75ZRdn`、`cl-task-controller-m4PfOY`；没有新增根，disconnect/parent/chain/observe/host/https 相关根均为空。73 文件适配器、差异及三个完整目标文件 whitespace 检查通过。产品、依赖和配置不变，没有额外运行 build 或客户端边界检查。第三阶段 13 项额外可读性警告属于历史测量；第四阶段审阅的新测量见下节。

### 第四阶段本地代码审阅与提交 — 2026-09-12

按仓库 `code-review` 工作流完成三个文件的只读审阅，再按用户已授权范围记录结论并创建本地提交。复核 SR-01/SR-02 的四个场景、复用 helper/产品恢复路径及第四阶段原始日志。Engine review 为 N/A，测试性为 TESTABLE，ADR 为 NO ADRS FOUND；TR registry 的 requirements 为空，没有需要补造的游戏 story 或 ADR。架构/SOLID、异步资源归属、错误与空值路径未发现阻塞项。

R2 的准入确实来自 R1 的原退出、观察者、owner、listener、审计与 pending 证据。旧回复闭包仍绑定原 R/nonce，重播只增加原代 dropped，不执行第二次协议操作；新 helper 不改 guard、退出策略或既有恢复顺序。非空 inventory 只恢复 B，空 inventory 不重复撤销墓碑；实际 STARTING/no-listener 与 mock ready 分别核验，两个旧 instance 的真实 TLS 请求均被拒绝。三代完整收尾及既有 RI 失败后继拒绝仍成立。

| 六项标准 | 本批审阅结果 |
|---|---|
| 公共 API 注释 | 未新增公共 API；八个 helper 与 RetiredReply 均为文件私有，原准入说明保留 |
| 圈复杂度 | 新增八个 helper 未触发阈值 10 的警告；完整文件仍有 12 项既有函数复杂度警告，report 从 29 增至 30 |
| 方法长度 | 新增 helper 未触发 40 行阈值；describe 保留一项长度警告，由 270 增至 300 行 |
| 依赖注入 | 复用 Binding、Auth/PG、地址解析和每代 fixture/gate，不引入产品单例或外部服务 |
| 配置来自数据 | 沿用合成常量/工厂；三代、两次准入、两条 B 与四/五条墓碑均为精确验收条件 |
| 接口边界 | 复用 Scope、Fixture 及产品恢复入口；新增可选回调不改变原调用行为 |

额外 ESLint 对最终测试 blob 仅以命令行启用 `complexity: [warn, 10]` 和 `max-lines-per-function: [warn, {max: 40, skipBlankLines: true, skipComments: true}]`，退出 **0**，实测 **0 errors / 13 warnings**。原始 JSON：`/private/tmp/careslink-successive-recovery-review-lint.json`。12 项复杂度为 protocol（52 行）19、audit 回调（257 行）18、executeProtocol（336 行）13、receive（373 行）26、start（398 行）12、verified（454 行）12、report（518 行）30、cleanup（553 行）12、controllerExited（576 行）11、recoveryBlock（591 行）11、holdRecovery（779 行）11、afterEach（963 行）13；describe（945 行）300 行为第十三项。没有新增告警位置，也未修改或关闭仓库规则。

**Required changes：无。** **Suggestions：**后续可独立整理 report 的可选诊断字段和旧 audit/receive 校验，展开 SR 场景中的密集语句；保留完整的有序 RPC 断言与原证据来源，不为指标机械拆散场景。**Verdict：APPROVED WITH SUGGESTIONS。**

审阅未修改测试实现，blob 仍为 `dc05ab4e8329b59fe86a6466852eb178e362df21`。再次进行 AST 比较，确认原十四组注册（32 项）与完整 lifecycle hook 块逐字不变。只读重跑证据复核脚本，矩阵、相关、全套三份日志各自的 70 份报告、136 次拒绝、四条三代链、8 次旧回复及最终账本/退出证据全部通过。沿用已通过的 36 项矩阵、346 相关通过 / 1 跳过、6,313 全套通过 / 54 跳过及类型/默认 Lint；未重复执行无变化的 runtime 检查。

本地提交仅包含既有 process test、本 QA 和 M1Y，父提交为 `08d1d73413c184fb82a9fe5fb299bece7df1d8de`；提交说明引用 SR-01/SR-02 及两份验收文档。提交前核对 73 文件适配器、差异与三个完整文件 whitespace、准确文件范围及暂存 blob。只读进程复查没有存活的夹具或观察者，仍仅保留三个历史失败根；受保护源 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。本步骤不含推送、PR 或合并。

## PR #53 合并与本地基线同步 — 2026-09-12

[PR #53](https://github.com/Millionluna/Codex-Game-Studios/pull/53) 已完成草稿发布、远端差异与验证证据审阅、Ready for review 转换及合并前核对，于 `2026-09-12T09:39:11Z`（墨尔本 `2026-09-12 19:39:11 +10:00`）普通合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并提交为 `3dddf743b16e474b26146d1cf47a9b0a8ce2da4e`，两个父提交依次为 `08d1d73413c184fb82a9fe5fb299bece7df1d8de` 与审阅提交 `df8355f60909ca80c775824951b2f2f4f3981c3f`；合并文件树 `950d9a6c0b8c1464c9619d1e363aed88fc7d3cce` 与审阅提交完全一致。

合并范围为 3 文件、560 行新增、9 行删除，PR 包含一个审阅提交。远端补丁、三个 blob、提交及 PR 正文均与本地审阅版本匹配。最终 head/base 未变化，GitHub 显示 CLEAN / MERGEABLE；检查、外部审阅、讨论、行内线程及审阅请求均为空，不能称为 GitHub CI 或外部批准通过。普通合并通过 GitHub merge API 的 `sha=df8355f60909ca80c775824951b2f2f4f3981c3f` 与 `merge_method=merge` 绑定准确提交；没有管理员绕过、自动合并或分支删除，仓库当时的自动删除分支设置为 false。

本地已从正确远端 `careslink-ai-conflict` 获取并核验该合并。已有本地基线分支 `codex/careslink-ai-documents-v1-auth-gate` 从 `5c66defc0647e6f430175b8d551aea403db9df61` 仅快进到 `3dddf74`，与远端基线一致；随后从准确合并提交建立本地交接分支 `codex/careslink-workspace-task-recovery-handoff`，无 upstream。第四阶段本地及远端功能分支均保留在 `df8355f`，没有改写提交或删除分支。

四阶段已合并证据仍为 **36 项矩阵通过、346 相关通过 / 1 既有跳过、6,313 全套通过 / 54 跳过**，类型与默认 Lint 通过，额外审阅为 0 errors / 13 advisory warnings。每份矩阵/相关/全套日志各有 70 份逐代报告、136 次准入拒绝和 8 次旧回复重播。测试 blob 仍为 `dc05ab4e8329b59fe86a6466852eb178e362df21`；本次同步没有执行新的 runtime 测试，也没有新增阶段通过结果。

同步完成时的检查点仅有本 QA 与 M1Y 两份未暂存、未提交的合并交接更新。随后本地文档审阅核对了合并时间及其时区、父提交与文件树、PR 范围、合并前反馈、分支保留和本地快进记录，均与原始证据一致；无必须修复项。三份既有日志的统计再次只读核对通过，未重新运行 runtime、类型或 Lint 检查，也没有新增验证阶段。

本地文档提交仅包含本 QA 与 M1Y，父提交为 `3dddf743b16e474b26146d1cf47a9b0a8ce2da4e`，提交说明引用 PR #53 和两份交接文档。提交前核对 73 文件适配器同步、差异和两份完整文件 whitespace、准确两文件范围及暂存 blob；测试 blob 保持不变。历史实施与审阅检查点保留，受保护源保持 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。本步骤没有推送或创建新 PR。

## 持续限制与下一步

T/宿主机死亡、真实 PostgreSQL 持久性和物理清理、已部署监督和恢复授权、工作负载/密钥来源、Linux/Windows 均未验证。恢复准入及本计划中的连续代际编排仅面向本地测试 harness，不把本地成功当作 Hosted 激活依据。

不重试被阻止的 PG16 fixture，不创建替代 Preview，不接触真实 Auth/数据库角色或迁移、IAM、安装密钥、护理数据、真实 AI、Points/支付、云资源或生产部署。所有 readiness 标志保持 false，`HOSTED_WORKSPACE_READ_BINDING` 保持 undefined，受保护源工作树保持 `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

**下一步：**将本地文档提交推送到 `Millionluna/Codex-Game-Studios` 的 `codex/careslink-workspace-task-recovery-handoff` 分支，并以 `codex/careslink-ai-documents-v1-auth-gate` 为 base 创建草稿 PR；核对远端提交、两份文档及 PR 正文。尚未选择或实施第五阶段。
