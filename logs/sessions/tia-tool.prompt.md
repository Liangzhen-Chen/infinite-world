【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 tia-tool：按覆盖率选测试（test impact analysis）工具

工作区 F:/dnd-wt/TIA（分支 t-tia，基于 master）。工具放 F:/dnd-wt/TIA/tools/test-impact/（项目内，主会话之后复制到 F:/dnd-tools 使用）。不改游戏代码与测试。

## 背景
现有 F:/dnd-tools/affected-tests.mjs 按 import 关系算受影响测试，但所有模块最终被 engine 引用、engine 被每个测试加载，所以改任何文件都算出 ~430 个"受影响"测试，门禁达不到 15 分钟。用户批准改为企业常用的"按覆盖率选测试"。

## 要做
1. `collect.mjs`：对给定测试文件列表，逐文件单独进程运行 `node --test --test-isolation=none <file>`，设置 `NODE_V8_COVERAGE=<临时目录>`，收集 V8 覆盖率 JSON；对每个测试文件，记录它**实际执行过（count>0）的函数**：{源文件相对路径, 函数起止字节偏移, 函数名}。忽略 node_modules、SillyTavern、node: 内置与 tests/ 自身。模块顶层（覆盖整个脚本的匿名顶层函数）单独标记为 top-level，不计入"执行过的函数"，但记录"该测试加载了此文件"。输出 map 文件（JSON，按源文件分组：每个函数区间 → 执行过它的测试列表），附生成时的 git 提交号与每个测试的耗时。支持 `--jobs N` 并行、`--files <list>` 只更新部分测试并合并进已有 map。
2. `select.mjs <worktree> <base>`：取工作区相对 base 的改动（已提交 + 未提交 + 未跟踪，与 affected-tests.mjs 同口径），对每个改动文件按 diff 的行号区间换算成字节偏移，找出覆盖这些区间的函数，输出执行过这些函数的测试。规则：改动落在函数体内 → 只选执行过该函数的测试；改动落在顶层代码（函数外）或新增文件/删除文件、world/ 数据、tests/ 文件本身、map 生成后源文件结构已大变（函数偏移对不上）→ 回退到"加载过该文件的测试"或 affected-tests.mjs 的结果（宁多勿漏），并在输出里注明回退原因。新增测试文件本身总是入选。
3. map 过期处理：map 记录生成提交号；select 时若源文件在 map 提交之后改过（不仅是本次改动），对该文件回退到"加载过该文件的测试"。
4. 单元测试（tests 放 tools/test-impact/test/，用小型夹具模块与夹具测试，不依赖游戏代码），覆盖：函数内改动只选执行者；顶层改动回退；新文件回退；未执行函数的改动不选任何测试；map 过期回退。

## 约束
沙箱里不能起子进程（EPERM）：collect 的真实运行由主会话在沙箱外做；你用夹具与模拟的 V8 覆盖率 JSON 测 collect 的解析与 map 合并逻辑。不调用付费模型。

## 汇报（≤250 字，UTF-8，F:/dnd/logs/sessions/tia-tool.final.md）
用法、map 格式、回退规则、单测 pass/fail、偏离。
