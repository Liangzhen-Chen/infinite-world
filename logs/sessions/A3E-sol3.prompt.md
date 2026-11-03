【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 A3-E 第 3 轮（判分工具支持逐条前置场景）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e）。你是验收工具作者：不得修改引擎实现。
语料 F:/dnd/logs/sessions/a3-intents-v2.json 将为每条加 setup 字段：{location, present:[id], inventory:{id:n}, coins, minute?, status?, facts?}。任务：tools/a3-score.mjs 对每条意图从同一初始存档复制一份，按 setup 建立真实前置状态（用引擎已有的正式手段或测试夹具已有的状态构造方式：玩家移到 location、把 present 中的人物/生灵置于同地且清醒在场、发放 inventory 与 coins 并经账本开账/对账一致、设置时刻与特殊状态），再走两阶段协议判分；无法建立的 setup 项记入 setupUnmet 并在汇总中单列（不计入通过）。另：在每条结果中保存 preview 回执的 status 与 reason/ambiguities，便于定位。
补 tests/a3-score-self.test.mjs：至少 2 条用 setup 的条目判定正确。跑 a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol3.final.txt；回复 ≤120 字。
