【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

# 续卡 intent-bench-c：修评测脚本的三个缺陷（主会话已实跑 A 60 回合，花 0.078 元，全部命中率为 0，属脚本缺陷）

结果文件 F:/dnd/logs/sessions/intent-bench-A.json（rows 逐回合）。主会话核对发现：
1. **开放/创意回合**：Jev 选了"都不是"时 steps 为空，被 `expected_1_to_3_steps` 判为无效，openHit=false（如 index 3、8 的创意回合）。选"都不是"本身就是开放路径命中，应进入开放提案并计 openHit。
2. **槽位题与动作无关**：所有槽位题一次全问，Jev 只能硬选，导致买刀被填 mode:walk、days:1 等无关槽，且出现 unknown_slot、missing:seller。改为两段：第 1 请求只问动作族（含都不是）与步数/多步结构；第 2 请求只问**所选动作的必填/相关槽位**（选项仍来自精简事实，含"不涉及/其他按名"）；或在同一请求中为每个候选动作族分别设槽位题、按所选族取用——二选一，写明。成本仍需在预算内（报 --dry 数字）。
3. **动作标签映射**：出现 unknown_action（如 'core:trade.partner' 被选、以及若干 unknown_action），检查 choice 标签与动作 id 的对应、标签描述是否让 Jev 能分辨（如"向在场卖方买入/卖出/问价"要有清楚的白话描述），以及多步时第 2 步的映射。
另：B 模式（DeepSeek strict）与 C 混合的映射/判定与上面同口径修正；C 的混合判定改为离线由 A、B 已有结果组合计算（同一回合集合），不额外请求。

用桩响应补测试：选"都不是"计 openHit；只问所选动作相关槽位；未知标签被拒并计错误原因。修后跑 --dry --sample 60 报 A/B 请求数与预计费用。**不得真实调用付费接口。**
汇报（≤250 字）：三处修法、--dry 数字、测试 pass/fail。
