【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 a3perf-intent：a3rg 引入的约 15 倍变慢与 2 个失败（已定位到两个文件）

工作区 F:/dnd-wt/A3A（分支 a3a，HEAD e45006c8）。

## 已确认的事实（主会话实测，单文件单进程 tests/r06-bs-craft.test.mjs）
- master 96s 15/0；a3a@ccc2b466 102s 15/0；a3a@e45006c8（合入 a3rg 80661b2e 后）1575–1782s，13/2。
- 在 e45006c8 上只撤回 `server-plugin/environment-state.mjs` → 仍慢、仍 13/2；只撤回 `server-plugin/action-constructor.mjs` 与 `tools/load-world.mjs`（a3rg 把 action-constructor 对 action-affordances 的直接 import 改成 registerIntentMenu 注册式，在 load-world 顶部注册）→ 130s 15/0。
- 把 load-world 里那三行挪到其它 import 之后：仍慢。在 action-constructor 的"未安装菜单"处插桩：未触发（菜单已注册）。
- 失败用例「佛门正常入门…」报 `导师不在场`：循环 `world_practice {skill:'skill_literacy',gain:100}` 在坏版本里每次进步很少，测试反复 `s.morning()` 等到导师不在时段。另一个失败用例「四路线实际抵达…」耗时 786s。engine 的 world_practice 桥接会走 `world_act core:practice.session`。

## 要做
1. 找出注册式改动为何改变练习（或其它路径）的行为：例如 action-constructor 与 action-affordances 的循环依赖、某处在模块初始化时读取了尚未就绪的绑定、或 worldActions 调用参数/上下文不同。用对比（好/坏版本同一输入的 reduce 结果差异）定位，汇报确切根因。
2. 修根因，同时保持 a3rg 想要的分层（意图构造器不直接 import 展示层；tests/arch-metrics.test.mjs 必须仍通过）。若分层与正确性无法兼得，正确性优先，并说明代价。
3. 不改测试、不改断言、不延长超时。

## 验收
r06-bs-craft 全过且耗时 ≤ 1.3×102s；arch-metrics、system-map、draw-water、generation、m3-language、review-continue、a3-intent-proposal、action-registry、engine、storage、plugin 逐个单独进程全过；再跑 w2-s2、w2-s3、w2-s4、ledger-price 计时并与 master 对比（master 上分别约 88/66/127/1782 秒）。
## 汇报（≤300 字）
确切根因、改了哪些文件、各文件耗时与 pass/fail、偏离与未解决。
