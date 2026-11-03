卡 a3qy-inspect（A3 收口第 3 步 d：先查后提的实体能力卡）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3QY（分支 t-a3qy，自 a3a，已含统一拒绝投影与难度派生）。先读 docs/产品原则.md 与 docs/架构设计/06-动作层与开放动作.md §6.10.2。

目标（一句话）：玩家（或 LLM）通过现有的 world_actions 查询一个可感知的实体，就能拿到它当前的状态摘要、可对它施加的原语与来源上限、相关注册动作及受阻原因，然后据此提案；查到的上限与同条件下提案时的裁剪完全一致。

现状（规划核实）：server-plugin/action-affordances.mjs:238–265 只给对象名称/库存/目录槽位，缺实体状态摘要与原语上限，kindOf 不识别环境 feature；模型入口是 extension/tools.mjs:43 的 world_actions，不另增静态工具。难度卡已导出只读 deriveOpenSourceLimits（action-limits.mjs），拒绝卡已统一拒绝投影（action-rejection.mjs 的 refusalProjection 等）。
要做：
1. world_actions 查询实体时返回：状态摘要（只含玩家当前可知的状态——门开关/锁、物品耐久/材质、NPC 在场/清醒/对玩家的立场档等；隐藏信息不泄露，双世界投影一致）；可施加的原语与上限（调用 deriveOpenSourceLimits，注明来源与前提，缺手段则返回缺项而非枚举任意能力）；相关注册动作；受阻原因用统一拒绝投影形状。纳入环境 feature 与运行时实体。
2. 玩家指定工具：server-plugin/items.mjs 的 useTool 现在按物品 ID 顺序选第一件匹配用途且完好的工具；改为若提案/槽位指定了工具（如 means.tools 或 tool 槽），优先用指定的那件（须实际持有、用途匹配、完好，否则拒绝并说明），未指定时保留现规则；查询结果里写明“将使用哪件工具”。
3. 查询只读：不写状态、不缓存权威状态；权限变更或移走工具后，旧查询结果不能授权提交（提交时重新核验）。
可改：server-plugin/action-affordances.mjs、server-plugin/items.mjs（仅 useTool 及其调用参数）、必要时 extension/tools.mjs 中 world_actions 的描述文字（静态提示不得超过 10593）；新增 tests/a3-affordance-state.test.mjs；受影响的既有测试。锁定：action-limits.mjs、action-rejection.mjs、action-boundary.mjs、primitives*.mjs、open-actions.mjs、action-router.mjs、npc-relations、world-events、mark-reactions、activities、magic、contracts、npc-growth（另一张卡在改）及其余文件。若必须改锁定文件，先停下报告最小接点。
验收：node --test --test-isolation=none tests/a3-affordance-state.test.mjs tests/a3-builder.test.mjs tests/a3-tool-surface.test.mjs tests/domain-rules.test.mjs tests/a3-domain-properties.test.mjs；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），失败只允许三个既有项。
新测试须覆盖：门/物品/NPC 状态变化后查询即更新；查询上限与同条件提案的裁剪一致；移走工具或撤销权限后旧查询不能授权提交；隐藏实体与隐藏状态不泄露；指定工具优先、指定无效工具被拒并说明；完整“查→提→回执”走现有入口；查询零写入。
不调用真实模型。预计规模：中（约 300–600 行含测试）。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。题集与判分器冻结。不为测试新增生产接口或世界内容；前提用真实动作。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3qy-inspect.final.txt。
