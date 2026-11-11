【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s507-water：S5-07 水文与生命（第 1 会话，计划共 4 会话）

工作区 F:/dnd-wt/S507（分支 t-s507，基于 s5a，含 S5-01 派生、S5-02 市场、S5-05 资源账户）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"07 水文生命"及登记映射（E18→07；220→05+07；RW-04 并入）；docs/架构设计/05-统一模型.md §5.5；docs/A3-后续阶段登记.md 第 55、85 行。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填；数值改为经 S5-01 的派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/，已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 做法）。
- 改了交易/转移、engine、库存等共享接点：验收须跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；沙箱拦 spawn 时用同等依赖扫描并写明），与 master 对比报 pass/fail。
- 汇报写 UTF-8 文件，临时文件放 F:/dnd-tmp，不放工作区根目录。
- **测试期望值不得用被测函数计算**：机制断言按设计公式手算数字字面量锚点（注释写计算步骤）；场景测试每个场景至少一个数字锚点；手算与实现不一致以设计为准修实现。

## 本卡结果（S5-07）
- 水：顺流分水与污染沿河传递，不重复扣量；降雨只落在部分村庄时，真实改变受益的田地、香火与后续配额（E18 神迹争夺的降雨落区）。
- 霜灾不自动免租（是否减免由契约/法律规则决定）。
- 寿命：老化风险与 agingCatchUp（离屏补算）不瞬间判死，按规则逐步；不老物种例外。
- 器物、建筑年久成精：有时钟与成因记录（causes），不凭空出现。
- 吸收 RW-04 的相关项（见登记）。

## 机制断言（tests/s5-07.test.mjs，均含手算锚点）
上游取水后下游可用量；污染沿河衰减；半村降雨对两村产量/香火的不同影响；霜灾后租约按契约处理；长时间离屏补算的死亡概率按规则而非一次判死；不老物种不老化；器物成精时钟与成因；步长等价；存档往返一致。

## 可改
server-plugin/{water-cycle,weather,npc-life,wildlife-awakening,organizations}.mjs 及直接接点；world/ 水文与寿命规则数据（经审批管线）；tests/s5-07.test.mjs。锁：wildlife、farm-pests、husbandry（S5-06 在改）；market、stock 只读调用。

## 验收与汇报
s5-07 全过；affected 全部文件对比 master；60 天基准与 master 对比；overfit、arch-metrics、system-map、CORE 全过；静态 ≤10593。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s507-water.final.md）。
