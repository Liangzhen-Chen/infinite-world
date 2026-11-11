【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 s403-norms（S4 第一批「03｜到哪里适用哪部法」）。项目《无限原野》。工作区 F:/dnd-wt/S403（分支 t-s403，自 S4 集成分支 s4a，已含 01 分区移动、02 感知见证、04 席位任免；A3 尚未合 master）。先读 docs/产品原则.md、docs/当前状态.md 的“S4 规划”节（含主会话设计决定 A–E，尤其 C 历史前提用真实动作+等待形成、E 不从缺失字段猜规范数据），以及 S4 规划全文 F:/dnd/logs/sessions/s4-plan.final.txt 中「03｜到哪里适用哪部法」一节——可改/锁定文件、验收命令、机制断言、对应登记行与 todo 用例以该节为准。
并行说明：另一张 S4 卡（03 与 08 互为并行）同时在跑；若需改对方列出的文件，停下报告最小接点。另有一张 A3 回归卡在 a3a 上改 tools/arch-layers.mjs 与 system-map（若你新增模块需归层，在报告列出，由主会话合并时统一处理）。涉及正式世界内容的改动只经现有审批管线（真实模型 L2 上限 30 次、1 元，key 只从 DEEPSEEK_API_KEY）。不为测试造接口或世界内容；前提用真实动作。验收测试逐个文件单独运行；静态提示 ≤10593（当前 10587）。不改 docs/。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/s403-norms.final.txt。
