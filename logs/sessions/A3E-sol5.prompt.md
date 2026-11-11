【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 A3-E 第 5 轮（签名限定词判定可机器核对）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
问题：语料 expected.signature 的限定词是描述性写法（如 "emit(person:npc_hw_xuling,request:teach_spell_light)"、"transfer(resource:coin,self->npc_hw_linsui)"），tools/a3-score.mjs 要求限定词原文出现在已采用效果的原子值中，描述性组合词永远对不上。
新口径（保持严格）：①已采用效果的原语集合与 expected 原语集合完全相等（不变）；②从每个限定词中抽取可核对引用——world 中真实存在的 id（人物、物品、技能、配方、地点、资源）与 self/player 指代——它们必须出现在同一原语的已采用效果中（self 对应发起者）；③方向（a->b）若给出，须与效果的 from/to 一致；④其余纯描述词不参与判定，但保留在报告中。把规则写进工具注释与 F:/dnd/logs/sessions/a3-intents-v2.md 的“判分口径”节。tests/a3-score-self.test.mjs 加自检：引用 id 缺失判错、方向反了判错、描述词不同但引用一致判对。
然后重跑 → F:/dnd/logs/sessions/a3-score-v2f.json，并更新根因聚类 F:/dnd/logs/sessions/a3-gap-v2f.md（每类条数、代表 id、建议卡）。跑 a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol5.final.txt；回复 ≤150 字：各指标、前五类。
