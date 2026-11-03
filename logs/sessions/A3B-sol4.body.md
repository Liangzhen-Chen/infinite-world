卡 A3-B 第 4 轮（实体解析缺陷，主会话已定位）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3B（分支 a3b）。先 git 不可写——主会话已把 a3a 最新成果同步进来（若未同步，按现状做，接口以 a3a 为准）。
主会话用独立语料实测 world_propose 预览：提案 {effects:[{op:'transfer',resource:'item_ration',from:'self',to:'sink:consume',qty:1},{op:'vital',target:'self',type:'body:satiety',delta:30}]} 返回 status:'needs_entities'，ambiguities 中 effects.0.from='self'、effects.1.target='self' 的 candidates 为空；提案 target:'npc_hw_xuling'（准确的人物 id）同样 needs_entities 且候选为空。
要求（依 docs/架构设计/06-动作层与开放动作.md 实体解析与路由）：
1. 'self'/'me'/'我'等自指一律解析为提案发起者（actor）。
2. 精确 id 不经模糊匹配，直接解析为该实体；该实体不在场、不可感知或不存在时，不返回 needs_entities，而返回带具体理由的拒绝（not_present / not_perceivable / unknown_entity），越界类意图也应明确拒绝而非澄清。
3. 只有真正有歧义（多个候选）时才返回 needs_entities 并给出候选。
补测试（tests/a3-*.test.mjs）。跑 tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3B-sol4.final.txt；回复 ≤120 字。
