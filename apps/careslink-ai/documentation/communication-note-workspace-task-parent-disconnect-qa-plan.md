# QA Plan：Workspace/TLS 父端主动 IPC 断连诊断

- 日期：2026-09-11
- 工作流：仓库 `qa-plan`，按 CaresLink AI 测试工具范围调整
- 状态：10 项本地诊断测试已实现并通过验证；四文件审阅完成，审阅记录随本地提交保存，尚未发布
- 范围：一个集成功能，10 项本地诊断测试
- 基线：PR #47 合并提交 `c5a366c3078eaed5de2e3940aa06d9a62affd3b6`
- 本地分支：`codex/careslink-workspace-task-parent-disconnect`
- 引擎 / story / GDD / ADR：没有已配置引擎或对应独立条目；从 M1Y 已记录缺口和实际模块行为推导验收条件

## 基线、来源与阶段选择

[PR #47](https://github.com/Millionluna/Codex-Game-Studios/pull/47) 于 `2026-09-11T11:09:00Z` 合并到 `codex/careslink-ai-documents-v1-auth-gate`。合并父提交为 `d9bdec5` 和已审阅的 `c80f117`；合并文件树 `6b8dfcf8601420e6680647fea40f094cfdafc2c7` 与后者完全一致。

已完成证据包括：25 项 Workspace/TLS 测试、7 项最小退出观察测试，以及 13 项实际父进程死亡联合测试。PR #47 最终相关套件为 **102 项通过 / 1 项既有跳过**，全套为 **6,254 项通过 / 54 项跳过**。这些是合并基线的结果，不是本计划的新测试结果。

下一阶段选择 M1Y 已记录的父端主动 `ChildProcess.disconnect()` 边界。PR #45 采用子端主动断连，PR #46/#47 采用 launcher 实际死亡；两者都不能回答“launcher 活着并主动断开其服务 IPC”时所有生命周期事件如何完成。实际数据库清理、宿主机/控制者死亡和已部署监督需要不同的验证条件，本阶段保持未验证。

本机 `node --version` 为 `v22.23.2`。2026-09-11 核对的 [Node 官方生命周期文档](https://nodejs.org/download/release/v22.23.2/docs/api/child_process.html#event-close) 区分了 `disconnect`、`exit` 和 stdio 关闭后的 `close`；[Node #65646](https://github.com/nodejs/node/issues/65646) 当日仍开放，报告父端主动断连后缺少 `close` 的现象。该报告是调查线索，不替代本应用夹具的实际结果，也不证明其他平台或版本的行为。

本计划只诊断该边界并验证实际请求的失败处理，不修补 Node、不安装新监督器、不引入新的后继启动许可。已有严格 `successor()` 和 PR #47 的恢复启动检查保持不变。

源码依据（以下路径相对于 `apps/careslink-ai/`）：

| 文件 | 用途 |
|---|---|
| `documentation/communication-note-product-integration-m1y.md` | 主动断连缺口及前序验证边界 |
| `src/lib/communication-note-workspace-task-https.process.test.ts` | 实际 TLS/Workspace harness 与子端主动断连证据 |
| `scripts/preview-e2e/communication-note-task-https-local-child.mjs` | 原生 `process.disconnect()` 对照路径，实际 service/HTTPS/owner |
| `src/lib/communication-note-workspace-task-parent-exit.process.test.ts` | 保留模拟账本、检查点、原观察者身份核验、迟到 RPC 与失败收尾 |
| `scripts/preview-e2e/communication-note-task-parent-exit-local-child.mjs` | R/L/S 进程隔离及独立控制通道的参考实现 |
| `scripts/preview-e2e/communication-note-task-process-observer.py` | 复用的 macOS 内核退出观察，不发送信号 |
| `src/lib/communication-note-task-preview-host.server.ts` | 实际原生 disconnect 停止路径和退出状态 |
| `src/lib/communication-note-task-preview-https.server.ts` | 真实 listener/drain 完成和响应发送边界 |

仓库没有对应 `production/epics`、`production/sprints`、`design/gdd/systems-index.md` 或 `docs/architecture/control-manifest.md`。本计划不补造 story、公式或游戏验收要求。

## 测试分配

| 范围 | 类型 | 自动化 | 人工核对 |
|---|---|---|---|
| 存活父端主动断连与各层生命周期 | Integration | 原生 IPC、ChildProcess 事件、内核观察、真实流关闭 | 身份、事件来源和观测窗口 |
| 未完成 Workspace 请求与非空账本 | Integration | 实际签名/TLS、Workspace 响应、模拟账本状态 | Auth/PG/账本的模拟边界 |
| 失效观察者、坏帧、迟到回复 | Integration | 固定故障注入、失败保持、资源收尾 | 原始证据未被收尾结果覆盖 |
| 产品边界 | Integration | 正式 route 和导入检查 | readiness 未开启 |

不涉及 UI、视觉或玩家体验；不需要截图或试玩。开发者执行 smoke，代码审阅核对证据链后才算完成验证。

## 进程拓扑与事件归属

继续使用隔离的控制者 R、launcher L、服务 S 和观察者 O。R 持有 Workspace client、模拟 Auth/PG 和账本，并拥有 L/O 的进程句柄；L 通过自己的 `fork()` 句柄拥有 S。实际 broker 仍经 R↔L↔S 的原生 IPC 转发。

与 PR #47 的区别是：L 在关键观测期间一直存活，由 L 对它拥有的 S 调用一次真实 `child.disconnect()`。R↔L 的 IPC 保持连接，R 在断连前及 S 退出后分别对 L 发起带 nonce 的新身份挑战。不得以先杀 L、子端断连或合成 disconnect 事件替代该触发。

L 必须在 S 启动时就分别监听 S 的 `disconnect`、`exit`、`close`，并为 S 的 stdout/stderr 建立独立管道，记录真实 `end`/`close`；不能把 L 的 stdio 关闭冒充 S 的 stdio 关闭。记录中的退出码来自 L 的原生 ChildProcess 事件，O 不提供退出码。

L↔S 额外 fd 4 只承载有界的身份、检查点、检查状态和退出释放消息。它在 broker IPC 失效后仍可帮助观测，但不能承载 SQL/RPC 回复、代写账本或补写 owner 成功结果。L 把这些观测转发给 R，始终区分原生事件记录和服务控制消息。每一条记录绑定本次 nonce、L/S PID 和本地递增序号；通道解析或身份错误保持失败。

R 创建 O 并预注册 S 的内核退出观察；O 报告 armed 后，通过尚未断开的原始 R↔L↔S IPC 再核验 S 的 nonce、PID、parent PID。注册和身份挑战完成前不得触发断连。

## 结果字段与验收条件

诊断记录至少包含以下独立字段，不能只输出一个笼统的“清理成功”：

| 字段 | 可接受证据 / 含义 |
|---|---|
| `parentAliveAtDisconnect` / `parentAliveAfterServiceExit` | R↔L 新挑战的匹配回复；不是旧消息或 PID 存在性推断 |
| `serviceExitEvidence` | 原观察者身份匹配、匹配 kernel-exit、原观察者实际成功关闭才为 VERIFIED；否则为 UNVERIFIED |
| `serviceExitCode` / `serviceExitSignal` | L 从 S 原生 exit 事件收到的值；缺失时保留未知 |
| `serviceNodeClose` | OBSERVED 或 NOT_OBSERVED_IN_WINDOW；前者只能来自 S 原生 ChildProcess close |
| `serviceStreamsClosed` | S 独立 stdout/stderr 和 fd 4 的实际关闭；不能用进程退出或 destroy 调用替代事件 |
| `ownerOutcome` / `cleanupConfirmed` | 实际 owner 结果；非空账本且 broker 丢失时保留 FAILED / false |
| `teardownEvidence` | 仅记录测试资源能否删除；收尾观察者不得改写原始 `serviceExitEvidence` |

核心验收条件：

1. 触发前 L/S 身份均已核验；断连后 L 保持存活，实际 broker 通路已丢失。
2. ISSUE_COMMITTED / FENCE_COMMITTED 检查点由实际 Workspace 请求触发。请求返回 503 且无 taskPage；同一个 Map 保留 ISSUED / FENCED 项，不清空或重新播种。
3. 等待实际 owner 完成后才检查旧 listener 拒绝连接。保留 S 的明确退出屏障，用新 fd 4 挑战证明“owner finished、监听关闭”时 S 仍可存活，O 此时不能已有匹配退出事件。
4. 释放 S 的退出屏障后分别获取原观察者结果、原生 exit、独立流关闭和原生 close。对照路径使用子端原生断连，要求真实 close 出现一次，事件先后与退出状态一致。
5. 父端断连路径在独立退出和流关闭证据到齐后保留 250ms 的有界 close 观测窗口。若未收到，只能报告 NOT_OBSERVED_IN_WINDOW；这不证明永远不会收到，也不构成 close、清理或恢复许可。若收到则据实记录，不为了复现旧问题改写为缺失。报告记录实际 Node/平台/架构和观测窗口。
6. 观察者失败、控制通道坏帧或原始身份不匹配必须使对应诊断结果保持 UNVERIFIED，不能用随后收尾成功覆盖。诊断窗口结束与资源收尾超时是不同结果：后者必须使测试失败。
7. 迟到 RPC 绑定原句柄和 nonce；L 在 S IPC 断开后停止转发旧调用/回复，R 结清或丢弃旧工作，不再提交新的协议操作。不能使用 fd 4 作为备用通路。
8. 本阶段夹具不提供恢复启动入口。无后继实现所带来的“没有新进程”不算已验证恢复准入；报告只覆盖断连诊断。原先已验证的恢复规则保留各自范围。

## 自动化矩阵（已实现）

实际测试文件：`src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts`。PD-01 至 PD-07 共 **10 项测试全部通过**；原方案和实际覆盖对应如下。

| ID | 场景 | 关键断言 | 实际项数 |
|---|---|---|---:|
| PD-01 | 同一实际拓扑的父端主动断连与子端主动断连对照 | L 始终活着；原生触发来源明确；独立记录 exit/流关闭/close；子端对照真实 close 出现，父端据实诊断 | 2 |
| PD-02 | 实际请求分别在 issue/fence 提交点被父端断连 | Workspace 503、无 taskPage、Map 保留旧状态、实际 owner FAILED/false，完整退出诊断 | 2 |
| PD-03 | owner 完成、listener 关闭后 S 留在退出屏障 | 新挑战证明 S 仍活着，原观察者尚无退出；释放后才出现匹配内核事件 | 1 |
| PD-04 | 原观察者零超时 / 对其 owned handle 实际 SIGKILL | 原报告保留 UNVERIFIED；独立收尾观察者可清理资源但不能补成验证成功 | 2 |
| PD-05 | 有效消息之后从真实 fd 4 注入损坏帧 | 原诊断保持通道失败；实际退出和后续正常消息不能消除该失败 | 1 |
| PD-06 | 模拟 issue 已提交但回复被暂停，随后父端断连 | 旧请求失败；释放回复只结清/丢弃旧工作；无 fd 4 broker 回复，Map 不被迟到动作修改 | 1 |
| PD-07 | 测试 Preview flags 下正式 route 与产品导入 | 正式 runtime 仍 undefined / route 503；产品不导入夹具或观察者，不调用 Auth/TLS/PG | 1 |

PD-01 的父端 close 缺失诊断允许记录一个有效的“窗口内未观察到”结果；这类测试通过仅证明诊断诚实且资源收尾完成，不能标为 Node close 兼容性通过。实现记录必须单独公布两类路径的实际观测，不能把预计结果写死为测试成功。

## 实现文件与顺序

已新增 `scripts/preview-e2e/communication-note-task-parent-disconnect-local-child.mjs`，组合现有实际 service/HTTPS/owner；直接复用原 Python 观察者，未复制内核实现。上述测试文件、本计划与 M1Y 构成本批四个文件。

先运行 PD-01 两个路径，核实 L/S 的事件归属、close 观测及实际资源收尾，再运行非空账本和其他故障矩阵。新套件沿用现有合成证书和固定地址的 harness 写法，本批未提取共享 helper。

原 25 项 Workspace/TLS、7 项退出探针、13 项父进程死亡测试及其恢复检查保持不变。当前计划不包含产品模块、依赖、Node 版本或配置变更；若实际组合发现产品缺陷，先记录失败和具体修复范围，不能通过替换实际模块或放宽断言消除失败。

## 收尾、日志与平台边界

- 在启动时登记 owned handle，包括尚未完成身份核验的启动失败。只通过这些句柄发送信号；不使用进程名、端口或未经核验 PID 寻找和终止进程。
- S 释放退出后，分别等待真实内核退出与所有受测管道/HTTPS 请求关闭。L 保持存活至 close 观测窗口和最终快照完成，再通过明确收尾命令退出。R 不主动断开它与 L 的 IPC，最终等待 L/O 的真实 ChildProcess close。
- 只观察到 L 退出不能替代 S 的退出证据。S 原生 close 缺失仍保持该诊断；在 S 内核退出、独立管道关闭和 L/O 实际收尾均已核验时，可以删除仅属于本测试的临时文件，这不授予产品恢复许可。
- 原观察者失败后，另建观察者前必须仍能对活着的 S 重新挑战身份；新证据只用于 teardown。若服务已消失且无可信退出证据，保持未确认，测试失败并保留受控临时目录，不据此创建后继。
- 出错收尾释放测试屏障、取消并等待请求、结清旧 RPC。watchdog 或强制退出必须标记失败，不能伪装正常屏障释放或 owner 清理确认；任何必要资源未关闭都使测试失败。
- 合成证书、私钥和 bundle 只放入唯一自建临时目录；文件权限和 Buffer 清理沿用现有约束。日志只包含固定状态、版本、nonce/PID 与事件序号，不输出凭据、SCRAM verifier 或环境值。
- 新套件限 macOS；不扩大旧套件的 skip 条件，不将其他平台跳过写为通过。保持当前 Node 和依赖，不安装补丁版本来回避待诊断行为。

## 验证命令、人工 QA 与 smoke

以下命令已完成本地验证。工作目录为 `apps/careslink-ai/`，始终取消实际 issuer socket 环境值：

```sh
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts src/lib/communication-note-workspace-task-parent-exit.process.test.ts src/lib/communication-note-workspace-task-https.process.test.ts src/lib/communication-note-task-process-observation.process.test.ts src/lib/communication-note-task-preview-host.process.test.ts src/lib/communication-note-task-preview-https.server.test.ts --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/vitest/vitest.mjs run --reporter verbose --silent false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/typescript/bin/tsc --noEmit --incremental false
env -u CARESLINK_TASK_ISSUER_LOCAL_SOCKET node node_modules/eslint/bin/eslint.js src/lib/communication-note-workspace-task-parent-disconnect.process.test.ts scripts/preview-e2e/communication-note-task-parent-disconnect-local-child.mjs
```

如实际修改其他测试/helper，应纳入 Lint。仓库根目录检查 `python3 tools/sync_codex_adapters.py --check` 和 `git diff --check`。只有测试/文档变化时沿用未变化的生产构建证据；产品或依赖若变化，再运行相应 build/client-boundary 检查。

人工 QA / smoke：

1. 对照每类事件的实际发送者、nonce/PID 和原始句柄，确认没有合成事件或改写 Node 私有计数器。
2. 原身份核验 → 真正父端断连且 L 活着 → 请求 503 / listener 关闭 / S 仍活着 → 释放 S → 内核及流关闭观察 → close 独立诊断 → L/O 实际收尾。
3. 核对父端路径与子端对照的版本、窗口和结果，分别报告观察到、未观察到、未验证；不报告修复了上游问题。
4. 检查所有故障用例的原始失败保持，确认无未收尾进程/监听器/证书；无法证明收尾时列出受控对象并保留证据。
5. 确认没有正式 route 激活和产品导入，没有 Node 补丁、新监督器或新恢复许可。

不需要试玩或视觉签字。代码审阅必须检查上述可证伪条件和真实输出，而不是只检查测试数量。

## 完成定义及持续限制

- [x] PD-01 对照完成，事件归属和收尾方式有实际结果。
- [x] PD-02 至 PD-07 有运行证据；预计项数替换为实际项数。
- [x] 原有套件、全套、类型、Lint 和差异检查通过；跳过和未验证单独报告。
- [x] close 诊断、内核退出、owner 清理及 teardown 四类结果没有混淆。
- [x] 各用例确认受控进程和流关闭后删除临时资源，最终临时目录检查无残留。
- [x] 本计划和 M1Y 更新为实际结果。
- [x] 四文件代码审阅完成，审阅记录随本批本地提交保存。

### 2026-09-11 本地实施结果

- 父端/子端对照于本机 21:50:02 开始，2 项通过、8 项被名称过滤，用时 1.64 秒。两个路径均核验原身份、内核退出、原生 exit、独立管道关闭，以及 S 退出后 L 仍存活。
- 全套中的 9 份进程诊断记录显示：8 条父端路径均为 `NOT_OBSERVED_IN_WINDOW / closeCount=0`；1 条子端对照为 `OBSERVED / closeCount=1`。窗口为独立退出及流关闭证据齐全之后至少 250ms，Node 为 v22.23.2、平台 darwin/arm64。没有据此宣称 Node 问题已修复或永远不会发送 close。
- 所有进程用例实际 owner 结果为 `FAILED / cleanupConfirmed=false`，S 原生退出码为 1、无退出信号。模拟 broker 的丢失没有被 fd 4 备用通道掩盖。
- ISSUE_COMMITTED/FENCE_COMMITTED 由真实 Workspace 请求驱动，断连后响应为 503 且无 taskPage；原 Map 保留对应状态和 epoch。实际 TLS issue 握手成功，模拟 PG 对象的 end/destroy 与密码引用清除断言通过。
- 原观察者超时、原观察者 SIGKILL、损坏控制帧三类注入各自保留 `diagnosticEvidence=UNVERIFIED`。前两类的原内核退出验证保持 UNVERIFIED；坏帧用例的内核退出仍可验证，但控制证据保持失败。这三份记录均未被后续 teardown 改写。
- 其余 6 份记录为 VERIFIED，9 份记录的 `teardownEvidence` 均为 CONFIRMED。第 10 项是正式 route/import guard，不启动进程，因此没有进程诊断记录。这里 VERIFIED 表示诊断证据齐全，不代表 owner 清理或 Node close 成功。
- 迟到 issue 回复先在 R 结清并丢弃，再通过仍存活的原 L 重放；L 的原生断连状态拒绝向 S 转发，记录 protocol-dropped，账本和 epoch 不变。没有后继启动入口或新增恢复规则。
- 相关 6 个测试文件 **112 项通过 / 1 项既有跳过**，21:50:41 开始，用时 10.25 秒。全套 **6,264 项通过 / 54 项跳过**，324 个文件通过 / 5 个跳过，21:52:01 开始，用时 19.20 秒。
- TypeScript、两个新增实现文件 ESLint、73 个适配器同步和差异检查通过。生产代码、依赖、原 25/7/13 项套件及两个恢复检查未修改；未重复执行生产 build/client-boundary 检查。
- 本地证据日志：`/private/tmp/careslink-parent-disconnect-controls.log`、`/private/tmp/careslink-parent-disconnect-focused.log`、`/private/tmp/careslink-parent-disconnect-full.log`。全套 verbose 日志包含上述 9 份固定诊断摘要；类型和 Lint 日志为空且命令退出码为 0。

### 2026-09-11 代码审阅

按仓库 `code-review` 流程本地审阅四文件及对应验收条件，结论为 **APPROVED WITH SUGGESTIONS**，没有必须修复项。

| 审阅项 | 结论 |
|---|---|
| 引擎 / ADR | 没有配置引擎；目标文件头、QA 计划及相关提交信息没有 ADR 引用，跳过对应检查 |
| 可测试性 | PD-01 至 PD-07 对应 10 项用例，原生断连对照、非空账本、存活屏障和三类故障均有实际断言 |
| 事件与诊断 | L 从原生 ChildProcess/独立管道读取事件；R/O 在触发前核验身份；缺少 close 的窗口结果与内核退出、owner 清理分别保存；未发现伪造事件或混淆成功状态 |
| 失败与收尾 | 控制坏帧错误保持失败；原观察者未被收尾观察者替换；临时资源删除要求实际退出和流关闭；没有修改既有后继检查或新增恢复许可 |
| 架构 / SOLID | 产品不依赖测试夹具；外部 Auth/PG/账本模拟边界明确；fd 4 不提供 broker 回复，旧回复由原句柄的断连检查丢弃 |
| 通用规范建议 | launcher 的消息分派器（脚本第 43 行）较长，模拟协议（测试第 52 行）分支较多，未满足通用长度/复杂度建议；列为可读性建议，不宣称六项规范全部通过 |
| 证据优点 | 父端存活状态经新挑战确认；原生 close 与实际管道关闭独立记录；三份预期 UNVERIFIED 结果在资源收尾后仍未被覆盖 |
| 必须修改 / 后续建议 | 无必须修改项。以后扩展协议时可拆分 launcher 初始化与命令分派，并评估重复 harness 的小范围复用；本批不引入独立重构 |

本次核对既有全套 6,264 通过 / 54 跳过、相关套件 112 通过 / 1 跳过和全部 9 份诊断记录。审阅只补充文档，未改动已验证的实现，因此沿用上述运行证据；提交前重新检查适配器同步、差异和源工作树状态。

本计划延续既有授权边界：不重试被阻止的 PG16 fixture，不创建替代 Preview，不访问真实 Auth/数据库角色或迁移、IAM、安装密钥、护理数据、真实 AI、Points/支付、云资源或生产部署。Auth、PG 返回和账本仍为显式模拟；readiness 标志保持 false，`HOSTED_WORKSPACE_READ_BINDING` 保持 undefined，源工作树保持不动。

控制者/宿主机死亡、真实 PostgreSQL 持久性和物理清理、Linux/Windows、工作负载与密钥来源、部署监督和父端断连后的后继恢复政策仍未验证。本地诊断即使全部通过，也不构成 Hosted 激活依据。

**下一步：** 将本批已审阅的本地提交推送到 `Millionluna/Codex-Game-Studios` 的 `codex/careslink-workspace-task-parent-disconnect` 分支，以 `codex/careslink-ai-documents-v1-auth-gate` 为基线创建草稿 PR；发布另行执行。
