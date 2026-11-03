# W8-E6 续：估值的市场供给不得计入估价对象自己的行囊

主会话复核 W8-A 后续失败时发现一个估值缺陷，归你这张卡（valuation.mjs 归你）。

## 现象
tests/mining-jurisdiction.test.mjs:93"远方郡…盗采分别判罚"。盗采案值来自 extraction.mjs:209 的 `goodsWorth(d,this,{item,quantity:1,location,holder:null})`。

marketSupply 在当地把**玩家自己行囊里的铁矿**算进了供给（rows 里 owner:'player'）：
- 寒炉通吉：玩家背 1 块，供给 1、需求 1，稀缺 1，单价 4，罚金 15+4×2=23；
- 赭牙：玩家背着上一处的 1 块和刚采的 1 块，供给 2、需求 1，稀缺 0.5，单价 2，罚金 31+2×3=37（测试原期望 43）。

结果是**盗采者身上背的赃物越多，案值越低、罚得越轻**，可以套利。

## 要做
- 当地市场供给应只计真正在当地出售或可供交易的存量：店铺、市场、粮仓、在售摊位等，以 market.mjs 现有的 rows 来源为准。
- 不计：
  - 估价时的 holder 或被估者本人的随身行囊；
  - 至少不计玩家与无经营身份的个人随身行囊。
- 先查 docs/架构设计/ 关于市场供给口径的规定（grep "供给" "supply" "marketSupply"），按文档定，并写明依据。
- 修好后，mining-jurisdiction 原期望 `{'王国':15+ore*2,'赭牙部盟':31+ore*3}`（目录价 4）应重新成立。不要改这个测试的期望来迁就。
- 改供给口径会影响别的价格。逐文件跑：
  - market*、valuation 相关、shop、trade、w8a-price-migration、s5-02*、a1-daily-probes、daily-b2-*、m2-*、advance-registry；
  - 金快照变化写表，不重生成。
- 加一条反套利用例：同一盗采，身上多背赃物，案值不变。
