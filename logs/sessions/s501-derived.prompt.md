【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s501-derived：S5-01 派生修正槽（S5 地基，第 1 会话）

工作区 F:/dnd-wt/S501（分支 t-s501，基于 s5a = master 8083ff7c，A3+S4 已合入主线）。先读 docs/产品原则.md；拆卡计划 F:/dnd/logs/sessions/s5-plan.final.md 中"退出"与"01 派生"；设计 docs/架构设计/05-统一模型.md §5.6、§5.9（派生值即修正项）、附录A §A.16/§A.17、10-现状映射与迁移路线.md 第三～五轮中归 S5 的派生/修正槽条目。只汇报与本卡相关的结论（≤300 字）。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先、自由度优先；不手填可派生的数值。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容。
- 不调用付费模型。

## 本卡结果（S5-01 共 3 会话，本卡为第 1 会话；先交付可用的派生核心，后续会话接消费者）
1. 新增 server-plugin/derived.mjs：统一修正槽求值。槽位缺省开放（未声明的槽可挂修正）；声明 closed 的槽拒绝挂载并给世界内原因；修正合成顺序固定为 add→mul→max→min→clamp，结果与修正项加载顺序无关；bounds 校验（越界在加载时拒绝，不在运行时静默截断）。
2. 修正项来源：world/ontology/slots（新增或扩展槽位注册数据）与现有规则加载器；修正项带出处（来源规则/事实 id），可解释（能列出某个派生值由哪些修正项组成）。
3. 工资、器物估值作为该机制下的别名槽接入（只建槽与别名，不改现有消费者的数值结果——消费者迁移在后续会话与 S5-02/04）。
4. 基线选择器与持有声明传导：按设计落地选择器（某值的基线从哪类事实取）与持有声明对修正的传导，保留知情门控（主观视图只看得到其知情的修正来源）。

## 机制断言（全部要有测试，tests/s5-01.test.mjs）
- 同一组修正项，以不同加载顺序求值，结果完全相同。
- add→mul→max→min→clamp 的合成次序可验证（构造会因次序不同而结果不同的修正组）。
- closed 槽拒绝挂载并返回原因；开放槽可挂载。
- 越界 bounds 在加载时被拒。
- 派生值可解释：列出贡献项与出处。
- 主观视图不泄露其不知情的修正来源。
- 工资/器物估值别名与原值一致（现有消费者结果不变）。

## 可改
新增 server-plugin/derived.mjs；现有规则加载器（找到 world/meta/rules.json 等的加载处）；world/ontology/slots（及必要的派生注册数据）；tests/s5-01.test.mjs。新模块在 tools/arch-layers.mjs 归层、tools/system-map.mjs 登记。不改 docs/、dist/、PLAN/PROGRESS/CHANGELOG/当前状态；不改冻结语料与 scorer。

## 验收
tests/s5-01.test.mjs 全过；改了规则加载器，影响面大：在本工作区跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；近乎全量时按批），报 pass/fail，与 master 同文件对比（master 上就失败的单列）；overfit-guard（沙箱拦 git 时写明）、arch-metrics、system-map、performance、CORE（engine/storage/plugin）全过；静态提示 ≤10593。
## 汇报（≤350 字）
实现要点、新增/改动文件、机制断言覆盖、命令与 pass/fail、后续会话要接的消费者清单、偏离与未解决。
