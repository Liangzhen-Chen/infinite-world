【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 续卡 a3perf-intent-b：主会话决定——测试跟随生产路径，撤回按需加载

你的根因定位正确：a3rg 让 load-world 提前装上原生运行时（primitives-runtime），练习从旧派发的"30 收益/0 分钟"变成原生的"2 收益/120 分钟"。但主会话核实：**生产服务器 server-plugin/index.mjs 本来就 import primitives-runtime，真实游戏一直走原生路径**。所以 a3rg 之后测试才第一次与生产一致；旧派发是玩家走不到的路，而且由调用参数 gain 决定收益，违反"真实运转"。另：用户 10-24 决定"规则只保留一版"，旧派发将由后续"规则归一"卡整体删除。

## 改法
1. 撤回你本卡对 action-affordances、action-constructor、primitives-runtime、load-world 的"按需加载、加载世界不装运行时"改动；保留 a3rg 的行为（加载世界即与生产同样装原生运行时）。若你的改动里有与此无关、确有必要的修复，单独保留并说明。
2. 修 r06-bs-craft 的两个失败与耗时，在原生路径下进行，只改测试前提，不改断言、不延长超时：
   - 不是本用例考查对象的能力前提（如「佛门」用例里的识字到 100），用现有的 applyIntentSetup（tools/a3-score.mjs，abilitiesByActor 等，S4-05 的 tests/helpers/document-actions.mjs 有用法）在开局设定，不用循环磨练。
   - 本身就是考查对象的练习/学习步骤，照真实原生规则做；为证明"练习有效"只需练到能断言进步与耗时的程度，不为凑满某阈值长时间磨练；若后续认证确实要求达到阈值，阈值前的部分可用开局设定，再真实练习跨过阈值。逐处说明哪一段是考查对象、哪一段是前提。
   - 导师时段问题按真实作息等待或改用前提设定，不改导师作息数据。
3. 盘点：列出 tests/ 下哪些文件不经生产组合根（未装原生运行时，跑旧派发），只列清单与数量，不改它们。

## 验收
r06-bs-craft 15/0，记录耗时；w2-s2、w2-s3、w2-s4、ledger-price 计时并报 pass/fail（若同因变慢，按第 2 条同样处理前提，逐处说明）；arch-metrics、system-map、draw-water、generation、m3-language、review-continue、a3-intent-proposal、action-registry、engine、storage、plugin 逐个单独进程全过。
## 汇报（≤350 字）
撤回了什么、测试前提逐处改动依据（考查对象 vs 前提）、各文件耗时与 pass/fail、旧派发测试清单（数量 + 写入 F:/dnd/logs/sessions/legacy-dispatch-tests.txt）、偏离与未解决。
