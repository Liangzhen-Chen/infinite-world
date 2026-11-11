你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/。主会话裁定与交你处理：
1. 037（质押赎回）、095（出售刀具）：expected 只列了部分效果，实际还有原物返还/质押关闭、实物交付等主效果——这些是意图本身的主效果，不是附带效果；按设计 01 §1.3/§1.6、06 §6.3 把 expected 补成完整效果集（见 F:/dnd/logs/sessions/A3C-r10.final.txt 第 9、11 行）。
2. 055：proposal.effects[0].payload.terms.quoteOnly=true，setup.facts 说明尚未签辩护委托、费用范围待定，而 expected 要求 obligation.create(service:defense)+付款——按原文统一：原文是“先询价”则 expected 改为询价请求；原文是“直接委托”则改输入与 setup。
3. 120：site_w5_well_camp 现为无主（owner null，原住户已搬走），而 setup 前提写“获准摆放”——按 lore 改正前提（无主处无需许可则删许可前提；或换成有主地点）。
4. 088 城门权属：等内容卡补环城治理主体后再改，本轮只在复审记录登记。
直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md（逐条写依据）；不改 id 与 intent 原文。回复 ≤80 字。
