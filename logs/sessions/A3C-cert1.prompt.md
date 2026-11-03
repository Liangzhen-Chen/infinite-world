【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

卡 A3-认证回执（工作区 F:/dnd-wt/A3C，分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。A3 自有题只剩 A3V2-020（木工认证）签名不符。逐条结果 F:/dnd/logs/sessions/a3-score-v3a.json。
期望：emit(org:local_guild,request:certification)、holding.open(person:self,certified:woodworking)。实际：transfer 20 铜 player->npc_hw_yinge（role=outcome）、holding.open(certified)。
主会话裁定（依据 06 §6.3、§6.6 与 05 §5.7）：①考核费是服务费用，回执应与工坊费等一致标为 additional_cost（真实转账不变、守恒不变）；②认证是机构行为，申请应在考核机构留下可见的原生请求/登记事件（与法律类提交请求同一 emit 形式，主体为考核所属组织，见证按原生规则），供后续知识与声望系统读取；失败分支同样留下申请记录但不授证。在 core:profession.certify 的实现处修，不改语料与判分口径；补测试（成功/失败两分支、费用标签、事件可见性、存档往返）。跑 tests/a3-*.test.mjs、认证/职业相关测试、CORE；重跑 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/A3C-cert1-score.json 报 020 结果与六项指标。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node。报告 F:/dnd/logs/sessions/A3C-cert1.final.txt；回复 ≤120 字。
