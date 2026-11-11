【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 p1-verdict：可信结果与基线分诊（流程 v2 实施卡 P1）

工作区 F:/dnd-wt/GATEQ（分支 t-gateq）。设计：tools/gate/DESIGN.md，必读 §6.1、§12 的 P1 段、§14 修订。只读与本卡相关的部分。

## 所有权
只改：tools/gate/verdict.mjs（新）、tools/gate/policy/known-failures.json（新）、tools/gate/test/verdict.test.mjs（新）、tools/gate/card-gate.mjs 中"把调度器结果聚合成门禁判定"的部分。不改 runner.mjs、reporter.mjs、scheduler.mjs、submit.ps1、wait-cards.sh、test-impact/（其他卡或已上线）。不改游戏代码。

## 现状
card-gate.mjs 现在把文件交给调度器（submit.ps1），等 jobs/<runId>/result.json；每个文件的结果（runner.mjs 产出）含 status（PASS/FAIL/TIMEOUT/CRASH/INCOMPLETE）、failures[]（含完整用例路径 id、fingerprint、location）。但聚合判定仍是旧逻辑：按用例名字符串比对基线，基线"也失败"就归为同败。

## 要做
1. verdict.mjs：纯函数 `judge({candidate, baselineRuns, knownFailures, expected23})`：
   - 候选文件 PASS 才算过；TIMEOUT/CRASH/INCOMPLETE 一律 INCOMPLETE（门禁不通过，单列"基础设施"类）。
   - 候选 FAIL 的每个失败按 用例路径+指纹 识别。只对失败文件在 baseSHA 上复跑两次（card-gate 负责提交 baseline job，两次独立 job）。两次都出现同一用例路径+同一指纹，才是 BASELINE_REPRODUCED；同名不同指纹、只出现一次、基线缺文件/超时/崩溃，都是 REGRESSION 或 UNRESOLVED。
   - BASELINE_REPRODUCED 也不自动放行：只有与 policy/known-failures.json 中登记项（用例路径+指纹+owner+到期日）精确匹配，且未过期，才算 KNOWN；否则 BLOCKED_PREEXISTING（需要主会话决定）。
   - 历史 23 项预期失败（`npm run test:baseline` 的 E1–E19、M3a–M3d）语义不变，不进 known-failures；本卡不改它。
   - 输出：每文件、每用例的判定与原因；总判定 PASS / FAIL / INCOMPLETE / BLOCKED。
2. card-gate.mjs 改用 judge()：
   - 机器可读结果写 <名>.gate.json。
   - 人读的 <名>.gate.md 保留，每项写明用例路径与原因。
   - 进程退出码：PASS=0，其余非 0。
   - 不再按"新回归 0"字符串判断。
3. known-failures.json 初始为空数组，并附字段说明。
4. 测试 verdict.test.mjs（纯逻辑，用构造的 result 对象），必须覆盖：
   - 同文件基线 A 用例失败、候选 B 用例失败 → 红；
   - 同名不同指纹 → 红；
   - 基线只失败一次 → 不放行；
   - 基线两次同败、未登记 → BLOCKED；登记且未过期 → KNOWN；登记已过期 → BLOCKED；
   - 候选 exit≠0 但无失败用例 / 超时 / 崩溃 / 不完整 → INCOMPLETE；
   - 基线缺文件 → 不能证明同败；
   - 退出码与 gate.json 总判定一致。

## 约束
- 沙箱不能起子进程：只跑纯逻辑测试 `node --test --test-isolation=none tools/gate/test/verdict.test.mjs`；card-gate 的真实端到端由主会话在沙箱外做，列在汇报里。
- 不放宽断言、不写死特判。

## 汇报（≤250 字，F:/dnd/logs/sessions/p1-verdict.final.md）
judge() 接口与规则摘要、card-gate 改了什么、测试结果、偏离、需要主会话宿主验证的项。
