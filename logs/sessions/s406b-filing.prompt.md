【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

# 续卡 s406b-filing：受理/拒绝必须由经办人本人决定（主会话审查打回）

主会话审查你的未提交改动，发现一处违反产品原则（docs/产品原则.md：NPC 的决定不能由调用方代填；与 S4-08「调用参数不能代填同意」同一条）：
- 现在玩家调用 `law:accept` / `law:reject` 并在 authority 填 NPC 经办人，NPC 就照调用方选的结果受理或拒绝，拒绝理由也由调用方写。等于玩家替官员做决定。

## 改法
1. 经办人是 NPC 时：玩家只能「请求受理」（可以合并成一个动作，例如 law:request_decision，或保留 law:accept 但语义改为请求），结果由经办人按职权与规则**自己**决定：
   - 规则判定部分（派生，不猜）：法典是否登记该罪名、是否在其辖区与职权、讼费能否付、报案是否有可核对的知情来源等——不满足时拒绝并给世界内原因与可行修复。
   - 规则允许时的个人裁量：经 npcDecision（或现有 NPC 决策入口，看其立场、与当事人关系、贿赂等真实来源）决定受理或推脱；推脱也给世界内原因。不得读引擎真相（嫌疑是否属实）来决定。
   - 调用参数里的 accept/reject、reason 一律不作为 NPC 的决定来源；带了就忽略或拒绝并说明。
2. 经办人是玩家本人（玩家持有该在岗职位）时：玩家可以自己选择受理或拒绝并写理由（这是玩家自己的决定）。
3. 若 NPC 不在岗/不在场：保留，需等其在岗。
4. 测试：补「玩家代填 NPC 受理/拒绝无效」「NPC 依规则拒绝（如罪名未登记/讼费不足）给原因」「NPC 受理来自其自身决定」「玩家任职时可自行决定」；已有测试若依赖玩家替 NPC 受理，改为请求 + NPC 自己决定，逐处说明。复演版本沿用 legalFilingVersion，复演不重新决定。
5. 拒绝原因、修复建议对玩家可见的文字不要出现内部参数名或英文（例如 'Legal request requires one present on-duty authorized recipient' 这类英文要改成中文世界内原因）。另：law.mjs 里 `(v.value>0?'coin_river':null)` 写死了货币 id，改用 ledger.mjs 的 LEDGER_COIN 常量。

## 验收
原卡验收全部（s4-filing、law、a3-owner2-R、a3-precondition-receipt 中本卡负责的项；63/71/97 若确为基线同败，列出并说明）；s4-perception、s4-offices、s4-documents、arch-metrics、system-map、CORE 各一次全过；静态 token ≤10593。
汇报（≤300 字）：改了哪些文件、决定来源的实现要点、改动的旧测试逐处一句、命令与 pass/fail、偏离与未解决。
