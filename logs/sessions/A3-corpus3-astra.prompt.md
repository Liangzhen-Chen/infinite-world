【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

你是独立出题者（续）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考）。独立性要求同前：不读 server-plugin/、extension/、tests/ 的代码与测试；只读 docs/架构设计/、docs/待用户确认.md、world/。
任务：给 F:/dnd/logs/sessions/a3-intents-v2.json 每条补字段 setup（让该意图的前提在世界中成立的最小场景）：{location:玩家所在地点 id（world/ 中真实存在）, present:[在场人物/生灵 id], inventory:{物品 id:数量}, coins:数字, minute?:一天中的分钟数, status?:{玩家特殊状态，如在押}, facts?:[其它前提，文字说明]}。意图本身就是要测“目标不在场/不存在”的，setup 不要让其成立。同时复核 proposal 中引用的 id 都来自 world/；上一轮标注的 56 条缺失引用，能换成真实 id 的换掉，确属测试“不存在目标”的保留并在 a3-intents-v2.md 说明。不改 expected（除非与设计矛盾，记录理由）。
直接改写该 JSON；回复 ≤100 字：补 setup 条数、替换的引用数、保留的不存在目标数。
