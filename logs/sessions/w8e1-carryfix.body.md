# 卡 W8-E1：负重收尾（私田分批收割 + 旧夹具超重 + A3 前提超重）

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则；你是 Claude 子代理，可以自己提交：`sh F:/dnd-tools/guard-commit.sh F:/dnd-wt/W8E1 "<msg>" <路径...>`）和 F:/dnd/docs/产品原则.md。

工作树 F:/dnd-wt/W8E1，分支 t-w8e1-carryfix（基于 s5a b031bb76）。

## 背景
W8-C 加了负重规则：
- 安全负重 = 10 + 2×力量 公斤；
- 玩家入囊统一经 server-plugin/items.mjs 的 changeItems / validateItemTransfer 检查；
- 判定在 server-plugin/carry.mjs 的 assertCanCarry；
- 超重拒绝并写差额，同伴、雇工、坐骑可分担。

合并后有两类问题：
1. **私田收割临时豁免**：server-plugin/agriculture.mjs:530 私田收割 `{carryExempt:true}`，整季收成（测试里 150 公斤）一次进囊。这是特判，要去掉。
2. **旧测试夹具开局行囊超重**。夹具直写 state.inventory，例如：
   - W8-B 测试 217 公斤；
   - w4-b2 60 公斤，w4-b3 40 公斤；
   - s3-offscreen-life 52.6 公斤；
   - s3-run001 271.9 公斤。

   结果之后一切入囊都被拒。全量扫描正在进行，结果在 F:/dnd-tmp/scan-w8c/*.out：报 `拿不动` 的就是这一类。扫描跑完前就先修已知的，最后再看一遍目录补齐（`grep -l 拿不动 F:/dnd-tmp/scan-w8c/*.out`）。

   超时（rc=124）的 agriculture、farm-pests-*、wildlife、seasonal-migration、ledger-price 是慢档，基线同样超时，不归本卡。但你改 agriculture 后要单独跑 agriculture.test.mjs（给足时间，后台跑并轮询结果文件）。

## 要做
1. **分批收割**：去掉豁免。私田收割时：
   - 玩家（含搭手分担）背得动多少就收多少入囊；
   - 剩下的留在田间作物账户（fieldAccount 已有，按 cropLot 有到期日），之后可再来收，到期照常腐烂；
   - 记录状态从 ready 到"部分收割/已收完"要真实；
   - 回执写明收了多少、田里还剩多少、为什么（背不动），以及可以怎么办（放下东西、带人搭手、坐骑、多跑几趟）；
   - 一点都背不动时拒绝并给替代做法。
   工时按实际收割量计还是按整块田计，以 agriculture 现有工时派生为准。文档（docs/架构设计/ grep "收割" "harvest"）若有规定按文档。
2. **旧夹具**：逐个修，原则如下：
   - 夹具里的大宗货物，是测试真正要用的就保留，但放到它现实中应在的地方：店铺库存、自家存货/住所、牲口驮着，或用测试实际需要的数量；
   - 不准调高玩家力量来绕过负重；
   - 不准给测试加 carryExempt；
   - 不准放宽断言。
   每处改动在旁边注释一句依据（原来多少公斤、为什么这样改）。若某测试的意图本身就是"背着很多东西"，则按新规则改为验证拒绝或分担，并写明。
3. **A3 前提超重**：tools/a3-setup/claims.mjs:23 的账户直写、physical.mjs:89 的单件初始化目前 carryExempt。
   - 把它们改成：前提给玩家行囊的物品若超出安全负重，报 setupUnmet（理由"前提行囊超出安全负重 X 公斤，01 §1.2"），不再豁免。
   - 先跑一遍 `node tools/a3-score.mjs --summary`（约 10 分钟，后台），和 F:/dnd/logs/sessions/a3-score-w8c.json 比较，汇报 setupUnmetCount 和 route 的变化，以及新增 unmet 的题号。
   - 若新增 unmet 超过 5 题，先停下汇报，不要提交这一项。
4. carry.mjs 里 strengthOf 的兜底读 attr.initial：确认这个值和角色创建时默认力量一致，不一致写进汇报。

## 可改文件
server-plugin/agriculture.mjs（私田收割函数 privateFarmAction 及其回执；W8-E3 同时在改该文件的锄地进度，你只动收割相关部分）、server-plugin/carry.mjs、server-plugin/items.mjs（只限负重检查）、tools/a3-setup/claims.mjs、tools/a3-setup/physical.mjs、扫描里报"拿不动"的测试文件及其 helper/fixture、tests/w8c-carry.test.mjs，以及新测试。

## 测试
- tests/w8c-carry.test.mjs 增加用例：分批收割（手算：力量 10 → 30 公斤，已背 X，收成 Y 公斤/份 → 收 N 份，剩 M 份）、留田的到期腐烂、搭手多收。
- 逐文件跑所有你改过的测试文件。
- 必跑项见共同规则：overfit-guard、arch-metrics、advance-registry（金快照若变，写变化表不要重生成）、numeric-persistence。
- 最后跑 `sh F:/dnd-tools/perf-gate.sh F:/dnd-wt/W8E1`。

## 汇报（≤300 字）
- 改了哪些文件；分批收割的做法；修了几个夹具文件；每类夹具用什么办法修；
- A3 分数变化；
- 各测试 pass/fail；金快照/digest；perf-gate；
- 偏离和未解决的问题。
