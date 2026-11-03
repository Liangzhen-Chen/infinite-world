续做 a3qy-inspect（同一工作区 F:/dnd-wt/A3QY）。你停下报告得对。主会话核对了所有权，以下接点现无其他卡在改，全部授权：
- server-plugin/environment.mjs:115、agriculture.mjs:448：向 useTool 传入玩家指定的工具（来自槽位或 means.tools）。
- extension/tools.mjs:145 modelActionCatalog：投影时保留实体卡（状态摘要、可施加原语与上限、相关动作、受阻原因），静态提示仍不得超过 10593（a3-tool-surface 检查）。
- world/actions/core.json（及 tools/build-action-registry.mjs 的现有生成/校验流程）：给环境机关与私田播种/收获等需要工具的注册动作声明可选 tool 槽；这是动作目录配置，不是世界事实。
- server-plugin/action-router.mjs：仅把提案 means.tools / tool 槽传给上述动作的槽位抽取，不改评分与消歧规则。
其余按原卡实现与验收（原卡全文在 F:/dnd/logs/sessions/a3qy-inspect.body.md）。仍锁定：action-limits、action-rejection、action-boundary、primitives*、open-actions、npc-relations、world-events、mark-reactions、activities、magic、law、contracts、npc-growth、npc-autonomy、subjective-view、state-notices。
注意：工作区已加 SillyTavern 链接（试玩/分词器测试依赖）。
最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3qy-inspect2.final.txt。不再启动其他会话或子代理。
