【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s4rg-regress：修 S4 合入后的 6 个回归（a3a 上全过，s4a 上失败）

工作区 F:/dnd-wt/S4RG（分支 t-s4rg，基于 s4a）。对照基线：F:/dnd-wt/A3A（a3a，下面 6 个文件在那里全部通过）。

## 失败清单（逐文件单独进程跑）
1. tests/environment.test.mjs —「法术失败仍耗魔时间与练习但不修改水，许可施法中到期不生效，局部走近实际改变距离…」
2. tests/magic-area-actions.test.mjs —「真实HTTP普通动作生成双NPC位置，多目标与友军受伤，离界和重入沿同一消费者」与「正常巢穴生成的两个怪物逐个接触后参与玩家区域，怪物出界和重入更新成员」
3. tests/magic-mind-space.test.mjs —「自愿精神观察只返回干扰存在，不泄露思想；缺同意、许可、实际视线拒绝」
4. tests/magic-water-earth.test.mjs —「石弹消耗真实小石，正常活体伤害和实体命中都有持久落地归属」
5. tests/s2c-run001r.test.mjs — E11「original scenario could not execute; see diagnostics」

## 背景（可能的来源，需你核实）
S4 已合入：01 区内布局（place-layout.mjs，区间邻接=距离，走近要真实移动 world_move/局部移动）、02 感知（perception.mjs，视/听/触分开判定）、03 规范栈、04 机构、08 任免同意（organizations.mjs：入会/退会/任命须本人真实同意，NPC 通过 requestContractConsent 自己决定，调用参数 consent:true 不再能代填）。1–4 多半与「接触/距离需要真实走近」（engine.primitiveTargetFacts 里的 zoneContactPending）或感知改动有关；5 多半与 S4-08 不再接受代填同意有关。

## 要求
- 先逐个找根因：是生产代码在旧玩法上判错（修生产代码），还是测试前提靠旧的捷径（比如没有真实走近就要求接触、用 consent:true 代填 NPC 同意）。
- 测试前提不对时，改为用真实动作产生前提（真实 world_move/局部走近、等 NPC 在场、让 NPC 经自己的决定同意），不放宽断言、不删断言、不加只给测试用的接口或内容、不写死特判。
- 冻结语料（tests/playtests/、scorer、frozen corpus 里的场景文本）不改。E11 若原场景文本按新规则确实应被拒（例如原场景就是替 NPC 代填同意），停下，在汇报里写清原文、新规则、你的判断，不要自行改场景。
- 若修复需要改 S4 设计决定（A 区间邻接即距离；B 任免只走章程任免链；C 历史前提用真实动作+等待；D 犯罪先成事件、立案才成案件；E 缺规范数据不猜），停下汇报。

## 可改
server-plugin/ 下与根因直接相关的模块（place-layout、perception、engine 的接触/距离、magic-*、organizations、environment*）；上面 5 个测试文件。不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态。

## 验收
上面 5 个文件逐个单独进程跑全过；再跑 tests/s4-layout、s4-perception、s4-office-quests、organizations、draw-water、arch-metrics、overfit-guard 各一次，全过；CORE 三件（engine/storage/plugin）全过。沙箱拦 spawn 时用 --test-isolation=none。

## 汇报（≤400 字）
每个失败的根因一句、改了哪些文件、跑的命令和 pass/fail 数、偏离指令处、未解决问题。不贴代码与完整日志。
