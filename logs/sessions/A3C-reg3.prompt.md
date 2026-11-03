【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-回归3（工作区 F:/dnd-wt/A3C，分支 a3c，已同步 a3a）。项目《无限原野》Node 规则引擎。A3 集成分支 a3a 合入 master 前的全量回归清理：下列测试在 master 全过、在 a3a 失败（失败详情 F:/dnd/logs/sessions/triage-a3a-v2x.md，可直接看对应段落；整表对比 sweep-a3a-v2x.tsv 与 sweep-master-bedb5078.tsv）。规则：逐文件找根因；A3 改动引入的真回归→修实现使原断言通过；只有设计文档（docs/架构设计/）明确规定新行为时，才把旧断言改为验证新真实行为（保留原意图与反例，逐处写设计依据）；不删测试、不跳过、不放宽；不手改 dist/ 与已发布档案，发布物只能经仓库现有的发布/审批管线重新生成；世界内容只写 world/。跑本卡负责的文件、tests/a3-*.test.mjs（保持仅阶段门槛与 a3-score-self r9 一项已知失败）、CORE。所有 node 加 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程。报告（逐文件：根因、判定、改动、依据、最终通过数）；回复 ≤150 字。 报告 F:/dnd/logs/sessions/A3C-reg3.final.txt。
负责：m6-07 与 s3-delivery-conditional（同为 TypeError: Cannot read properties of undefined (reading 'length')，先查是否同一根因）、m6-08、s3-sv、w2-s3（Missing expected rejection——注意 A3 把前置失败改成结构化拒绝回执，判断该处按 06 §6.10.4 应是回执还是仍应抛错）、w2-s4（有限区域没有可确认的低阶邪秽 @world_cast spell_s4_purify——查 A3 环境/物件改动是否影响了区域邪秽判定）。
