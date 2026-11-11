卡 A3-E 第 5 轮（签名限定词判定可机器核对）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
问题：语料 expected.signature 的限定词是描述性写法（如 "emit(person:npc_hw_xuling,request:teach_spell_light)"、"transfer(resource:coin,self->npc_hw_linsui)"），tools/a3-score.mjs 要求限定词原文出现在已采用效果的原子值中，描述性组合词永远对不上。
新口径（保持严格）：①已采用效果的原语集合与 expected 原语集合完全相等（不变）；②从每个限定词中抽取可核对引用——world 中真实存在的 id（人物、物品、技能、配方、地点、资源）与 self/player 指代——它们必须出现在同一原语的已采用效果中（self 对应发起者）；③方向（a->b）若给出，须与效果的 from/to 一致；④其余纯描述词不参与判定，但保留在报告中。把规则写进工具注释与 F:/dnd/logs/sessions/a3-intents-v2.md 的“判分口径”节。tests/a3-score-self.test.mjs 加自检：引用 id 缺失判错、方向反了判错、描述词不同但引用一致判对。
然后重跑 → F:/dnd/logs/sessions/a3-score-v2f.json，并更新根因聚类 F:/dnd/logs/sessions/a3-gap-v2f.md（每类条数、代表 id、建议卡）。跑 a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol5.final.txt；回复 ≤150 字：各指标、前五类。
