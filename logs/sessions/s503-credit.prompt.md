【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 卡 s503-credit：S5-03 信贷与票据（第 1 会话，计划共 4 会话）

工作区 F:/dnd-wt/S503（分支 t-s503，基于 s5a，已含 S5-01 派生修正槽与 S5-02 市场）。先读 docs/产品原则.md；F:/dnd/logs/sessions/s5-plan.final.md 的"退出"与"03 信贷与票据"及其登记映射（218→03；13 个 todo 中"存单支取、假单/错人/超支、部分支取不复制债、债权来源"→03）；docs/架构设计/15-经济与货币.md §15.3、§15.5；docs/A3-后续阶段登记.md 第 96、112 行。只汇报与本卡相关的结论。

## 用户已定的约束（必须遵守）
- 规则只保留一版、不做旧存档兼容：不加复演版本标记、不留旧行为分支。
- 派生优先：可派生的数值不手填；数值改为经 S5-01 的派生修正槽（server-plugin/derived.mjs、world/ontology/slots）计算。
- 测试前提用真实游戏动作或 applyIntentSetup 声明非考查对象；测试走生产原生运行时；不为测试造接口或内容；不放宽断言、不删测试，改测试逐处注明设计依据。
- 不调用付费模型；世界内容只写 world/，已发布内容改动走审批管线（照 world/design/s4-law-content-approval.mjs 做法）。
- 改了交易/转移、engine、库存等共享接点：验收须跑 `node F:/dnd-tools/affected-tests.mjs master` 列出的全部文件（每文件单独进程，--test-isolation=none；沙箱拦 spawn 时用同等依赖扫描并写明），与 master 对比报 pass/fail。
- 汇报写 UTF-8 文件，临时文件放 F:/dnd-tmp，不放工作区根目录。
- **测试期望值不得用被测函数计算**：机制断言按设计公式手算数字字面量锚点（注释写计算步骤）；场景测试每个场景至少一个数字锚点；手算与实现不一致以设计为准修实现。

## 本卡结果（S5-03）
- 铸币与信用币两条分支：汇率与接受范围正确（谁收哪种钱、按什么汇率）。
- 超发导致贬值（购买力下降可解释）；贷款不凭空造钱（借贷是现有钱的转移与债权，不新增流通量，除非设计允许的信用发行路径并有准备金约束）。
- 准备金约束可贷额度、利率与银根松紧；撤回申请不能抬价（不能靠反复申请/撤回操纵利率）。
- 具名存单只代表同一笔债权：伪造、持有人不符、超额支取一律拒绝；部分支取不复制债权；准备金耗尽才停兑。
- 恢复对应 todo（前提由真实动作或 applyIntentSetup 声明非考查对象产生）。

## 机制断言（tests/s5-03.test.mjs，至少，均含手算锚点）
两种货币按汇率兑换与拒收；超发后购买力按公式下降；贷款前后流通总量守恒；准备金不足时可贷额与利率变化；申请-撤回-再申请不改变利率；存单伪造/错人/超支被拒、部分支取后剩余债权正确；准备金耗尽停兑、补足后恢复；失败操作零写入；存档往返一致。

## 可改
server-plugin/{credit,finance-bank,money,documents}.mjs 及直接接点；world/ 货币与银行规则数据（经审批管线）；tests/s5-03.test.mjs 及 todo 所在测试文件。新模块归层、system-map 登记。锁：market.mjs（S5-02 已合入，只读调用）、agriculture/stock 等资源模块（S5-05 未合入）。

## 验收与汇报
s5-03 全过；affected 全部文件对比 master；overfit（沙箱拦则写明）、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s503-credit.final.md）。
