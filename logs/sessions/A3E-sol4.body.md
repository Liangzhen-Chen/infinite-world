卡 A3-E 第 4 轮（判分口径细化与差距归因）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
1. 签名口径：tools/a3-score.mjs 的 signatureMatches 要求“已提交效果的原语集合”与 expected 完全相等；引擎派生的成本/时间/体力等效果（非提案所请求）不应计入签名。按 docs/架构设计/06-动作层与开放动作.md 的“签名”定义，改为比较“提案所请求、经路由采用的效果”的原语集合与限定词；派生成本效果若有标记（如 cost/derived/actedAs 字段，读回执结构确认）则排除；没有标记就在报告中指出需要引擎补标记，不要靠猜。在 tests/a3-score-self.test.mjs 加对应自检（含：有派生成本仍判签名正确；请求了错误原语判错）。
2. 用 tests/fixtures/a3-intents-v2.json 重跑，输出 F:/dnd/logs/sessions/a3-score-v2d.json，并写 F:/dnd/logs/sessions/a3-gap-v2d.md：按根因聚类（例如：未注册对应动作、路由映射错、实体解析、感知/在场、能力/前置、裁决幅度、兜底未产生实体、构造器缺路径、setup 未满足、语料预期存疑），每类条数、代表条目 id、建议归哪张卡（A/B/C/D）。
跑：a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol4.final.txt；回复 ≤200 字：各指标、聚类前五类及条数。
