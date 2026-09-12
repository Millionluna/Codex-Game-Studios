# QA Plan：Workspace/TLS 进程控制者实际死亡诊断

- 日期：2026-09-12（Australia/Melbourne）
- 工作流：仓库 `qa-plan`，按 CaresLink AI 本地集成测试范围调整
- 状态：13 项本地测试已实现并通过验证；四文件审阅完成，记录随本地提交保存，尚未发布
- 范围：一个集成功能，13 项本地集成测试
- 基线：PR #48 合并提交 `a3a71512990cd3dd1d3efd05afe8ccac88632fc7`
- 本地分支：`codex/careslink-workspace-task-controller-exit`
- 引擎 / story / sprint / GDD / ADR：未配置或没有对应条目；依据 M1Y 未验证边界和实际模块行为制定验收条件

## 基线与阶段选择

[PR #48](https://github.com/Millionluna/Codex-Game-Studios/pull/48) 已于 `2026-09-11T22:31:01Z`（墨尔本 `2026-09-12 08:31:01 +10:00`）合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并父提交为 `c5a366c3078eaed5de2e3940aa06d9a62affd3b6` 和已审阅的 `dc18c0b4d24861b55ad44ae9168011d80eb0014c`，文件树 `67a22a8c4bcd68e8ea06fe6060761954d3b881fa` 与审阅提交一致：4 个文件、1,031 行新增、没有删除。

PR #48 的既有证据为相关套件 **112 项通过 / 1 项既有跳过**，全套 **6,264 项通过 / 54 项跳过**，类型、Lint、73 个适配器同步和差异检查通过。其 9 份进程报告中，8 条父端断连路径未在窗口内观察到服务原生 close，1 条子端对照观察到 close；6 份诊断 VERIFIED，3 份注入故障保持 UNVERIFIED，全部确认测试资源收尾。以上属于合并基线，不是本阶段结果。

PR #47 覆盖 launcher 死亡，PR #48 覆盖存活 launcher 主动断连；两批的外层控制者均存活。M1Y 仍列出控制者/宿主机死亡、真实 PostgreSQL 持久性与物理清理、部署监督等未验证项。本阶段只选择**进程控制者实际死亡**，保留存活的外层审计器来采集证据。宿主机断电、外层测试进程自身死亡以及部署环境的监督行为仍不在覆盖范围。

本机 Node 仍为 `v22.23.2`。2026-09-12 核对的 [Node 子进程生命周期文档](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html#event-close) 区分子进程 exit 与 stdio 关闭后的 close；[`subprocess.killed`](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html#subprocesskilled) 不能证明进程已经退出。[进程 disconnect 文档](https://nodejs.org/download/release/v22.23.2/docs/api/process.html#event-disconnect) 将事件绑定到 IPC 通道关闭。以下验收依据这些语义和本地实现推导，实际级联结果见后文验证记录，不能只由文档推断成功。

仓库没有对应 `production/epics`、`production/sprints`、`design/gdd/systems-index.md` 或 `docs/architecture/control-manifest.md`。没有可引用的游戏公式；本计划直接列出集成行为的可证伪验收条件，沿用应用文档目录，不补造游戏 story。

## 源码依据与测试分配

下列路径相对于 `apps/careslink-ai/`：

| 文件 | 本阶段用途 |
|---|---|
| `documentation/communication-note-product-integration-m1y.md` | 合并记录及控制者死亡缺口 |
| `src/lib/communication-note-workspace-task-parent-exit.process.test.ts` | 实际 Workspace/TLS 请求、模拟账本、检查点和迟到 RPC |
| `src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts` | 原观察者失败保持、实际 owner 结果及资源收尾的参考 |
| `scripts/preview-e2e/communication-note-task-parent-disconnect-local-child.mjs` | launcher 在控制者 IPC 丢失时对 owned service 发送 SIGTERM 并失败退出的现有测试策略 |
| `scripts/preview-e2e/communication-note-task-process-observer.py` | 已有 macOS kqueue 单 PID 退出观察；不提供退出码或发信号 |
| `src/lib/communication-note-task-preview-host.server.ts` | 实际 SIGTERM/disconnect 停止、finished 与失败退出状态 |
| `src/lib/communication-note-task-preview-service.server.ts` | broker 丢失后实际 drain 失败及 cleanupConfirmed=false |
| `src/lib/communication-note-task-preview-https.server.ts` | finished 等待 listener/drain，实际 TLS 响应和监听关闭 |

| 验证范围 | 类型 | 自动化 | 人工核对 |
|---|---|---|---|
| 控制者死亡与 L/S 独立退出证据 | Integration | 原生退出、两个内核观察者、带身份的审计通道 | 事件归属与因果边界 |
| 实际请求中断与旧账本 | Integration | Workspace/TLS、模拟 Auth/PG/账本、迟到回复 | 503 与未确认清理的区别 |
| 故障证据和产品边界 | Integration | 观察者/帧故障、正式 route/import guard | 失败保持及无恢复入口 |

## 进程拓扑与失效对象

采用 `T → R → L → S` 的所有权链：

- **T：存活的外层测试/审计进程。** 拥有 R 和 O-L/O-S 的 ChildProcess 句柄，驱动实际 Workspace handler/client，持有模拟 Auth/PG 返回和原始账本 Map。
- **R：本次被终止的进程控制者。** fork 并拥有 L，负责启动和原生 IPC broker 消息转发；自身没有退出前清理 L/S 的“正常退出”预处理。
- **L：launcher。** fork 并拥有 S；其失去 R IPC 后的动作沿用前序本地夹具策略：对 owned S 发送 SIGTERM，随后自身失败退出。不得为了获得 S 的 close 而等到 S 退出后才退出 L。
- **S：实际 Workspace/TLS 服务。** 组合现有 service、HTTPS adapter 和 process owner。原生 SIGTERM/disconnect 触发实际停止，不用替身改写 owner 结果。
- **O-L / O-S：T 拥有的独立观察者。** 分别在触发前注册 L/S 的内核退出，复用已有 Python 实现。

与前序夹具相比，本计划显式将请求驱动和模拟账本放在 R 之外，才能在 R 死亡后读取结果。broker 唯一路径为 **T↔R↔L↔S 原生 IPC**；R 死亡后不得新增 T↔L/S broker 路径。这验证存活 Workspace 消费端面对进程控制者丢失的行为，不验证 Workspace handler 自身崩溃，也不证明账本经进程崩溃后持久保存：Map 留在 T 中只是明确的外部状态模拟。

上述 R/L 控制策略属于测试夹具，不是已部署监督器。T 的审计存活、观察者和退出屏障均为测试设施，其存在必须写入结果限制。

## 审计通道、身份与触发约束

1. T 在唯一自建临时目录内建立分别用于 L、S 的 Unix-domain 审计 socket。每个角色只接受一个由原启动链核验的连接；监听和连接均在启动时登记。消息使用固定字段、帧长上限、本次 nonce、角色、PID 和每通道严格递增序号。
2. L/S 的审计连接直达 T，不能经过将被杀死的 R；它们只承载身份、检查点、检查状态和退出释放证据。不得发送 broker、SQL、凭据、恢复指令或任意代码。S 私钥仅通过原初始化 IPC 交付，审计帧不包含私钥或 SCRAM verifier。
3. T 先获得 R 的原生句柄及 L/S 的原 IPC 身份，再分别等待 O-L/O-S armed；之后通过尚未中断的原 IPC 对 L/S 发起新挑战，核对 nonce、PID 和当时的 parent PID。额外审计连接也须与这些已核验身份匹配。父进程死亡后 parent PID 可能改变，不能用新 parent PID 替换原身份记录。
4. “正常退出”通过一次固定、带新挑战的 R 退出命令令 R 调用 `process.exit(0)`；“SIGKILL”只能调用 T 持有的 R 原句柄。两条路径均不得先断开 IPC、请求 L/S 停止或等待 owner 完成。R 的实际原生 exit 必须分别确认 code=0/signal=null 或 code=null/signal=SIGKILL；`kill()` 返回值不是结果。
5. L 的父端 IPC 丢失路径不得依赖 T 回复才继续。若死亡期间丢失某条 L 自报消息，保持该项证据未知；不能为了强行取得报告而改变其退出策略。
6. S 审计通道只提供 begin、身份挑战、inspect 和 release-exit 等固定测试控制。退出屏障在实际 owner finished 后保持 S 存活，释放只关闭该屏障并允许自然退出；不能借此执行成功 drain。完整结果要求有效的 owner-finished 和 exit-released 证据，watchdog 强制退出不算正常释放。
7. 原生子进程事件归原始父句柄所有。T 可直接观察 R 的 exit/close；R 死后不能假装 T 拥有 L 的原生 close，L 死后亦不能把 S 的内核退出或 socket EOF 当作 S 的原生 close。即使 S 曾上报 `process.exitCode=1`，也不能把它记作原父句柄确认的最终退出码。

## 验收结果字段

| 字段 | 可接受证据 / 必须保留的未知 |
|---|---|
| `controllerExit` / `controllerClose` | T 的 R 原生句柄事件及 code/signal；实际 close 单独等待 |
| `launcherExitEvidence` / `serviceExitEvidence` | 各自原观察者 armed 后的新身份挑战、唯一匹配 kernel-exit、观察者正常 close 才为 VERIFIED |
| L/S 原生 `exitCode`、`signal`、`close` | 只接受真实原父句柄事件；原父已死亡且没有记录时为 UNVERIFIED，并标明 owner exited；不得复用 PR #48 的“窗口内未观察到”结论 |
| `ownerOutcome` / `cleanupConfirmed` | S 实际 owner 的带身份结果；broker 丢失后预期 FAILED / false，缺失则保持未知并使相应用例失败 |
| `listenerClosed` | owner finished 后真实连接拒绝；ECONNRESET 或 destroy 调用本身不能替代确认 |
| `auditChannelsClosed` | T 持有的每条审计连接实际 end/close，不能标成 L/S stdout/stderr close |
| `diagnosticEvidence` | 预定义必需证据全部满足才 VERIFIED；设计上不可取得的原生子事件仍单列未知，不宣称生命周期所有字段齐全 |
| `teardownEvidence` | 所有已启动受控进程实际退出、T 持有流/请求/监听器实际关闭后才 CONFIRMED；不能改写原观察者失败 |

核心条件：

- R 的死亡由真实事件证实；L 和 S 的退出分别核验，不从 R 的 close 推断后代退出，也不要求跨不同观察通道的消息到达顺序等于内核发生顺序。
- 正常请求矩阵在实际 ISSUE_COMMITTED 或 FENCE_COMMITTED 检查点终止 R。存活的 Workspace 消费端返回 503、没有 taskPage；原 Map 保留 ISSUED/FENCED 项和旧 epoch。检查实际 TLS issue、模拟 PG 对象 end/destroy 与密码引用清除；尚未构造 PG 对象的路径不虚构 PG 清理证据。
- R/L 已确认退出、owner 已完成且 listener 拒绝连接时，S 仍能答复审计新挑战；O-S 尚无 kernel-exit。释放屏障后才等待 S 退出。这证明“控制者已退出”和“所有后代已退出”是不同条件。
- 原观察者失败或已绑定审计通道出现坏帧时，原结果持续 UNVERIFIED，后续正常帧和资源收尾不得清除失败。
- T 在 R 的原生断连/退出时关闭该代 broker 接受入口，结清或丢弃未完成 RPC。迟到回复只绑定原 R 句柄和 nonce；原 Map 不能因重播或绕行审计通道被更改。
- 不创建 successor/startRecovery 入口，不修改既有严格 successor 或恢复启动检查。没有后继启动入口不能当作验证过恢复准入。

## 自动化矩阵（13 项已实现并通过）

测试文件：`src/lib/communication-note-workspace-task-controller-exit.process.test.ts`。

| ID | 场景 | 关键断言 | 实际项数 |
|---|---|---|---:|
| CE-01 | 空账本、实际 R 正常退出 / SIGKILL | 原 R exit/close；L/S 各自身份及内核退出；owner 和审计连接结果独立；未知原生子事件不被补造 | 2 |
| CE-02 | ISSUE_COMMITTED / FENCE_COMMITTED × 两种 R 死亡方式 | 实际 Workspace 503、无 taskPage；原 Map/epoch 保留；真实 TLS 与模拟 PG 生命周期；两个后代退出分别证实 | 4 |
| CE-03 | R/L 死亡后，已停止 S 留在退出屏障 | listener 拒绝连接，S 新挑战仍成功、O-S 无退出；释放后才确认 S 退出 | 1 |
| CE-04 | 原 O-L 零超时 / 对原 O-S owned handle 发送 SIGKILL | 原证据失败保持；在触发前为仍活着的目标重新核验并预注册 teardown-only 观察者；收尾不能覆盖原结果 | 2 |
| CE-05 | S 有效退出释放帧之后注入错误 nonce / 重复 seq 的真实审计帧 | 原审计诊断保持失败，即使内核退出和资源收尾可验证；不能把后续有效消息当作恢复证据 | 2 |
| CE-06 | issue 已提交、回复暂停时 R 被 SIGKILL | 旧请求失败；释放/重播旧回复只作用于已退役 R 句柄并被丢弃；无审计 broker 通路，Map/epoch 不变 | 1 |
| CE-07 | 测试 Preview flags 下正式 route/import guard | formal runtime undefined、route 503；不调用 Auth/TLS/PG，不导入新夹具/观察者，不启动进程 | 1 |

CE-01 的两项控制先完成验证，随后执行 CE-02 至 CE-07。13 项测试全部通过，其中 12 项启动进程，CE-07 不启动进程。四份故障注入报告保持诊断 UNVERIFIED；这些测试通过表示失败未被掩盖，不表示原证据已经验证。

## 收尾、失败与资源边界

- 启动即登记 T 的每个 owned handle、已报告且身份核验的 L/S、审计监听器/连接和未完成请求，包括尚未 ready 的实例。T 不按进程名、端口或未核验 PID 发信号；R/L 只通过自身 owned ChildProcess 句柄操作直接子进程。
- L/S 可能很快退出，因此原观察者故障用例必须在终止 R **之前**准备 teardown-only 观察者，并通过活进程新挑战重新核验身份。若目标已消失且无可信退出证据，不能临时按旧 PID 重建“成功观察”。
- teardown-only 观察者使用独立字段，不覆盖 O-L/O-S 原始对象或失败标志。进程已退出和测试资源可删除不等于业务清理已确认。
- L/S 原父句柄随父进程消失时，未转发的 stdio 事件保持未知。文件删除条件以已核验的全部目标内核退出、T 实际持有的 R/观察者 close、审计 end/close、TLS 请求 close 和审计 listener close 为准，不宣称拿到了无法观察的原生子进程 close。
- 失败收尾释放测试屏障、取消并等待实际请求、结清旧 RPC，等待已登记进程。保留有限 watchdog 作为失败保护；缺失有效退出释放、未知退出、超时或残留对象都使测试失败并保留受控临时目录。不能扩大超时或跳过用例来把失败变成通过。
- 临时根使用唯一 `cl-task-controller-*` 目录；socket、bundle、证书和合成私钥仅在根内。根权限为 0700，私钥为 0600，Socket 路径控制在平台长度限制内；清理前核对 realpath 和自建路径。初始化传递后的私钥 Buffer 清零，日志不得包含凭据、任意环境值或 verifier。
- 审计通道仅为本地测试，必须验证角色、原始连接、nonce/PID/seq 和帧大小；其校验不构成生产工作负载身份或密钥来源认证。每代只能有预期连接数，额外或无效连接应拒绝并记录失败，不能静默替换现有连接。
- 本阶段限 macOS，复用当前 Node 与 Python kqueue；旧套件的 skip 条件不扩大，生产依赖和 Node 私有实现不修改。

## 实现文件、命令与执行顺序

已新增 `scripts/preview-e2e/communication-note-task-controller-exit-local-child.mjs` 和上述测试文件，并更新本计划及 M1Y。原 Python 观察者及既有 25/7/13/10 项相关套件保持不变；未提取跨套件公共 harness。实施中的两处修正均限于新测试/夹具：模拟 PG 对象数量，以及 broker IPC 发送失败先于 disconnect 到达时的 RPC 拒绝处理，没有修改产品模块。

以下命令已用于本地验证。CE-01 最先用 `-t CE-01` 单独执行；最终相关套件和全套采用 `--reporter verbose --silent false` 保存诊断输出。目录为 `apps/careslink-ai/`，始终取消实际 issuer socket 环境值：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-exit.process.test.ts -t CE-01 --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-controller-exit.process.test.ts src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts src/lib/communication-note-workspace-task-parent-exit.process.test.ts src/lib/communication-note-workspace-task-https.process.test.ts src/lib/communication-note-task-process-observation.process.test.ts src/lib/communication-note-task-preview-host.process.test.ts src/lib/communication-note-task-preview-https.server.test.ts --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/typescript/bin/tsc --noEmit --incremental false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/eslint/bin/eslint.js src/lib/communication-note-workspace-task-controller-exit.process.test.ts scripts/preview-e2e/communication-note-task-controller-exit-local-child.mjs
```

根目录运行 `python3 tools/sync_codex_adapters.py --check`、`git diff --check`，并检查新文件 whitespace。生产代码/依赖不变时沿用既有 build/client-boundary 证据；如发生相关修改，再运行对应检查。最终记录命令、退出码、绝对日期、平台、实际数量、所有诊断摘要和资源检查，不能仅记录“命令已运行”。

## 人工 QA、smoke 与完成定义

开发者执行 smoke，代码审阅者核对原始证据和以下清单；不需要 UI 截图或试玩签字：

1. 先核对两种 R 死亡真实触发及 T/R/L/S/O 身份，再确认没有提前清理或把 broker 转入审计通道。
2. 对照 R 原生退出、L/S 独立内核退出、S 实际 owner/listener 结束和活着的退出屏障，检查各字段的观察者来源。
3. 核对 ISSUE/FENCE 四条路径真实响应及原 Map/epoch；不能把外置 Map 的存活称作数据库持久性。
4. 核对两类观察者失败和两类坏帧均保留原失败，收尾成功不清除诊断失败。
5. 确认全部受控资源收尾或明确失败并留存证据，正式 route/runtime 仍关闭，既有恢复规则未改。

本功能实施完成需要全部满足：

- [x] CE-01 实际拓扑和收尾验证通过，再完成 CE-02 至 CE-07。
- [x] 所有验收条件有真实断言及诊断记录；预计数量替换为实际数量。
- [x] 不可观察的原生子事件、原观察者失败与 owner 清理失败分别报告。
- [x] 新套件、相关套件、全套、类型、Lint、适配器及差异检查完成，跳过单独列出。
- [x] 最终验证运行的全部受控资源确认收尾，临时根删除；早期失败证据目录按失败保留规则单独列出。
- [x] M1Y 与本计划更新为实际结果。
- [x] 四文件代码审阅完成，审阅记录随本地提交保存；发布为后续步骤。

## 2026-09-12 实施与验证记录

- 两项 CE-01 控制于本机 11:00:44 开始，**2 项通过 / 11 项按名称过滤**，用时 1.47 秒。原始日志为 `/private/tmp/careslink-controller-exit-controls.log`。
- 实际拓扑为 T→R→L→S，T 分别持有两条 Unix-domain 审计连接和 O-L/O-S。R 正常退出与 SIGKILL 均以原生 exit/close 验证；每个 L/S 原观察者在注册后通过原 IPC 和审计连接的新挑战核验身份。T 的模拟账本保留在原 Map 中，R 死亡后没有 broker 备用通道。
- 首轮相关套件为 **122 通过 / 3 失败 / 1 既有跳过**。两条 FENCE_COMMITTED 用例的 mock PG 数量断言写成一个，但实际读取实现先建立独立清理连接，再建立 reader，共两个；已将数量校正为两个，逐对象 end/destroy/密码清除断言保留。ISSUE_COMMITTED 仍断言零个 PG 对象。
- 另一处首轮失败为服务提前关闭审计连接、缺少 owner-finished。四轮 CE-02 定向诊断均通过，随后全套诊断再次捕获固定失败原因 `IPC_SEND_FAILED`：broker 发送错误回调可能先于原生 disconnect 事件到达，而夹具直接调用 process.exit(1)，中断了真实 owner 的停止流程。
- 修正后，该回调只拒绝并结清对应 RPC，由真实 service/owner 完成失败 drain。R/L 的上游转发失败也交由原生 disconnect 路径处理 owned child，避免转发回调提前退出。没有改写 Node 私有状态、合成断连、改变产品停止逻辑、延长产品超时或放宽 owner/退出断言。夹具仍保留固定失败诊断；出现 fixture-failed 或缺失有效退出释放时测试失败。
- 最终相关套件于 11:07:19 开始，**125 项通过 / 1 项既有跳过**，7 个文件通过，用时 10.15 秒。最终全套于 11:08:28 开始，**6,277 项通过 / 54 项跳过**，325 个文件通过 / 5 个跳过，用时 22.62 秒。命令退出码均为 0。
- 两次最终运行均实际记录到合计 2 次 broker 发送失败回调；相应用例仍获得实际 owner FAILED / cleanupConfirmed=false 和确认的资源收尾，证明修正路径被执行。最终 TypeScript、两个新增实现文件 ESLint、73 个适配器同步及差异/新文件 whitespace 检查通过。未改产品或依赖，未重复执行 build/client-boundary。
- 全套产生 **12 份进程诊断摘要：8 份 VERIFIED、4 份预期 UNVERIFIED**。其中原 O-L 超时、原 O-S SIGKILL 各保留一个退出证据未验证；两份坏审计帧保持 auditEvidence=UNVERIFIED，即使 L/S 内核退出可验证。12 份均为 owner FAILED / cleanupConfirmed=false、R 原生 close 已确认、审计连接关闭和 teardownEvidence=CONFIRMED。
- 12 份报告中的 L/S 原生退出码、信号和 close 均保留 UNVERIFIED / ORIGINAL_OWNER_EXITED。没有用内核退出或审计 EOF 补造原父句柄事件，也没有新增后继启动许可。CE-03 实际证明 R/L 已退出且 listener 已关闭时 S 仍可回答新挑战，释放屏障后才出现服务内核退出。
- 最终日志：`/private/tmp/careslink-controller-exit-focused-final.log`、`/private/tmp/careslink-controller-exit-full-final.log`、`/private/tmp/careslink-controller-exit-types.log`、`/private/tmp/careslink-controller-exit-lint.log`。类型与 Lint 日志为空且退出码为 0。最初相关失败保存在 `careslink-controller-exit-focused.log`，定位发送失败的全套日志为 `careslink-controller-exit-full-diagnostic.log`，均位于 `/private/tmp/`。

### 资源与失败证据

最终成功运行按逐对象证据确认 R、O-L/O-S 和所有后代退出，等待审计/TLS 连接及 listener 关闭后删除临时根。最终只读进程检查未发现本批夹具或观察者仍在运行，源工作树保持 clean / `31fc94dfc3813967fd1dfadc1f9ac7a4851725a9`。

两次早期失败按计划保留 `/private/tmp/cl-task-controller-75ZRdn` 和 `/private/tmp/cl-task-controller-5mppdT`，没有将它们伪报成成功收尾。这些仅包含本地测试 bundle 和合成证书材料，不含真实凭据。第二次失败日志保存了原始 PID/nonce、两个观察者 code=0/正常 close、内核退出验证和已关闭审计连接，但缺少 owner-finished/退出释放，故该测试仍失败。首轮没有同等完整的失败诊断，不能以之后的成功运行补写其证据。以上两个根作为失败证据保留，不计为最终成功运行的临时残留。最终库存中 `cl-task-disconnect-*`、`cl-task-parent-*`、`cl-task-chain-*`、`cl-task-observe-*`、`cl-task-host-*` 和 `cl-task-https-*` 均为空。

## 2026-09-12 代码审阅

按仓库 `code-review` 流程在本地审阅四文件、对应实际生命周期实现和原始日志。结论为 **APPROVED WITH SUGGESTIONS**，没有必须修复项。

| 审阅项 | 结论 |
|---|---|
| 引擎 / ADR | 未配置引擎；目标文件、QA 条件及基线提交信息没有 ADR 编号引用，跳过引擎和 ADR 专项 |
| 可测试性 | CE-01 至 CE-07 对应 13 项用例；实际 R 退出、L/S 新身份挑战、独立观察、非空账本、存活屏障及四类故障均有可执行断言 |
| 发送失败竞态 | S 的失败回调结清对应 RPC，实际 service/owner 继续停止；原生断连仍拥有级联停止行为。最终相关及全套日志均实际执行此路径，没有提前 process.exit 冒充 owner 完成 |
| 原生事件与诊断 | R 的原生 exit/close 与 L/S 内核退出分别核对；原父已退出且未取得的原生子事件保持未知；审计 EOF 不被标为子进程 close |
| 失败保持与收尾 | 原观察者未被 teardown-only 观察者替换；nonce/seq 坏帧失败保持；最终 12 份报告确认资源收尾，两个早期失败根仍按原证据限制保留 |
| 架构 / SOLID | 产品不依赖测试夹具；实际生命周期模块与外部 Auth/PG/账本模拟边界明确；固定审计控制不提供 broker、SQL 或后继入口；没有发现循环依赖或层间职责违反 |
| 通用规范 | 没有新增产品 public API 或游戏配置；测试依赖和固定夹具值来源明确。测试文件第 52 行模拟协议、229 行审计解析及 309 行 IPC 校验的分支/条件较密集，不宣称全部符合通用复杂度建议 |
| 证据优点 | 既验证真实故障，也保留无法观察的字段；4 份预期 UNVERIFIED 在完整资源收尾后未被改写。失败日志和成功日志分开保留，首次证据缺口未补造 |
| 必须修改 / 建议 | 无必须修改项。后续扩展时可提取具名的消息校验函数，并评估重复 harness 的有限复用；本批不引入独立重构 |

本次逐项核对最终相关套件 125 通过 / 1 跳过、全套 6,277 通过 / 54 跳过，以及每轮全部 12 份诊断记录；也核对早期 IPC_SEND_FAILED 原因和失败收尾记录。审阅仅补充文档并校正命令展示，未改已验证的测试或夹具，因此沿用最终执行证据。提交前重新检查适配器同步、差异/新文件 whitespace、四文件范围和源工作树状态。

## 持续限制与下一步

不重试被阻止的 PG16 fixture，不创建替代 Preview，不接触真实 Auth/数据库角色或迁移、IAM、安装密钥、护理数据、真实 AI、Points/支付、云资源或生产部署。所有 readiness 标志保持 false，`HOSTED_WORKSPACE_READ_BINDING` 保持 undefined，源工作树保持不动。

T/宿主机死亡、真正数据库持久性和物理清理、Linux/Windows、已部署监督、工作负载/密钥来源，以及控制者死亡后的后继恢复政策仍未验证。本地测试通过不构成 Hosted 激活依据。

**下一步：** 将本批已审阅的本地提交推送到 `Millionluna/Codex-Game-Studios` 的 `codex/careslink-workspace-task-controller-exit` 分支，以 `codex/careslink-ai-documents-v1-auth-gate` 为基线创建草稿 PR；发布另行执行。
