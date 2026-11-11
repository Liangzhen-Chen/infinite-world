你是独立出题者（续）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考）。独立性要求同前：不读 server-plugin/、extension/、tests/ 的代码与测试；只读 docs/架构设计/、docs/待用户确认.md、world/。
任务：给 F:/dnd/logs/sessions/a3-intents-v2.json 每条补字段 setup（让该意图的前提在世界中成立的最小场景）：{location:玩家所在地点 id（world/ 中真实存在）, present:[在场人物/生灵 id], inventory:{物品 id:数量}, coins:数字, minute?:一天中的分钟数, status?:{玩家特殊状态，如在押}, facts?:[其它前提，文字说明]}。意图本身就是要测“目标不在场/不存在”的，setup 不要让其成立。同时复核 proposal 中引用的 id 都来自 world/；上一轮标注的 56 条缺失引用，能换成真实 id 的换掉，确属测试“不存在目标”的保留并在 a3-intents-v2.md 说明。不改 expected（除非与设计矛盾，记录理由）。
直接改写该 JSON；回复 ≤100 字：补 setup 条数、替换的引用数、保留的不存在目标数。
