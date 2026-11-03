【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 arch-deps（a3a 收口：消除今天新增的 8 条反向层依赖）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3AD（分支 t-a3ad，自最新 a3a）。先读 docs/产品原则.md 与 tools/arch-layers.mjs（L0 内核 / L1 本体 / L2 玩法包 / L3 投影 / L4 接口；tests/arch-metrics.test.mjs 只拦新增违例，基线在 tests/metrics/*.baseline.json）。
目标（一句话）：tests/arch-metrics.test.mjs 通过，且不抬基线、不放宽检查；做法是让依赖方向符合分层——把被下层需要的那一小块只读视图/纯函数下沉到合适的层（或在正确层次新建一个只读模块），或者在模块确实被错分层时按其实际职责更正分层并写明依据；不允许为过检查而复制逻辑成第二份。
当前新增违例（下层 → 上层）：
- action-boundary → action-registry、open-actions（拒绝投影为推荐下一步而查动作目录与开放动作）
- action-limits → standing（难度派生读立场）
- contracts → npc-relations、law → npc-relations（读 relationView）
- engine → routing-programs、routing-programs → dialogue
- repair → npc-schedule
建议思路（自行核实后决定）：relationView 是“关系的唯一读视图”，可下沉为 L1 的只读模块，npc-relations 保留写入；立场读取同理；拒绝投影推荐下一步可改为由上层注入（已安装运行时/回调）而非静态导入；repair 需要的作息信息改为读派生视图或由调用方传入。每处说明选择理由。行为必须完全不变：不改任何规则、数值或回执内容。
可改：上述涉及的 server-plugin 模块、新建的只读模块、tools/arch-layers.mjs（仅为新模块归层或更正明显错分层，逐处写依据）、docs/system-map.html/json（运行 node tools/system-map.mjs 生成）。锁定：tests/metrics/*.baseline.json、所有测试断言、world/、其他 docs/。
验收：node --test --test-isolation=none tests/arch-metrics.test.mjs tests/system-map.test.mjs；再跑受影响模块的测试（rg 引用这些模块的 tests，至少 tests/a3-refusal-contract、a3-derived-difficulty、contracts、law、npc-relations、repair、a3-routing、a3-structural-routing、a2-dialogue）全部通过；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），失败只允许“A3 real proposal engine meets the explicit stage thresholds”。
不调用真实模型。预计规模：小到中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（每条依赖的处理方式与理由、改动文件、验收结果），同样写到 F:/dnd/logs/sessions/arch-deps.final.txt。
