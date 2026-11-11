【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

# 卡 s503f-credit：S5-03 交叉审查发现的缺陷修复

工作区 F:/dnd-wt/S503F（分支 t-s503f，基于 s5a 最新，已含 S5-03 信贷）。先读：
- docs/产品原则.md；
- docs/架构设计/15 章 §15.3、§15.5（只读相关小节）。

S5-03 已合入。另一家 AI 做了独立复审，主会话核对后确认以下问题。

## 必修（按严重程度）
1. **【高】信用券发行与兑付不对称，可套利。** 按设计决定正确的口径后修实现。
   - 现状：
     - server-plugin/currency.mjs 中 issue（mode:'issue'）按派生的市场流通价收款，兑付（mode:'redeem'）固定按面值 100×(1−手续费)。
     - tests/s5-03.test.mjs:65–90 表明：稀释后第二次发行 10 券只付 11 铜；107–125 行每券兑付 97 铜。
     - 玩家可以先压低价格，再在额度内多发券，随后去兑付，每券净赚约 96 铜，直到柜台现金耗尽。
   - 方向（主会话意见，以设计原文为准）：
     - 承诺按面值兑付的发行方，不会以低于面值（加手续费）的价格卖出新券；
     - 派生的流通价、购买力、贬值只用于第三方交易与估值；
     - 兑付在准备金/现金充足时按面值，不足时按设计走部分兑付或停兑。
   - 写一个机制测试，证明"发行→兑付"往返不能净赚，并给手算锚点。现有测试中依赖旧口径的期望值，按设计逐处改，注明依据，并保留原有的守恒和零写入断言。
2. **【中】准备金负债口径不一致。**
   - finance-bank.mjs:106–119 的 bankCredit 只把存款算作负债，未兑付的 bank_bill 和 clearing 没算进去；advanceBankFinance 的负债口径却包含它们。
   - 两处口径统一，可贷额要为未兑付汇票留出现金。
   - 加测试：有未兑付汇票时可贷额相应减少，给手算锚点。
3. **【中】典当利率按错了借款人。**
   - credit.mjs 的 loanTerms/openLoan 调用 interestRate 时没传 borrower，默认成 'player'。
   - 典当的债务人是 owner（NPC），违约史和信誉却按玩家计算。
   - 改为传入真实债务人，并加测试：NPC 与玩家违约史不同，对应利率也不同。

## 评估后决定是否修（写进汇报）
- credit.mjs 去掉了银行贷款利率的 `[low,high]` 世界范围校验，现在只靠 rateTerms.minRate/maxRate 夹取。作者填的 terms 能否越出世界利率范围？设计若要求不能越界，就恢复校验。
- withdraw 未传 debt 时，只要遇到"需具名原件"的债权就整笔失败，即便其他债权足够支付。
- 具名原件损毁或丢失后，该债权永久锁死，没有补发路径。查设计是否规定了挂失补发；没有规定就登记为后续项，不要自造。
- currency.mjs:76 currencyReserve 把全部银行现金都当作准备金，没扣除储户存款。
- 'coin_river' 作为基准币被写死，没有使用 tender.unit。

## 约束
- 规则只保留一版；派生优先；测试前提用真实动作或 applyIntentSetup；手算锚点不得用被测函数计算；不放宽断言；已发布内容只走审批管线；不调用付费模型。
- 不跑慢档测试，也不自己跑全部 affected。交卡后门禁自动跑。
- 本卡验收：tests/s5-03.test.mjs、credit、finance-bank、a3-owner-ding、CORE（engine、storage、plugin），逐文件单独跑。

## 汇报（≤300 字，F:/dnd/logs/sessions/s503f-credit.final.md）
每项的改法与依据、新增锚点、测试结果、评估项的决定、偏离。
