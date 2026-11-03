卡 A3-B 第 5 轮（独立验收暴露的裁决与路由差距）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3B（分支 a3b，已同步含 A3-E 判分工具与 v2 语料的 a3a）。完整判分结果：F:/dnd/logs/sessions/a3-score-v2c.json（每条有 expected 与 actual、preview 诊断）。
任务（不改语料 tests/fixtures/a3-intents-v2.json 与判分工具 tools/a3-score.mjs，除非确证其与设计矛盾——那样写依据交主会话）：
1. “原语不能自报 tags”19 条：空数组 tags:[] 视同未提供；非空自报标签仍拒绝（06：标签由引擎派生）。
2. 状态 committed 但路由与 expected.route 不符的 19 条：逐条判定是路由错（修路由/注册动作匹配）还是预期依据不足（列出交主会话）。
3. outOfBoundsLeaks 9 条：应拒绝的越界意图须明确拒绝（不是澄清）；逐条修。
4. not_perceivable / unknown_entity 约 24 条：逐条判断是 setup 未让目标在场（列出交主会话）还是解析/感知判定错（修）。
5. tests/a3-score-self.test.mjs 有 2 项因你上轮把部分澄清改为拒绝而失败（“对不知道是谁的人说句话”等）：按 06 章区分——指代对象有多个候选或无法确定时为澄清，精确 id 不存在/不在场为拒绝；据此修实现或修正自检预期（改预期须写依据）。
完成后重跑 `node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json` 报各指标。跑 tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3B-sol5.final.txt；回复 ≤200 字。
