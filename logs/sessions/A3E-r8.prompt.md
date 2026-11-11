【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-E 第 8 轮（判分语义三项 + 加载器）。工作区 F:/dnd-wt/A3E（分支 a3e，已同步 a3a）。项目《无限原野》Node 规则引擎。逐条结果 F:/dnd/logs/sessions/a3-score-v2j.json；C 卡对签名的归因见 F:/dnd/logs/sessions/A3C-r7.final.txt。本卡只改 tools/a3-score.mjs 及其自检（tests/a3-score-self.test.mjs），不改引擎、不改语料。主会话已定的口径（实现并写进判分说明 a3-intents-v2.md 的“判分口径”由语料作者维护——你把口径文字写在报告里，由主会话转交）：
1. 账户端点按账本语义对应（01 §1.6、§1.12）：expected 中的 sink:<用途> 对应用途段为该用途的 sink 账户；recipe_<id>-> 或 <配方>的产出来源 对应 src:craft 且来源元数据记该配方；只用一张对照表实现，不做模糊字符串包含。
2. 额外效果：实际效果 ⊇ expected 必需效果；多出的效果只允许属于设计强制的伴随类（工具磨损、做活练习/熟练度 learn 且 source 为 doing/practice、工时/疲劳、回执标为 additional_cost 的费用；依据 06 §6.7、08 §8.4），其他任何多余效果仍判不符。
3. 带检定动作：分别验证成功分支与失败分支——经引擎已有的确定性随机/检定注入接口（找现有的，不给引擎加判分专用分支；若确实没有可注入点，报告不要自造）把检定固定为成功、失败各跑一次；expected.signature 对成功分支比对（expected.checkOutcome:"failure" 时对失败分支）；另一分支只要求按设计的失败/成功规则提交且无越界产出。最高掷骰仍失败视为不可能，如实记录。
4. 修 tests/a3-score-self.test.mjs「explicit trace alternative」若在 a3a 仍失败且属判分器兜底构造问题（A3D-r7 也在查兜底转换；先看 F:/dnd/logs/sessions/A3D-r7.final.txt 是否已出，避免重复）。
每项配自检（正反例）。重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3E-r8-score.json 报六项指标；跑 tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3E-r8.final.txt；回复 ≤150 字。
