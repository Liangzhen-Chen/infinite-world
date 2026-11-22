# 偏离清查：公共格式（每张小卡开头都要求先读本文件，再读本卡）

## 一、你做什么、不做什么
只清查，只写文档：产出写到本卡指定的 F:/dnd-tmp/dev-<组号>.md 一个文件。不改任何代码、数据表、设计书。
大文件不通读：卷文只读本卡给的"卷:行"范围（用 Read 的 offset、limit 按行号读）；代码只读本卡给的"文件:行"范围。范围里每个函数或每条规则，逐条与卷文对一遍：卷文写的公式、阈值、顺序、必须调用的入口，代码是否照做。

## 二、什么算一处偏离
1. 公式或数值与卷文不一致（读数错）。
2. 卷文要求的规则、步骤、错误码、校验没有做（规则缺），或能被 0/空/null/"不限"绕过。
3. 该调公共部件的地方自己另算一份（见本卡第③项的清单和下面第三节），或绕过唯一入口直读写状态。
4. 代码里写死的数值、种类分支、规则常量（该在数据表里）：看到数字字面量（0、1、2 的通用用法除外）、按具体代号的 if 或 switch、成列的种类字面量，核对卷文或数据表里有没有对应键；有对应键却不读，记。
5. 卷文要求的入口，生产代码里没有真实调用者，只有测试调用。
不算偏离：卷文明写"块 N 不建/未建"且代码按未知带缺口交出的，单独记到"已登记未建"一节，写明卷:行与登记处。

## 三、通用公共部件（看到下列事项自己另写一份、不调这里的入口，就记一条）
- 取维度值：kernel/dimensions.mjs 的 dim、modified、modifiedWith、lookupCurve；不许直读 state 路径或表字段。
- 定点与数学：kernel/det-math.mjs 的 fixed* 与 truncateTo、fixedCurveAt；不许在规则层用浮点除法、Math.* 做确定性数值。
- 采样与随机：kernel/sample.mjs、kernel/handles/keys.mjs 的种子键；不许用 Math.random 或自拼键串。
- 时间：kernel/scheduler.mjs 的 clockView、minutesPerDay；kernel/calendar.mjs 的 astroView、calendarDayIndex；不许自己用 1440、365、24 之类换算。
- 词表条目：kernel/vocab.mjs 的 vocab、kindOf、kindOfEntity；不许直读 engine.vocab 内部。
- 账本：只有 kernel/ledger.mjs 的 post、transfer、openAccount 能改数量；持有边只有 kernel/holdings.mjs 的 openHolding、closeHolding、transferHolding、rescaleHolding 能改。
- 事务与写路径：kernel/transaction.mjs、kernel/storage.mjs 的 readPath、writePath；不许自己拷贝回滚段。
- 位置与格：kernel/place.mjs 的 zoneAt、placeFootprint、placeView、gridView、routeView、pathView。
- 错误：kernel/errors.mjs 的 KernelError、kernel/error-codes.mjs 登记的码；不许自造码、不许手拼 Error 加 code（本仓库里已有的同式 deny 函数多份，已记在 docs/研究/公共部件审查-乙-1122.md，不要重复记）。

## 四、已有审查（不要重复记，遇到同一处写"合并：见某文某节"）
docs/研究/公共部件审查-甲-1122.md、docs/研究/公共部件审查-乙-1122.md、docs/研究/模块化评估-1122.md。先 Grep 这三份里你要记的函数名或文件名，有就标合并。

## 五、"有没有记录在案的理由"怎么查
Grep docs/审查/李白裁定-1117.md、docs/问题.md、对应卷的勘误（卷末"封卷后勘误"一类）。找到写裁定号、勘误号或问题.md 行号；只在代码注释里自述的写"无（仅注释自述）"；都没有写"无"。

## 六、产出格式（每条固定，不猜，缺依据的放"拿不准"）
文件开头一行：共 N 条，甲 a 乙 b 丙 c，有理由 x 无理由 y；一行：本卡读了哪些卷:行范围、哪些文件:行范围（没读到的明写）。
每条：
### 序号 一句话标题
- 位置：文件:行
- 设计原文：卷:行，摘原句（不超过一行）
- 代码实际：一句
- 理由：见第五节
- 影响：读数错 / 规则缺 / 玩法不可达 / 只是形式
- 严重程度：甲（会让玩法出错或数据错）/ 乙（规则缺失或绕过，暂未出错）/ 丙（形式、命名、注释）
- 合并：见某文某节，没有写"无"
末尾三节：已登记未建、拿不准、跨卷待判（一处偏离要读两卷以上才能判的）。
每条必须同时有卷:行和文件:行，缺一不收。不要为凑数收纯风格问题。

## 七、验收
交卷前自查：每条都能在原文里找到（再 Read 一次核对行号）；总数行与条数一致。回报不超过 100 字：条数、甲乙丙各几、输出路径、本卡范围里哪些没读完。
