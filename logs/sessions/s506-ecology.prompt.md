【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s506-ecology：S5-06 生态种群（第 1 会话，计划共 4 会话）

工作区 F:/dnd-wt/S506（分支 t-s506，基于 s5a，含 S5-01 派生、S5-02 市场、S5-05 资源账户）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"06 生态种群"；docs/架构设计/05-统一模型.md §5.5；10 章第五轮中归 S5 生态的条目。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填；数值改为经 S5-01 的派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/，已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 做法）。
- 改了交易/转移、engine、库存等共享接点：验收须跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；沙箱拦 spawn 时用同等依赖扫描并写明），与 master 对比报 pass/fail。
- 汇报写 UTF-8 文件，临时文件放 F:/dnd-tmp，不放工作区根目录。
- **测试期望值不得用被测函数计算**：机制断言按设计公式手算数字字面量锚点（注释写计算步骤）；场景测试每个场景至少一个数字锚点；手算与实现不一致以设计为准修实现。

## 本卡结果（S5-06）
- 种群的易感/感染/康复（S/I/R）转移、死亡；捕食、竞争、互利关系与生态位系数真实改变种群数量（走 S5-01 派生槽，不手填）。
- 家畜出生、活体产物（奶、蛋、毛等）都有来源，守恒。
- 个体化与放归：从种群里取出一个个体，种群减一；放归，种群加一，不凭空增减。
- 领地关闭后按速率回迁，不瞬间回满。
- 推进步长等价：同样天数分多次推进与一次推进结果一致。

## 机制断言（tests/s5-06.test.mjs，均含手算锚点）
S/I/R 一次推进的转移量；捕食者-猎物一步的数量变化；互利与竞争系数生效；家畜出生与产物守恒；个体化/放归一增一减；领地关闭后回迁速率；步长等价；失败操作零写入；存档往返一致。

## 可改
server-plugin/{wildlife,farm-pests,husbandry}.mjs 及直接接点；world/ecology/species 等生态数据（经审批管线）；tests/s5-06.test.mjs。锁：water-cycle、weather、npc-life、wildlife-awakening（S5-07 在改）；market、stock 只读调用。

## 验收与汇报
s5-06 全过；affected 全部文件对比 master；四个慢文件（agriculture、farm-pests-*、wildlife、seasonal-migration）用 F:/dnd-tools/bench-farm-pests.mjs 60 天基准与 master 对比；overfit、arch-metrics、system-map、CORE 全过；静态 ≤10593。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s506-ecology.final.md）。
