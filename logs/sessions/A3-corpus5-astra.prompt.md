【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：45 分钟（到 35 分钟时停手写交接）。

你是 A3 意图语料的原出题者（续）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（只读参考），仍不读 server-plugin/、extension/ 代码。参考差距报告 F:/dnd/logs/sessions/a3-gap-v2f.md 的“前置未成立”37 条（013、014、016…103，见“全部归类 ID 及证据”）与 setup 7 条。
任务：对意图原话明示或隐含“玩家已具备”的能力（已学会的法术/配方/技能熟练度、识字程度、持有许可/身份等），在 setup 中补结构化字段 abilities：{skills:{id:熟练度}, spells:[id], recipes:[id], literacy:数值或等级, licenses:[id]}（id 与等级取值依 world/ 与附录A 定义）；意图本来就是测“未学会/无资格/识字不足”的，不要补，并在 a3-intents-v2.md 的复审记录说明。另：setup 7 条（009 缺宠物实例、106 缺 npc_w5_saltboat_leader、057/070 把 onDuty/fear 当 actor、089–091 的 confined/conscious）按 world/ 真实对象与附录A 状态定义改正。不改 expected（除非与设计矛盾，记录理由）。直接改 F:/dnd/logs/sessions/a3-intents-v2.json；回复 ≤100 字。
