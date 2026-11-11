【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 unify-inventory：规则归一——盘点清单（只读，不改代码）

工作区 F:/dnd-wt/S4A（只读；产出只写 F:/dnd/logs/sessions/unify-inventory.final.md 与 unify-inventory.json）。

## 背景
用户 10-24 决定：规则只保留一版，不做旧存档向后兼容（"不需要管什么旧存档 这是你自己给自己的限制"）。开发期为旧存档复演加了大量版本标记（结果字段 xxxVersion，如 educationVersion、legalFilingVersion、organizationConsentVersion、nativePrimitiveVersion、obligationSigningVersion 等）以及"无标记时走旧行为"的分支。另：真实游戏服务器（server-plugin/index.mjs）装原生运行时，旧派发路径对玩家不可达。仍须保留：同一版规则下存档读取后重放结果一致（确定性），以及重放时读已记录结果（判决、同意、签约事实）这种为同版本确定性服务的机制。

## 要产出（只盘点，不改）
1. 全部版本标记清单：标记名、写入处（文件:行）、读取/分支处、旧分支删掉后保留哪条行为（现行规则）。
2. 旧派发/兼容路径清单：例如 primitiveActionRuntime() 为空时的旧分支、compat/ 下模块、legacy-* 模块、"replayResult?.xxxVersion===1" 判断等；标注哪些是死代码（生产不可达）、哪些仍被生产使用。
3. 测试清单：只为跨版本兼容存在的测试/断言（文件:用例名:断言要点）——这些将删除，主会话先给用户过目；以及需要改写（去掉版本前提）但保留其规则意图的测试。
4. 删除顺序与拆卡建议（文件互斥、可并行组），每卡预估改动量；风险（确定性、存档往返、静态提示、性能）。
5. 粗估可删代码行数与喂给模型的回执字段减少量。

汇报：unify-inventory.final.md（≤2500 字）+ unify-inventory.json（结构化清单）；last 消息一句摘要。
