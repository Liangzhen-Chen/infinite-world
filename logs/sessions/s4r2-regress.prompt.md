【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s4r2：S4 回归修复——规范栈/机构/世界内容审批

工作区 F:/dnd-wt/S4R2（分支 t-s4r2，基于 s4a 237fcdb7）。

## 本卡负责的失败文件
- tests/a3-world-approval.test.mjs
- tests/a3-content-approval.test.mjs
- tests/a3-owner-yi.test.mjs
- tests/npc-depth.test.mjs
- tests/npc-depth-lq.test.mjs
- tests/npc-depth-sb.test.mjs
- tests/governance-titles.test.mjs
- tests/finance-assets.test.mjs

## 背景（四张并行修复卡共用）
s4a（S4 集成分支）合入了 S4-01 区内布局（place-layout，区间邻接=距离，走近要真实移动）、S4-02 感知（perception，视/听/触分开判定）、S4-03 法域规范栈（norm-stack）、S4-04 机构与在岗职位、S4-05 文书原件（交易会写 item_sale 记录、机构办理会发办理事件）、S4-06 立案两步走、S4-08 任免/入会须本人真实同意（NPC 自己决定；玩家可用 feePayer:'player' 代付入会费，调用参数 consent:true 不再能代填）。全量扫描发现下列测试在 a3a 上通过、在 s4a 上失败。首个报错见 F:/dnd/logs/sessions/s4a-firsterr.tsv。

S4 设计决定（不得改）：A 区间邻接即距离，无网格；B 任免只走章程任免链；C 历史前提用真实动作+等待，不跳时间；D 犯罪先成事件、立案才成案件；E 缺规范数据不猜。北极星 docs/产品原则.md：NPC 的决定不能由调用方代填；派生优先；自由度优先。

## 处理原则
- 逐个找根因。生产代码在旧玩法上判错（如 NPC 明明在场却不算在场、规范栈拒绝合法生成的地点）→ 修生产代码，修根因，不写特判。
- 测试前提依赖已被 S4 有意改变的旧捷径（代填同意、没走近就要求接触、直接写 state）→ 改为真实动作产生前提（真实移动、等待、代付后 NPC 自己同意、setup.prelude/applyIntentSetup），不放宽断言、不删断言、不加测试专用接口或内容。
- 断言针对的旧行为被 S4 有意改变（例如拒绝文字从"距离/视线"变成更具体的原因）→ 可改为等价或更严的新断言，逐处在汇报里说明。
- 冻结语料（tests/fixtures/a3-intents*.json、tests/playtests/*.json、scorer）不改。
- 若根因在另一张卡负责的区域（见下方各卡清单），你可以修，但汇报里写清改了哪个共享文件哪个函数，主会话合并时处理冲突。
- 若必须改 S4 设计决定才能过，停下汇报。

## 验收（每张卡）
本卡清单内每个文件逐个单独进程跑全过（沙箱拦 spawn 用 --test-isolation=none）；外加 s4-layout、s4-perception、s4-offices、s4-office-quests、s4-documents、s4-filing、organizations、arch-metrics、system-map、CORE（engine/storage/plugin）各一次全过。新增模块须在 tools/arch-layers.mjs 归层。不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态。
## 汇报（≤350 字）
每个文件的根因一句、改了哪些文件（生产/测试分开）、命令与 pass/fail、偏离与未解决。不贴代码与完整日志。
