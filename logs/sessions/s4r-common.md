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
