【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s505c-resources：S5-05 第 3 会话（计划最后一会话）

接着你的第 2 会话（未提交；鱼类账户、药草累计取整、古树子账已做）。按你交接的顺序：
1. 先修源汇语义（你交接里说的问题）。
2. 鱼的迁移/个体化真实转移（捕到的鱼成为真实物品个体并从资源账户扣减，放归一增一减）；古树开户；麦种、竹竿、蚯蚓等与正式世界数据绑定（改 world/ 走审批管线，L2 需 DeepSeek 审阅，属已授权额度，本卡上限 0.3 元；沙箱拿不到 key 就停在这一步写明）。
3. 其他再生的闭式公式（与步长无关），并补步长等价测试（手算锚点）。
4. 验收：四个慢文件（agriculture、farm-pests-clock、farm-pests-hunt、farm-pests-harvest）两边都 15 分钟超时，不能证明没变慢——改用 F:/dnd-tools/bench-farm-pests.mjs（60 天基准，在工作区根目录 `node F:/dnd-tools/bench-farm-pests.mjs 30 2`）与 master（F:/dnd-wt/BIS2 检出 master 运行）对比，报两边秒数；剩余 affected 文件对照 master。
约束同前。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s505c-resources.final.md），含 DeepSeek 实际花费。
