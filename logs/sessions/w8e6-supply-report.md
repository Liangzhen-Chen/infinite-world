# W8-E6 续交接：估值排除私人行囊

本轮实现已落在 F:/dnd-wt/W8E6，未提交、未部署。原四项工作已由主会话提交为 fc394fdd；本报告只记录追加的市场供给修复。按时限停止扩展。验收未全绿：四项既有工坊夹具超重、两项沙箱子进程 EPERM，以及待主会话审核的金快照差异仍须处理，不能宣布全部通过。

## 实现与依据

架构依据是 docs/架构设计/15-经济与货币.md §15.2：27 行有效存量为本地可售存量，48 行区分商号成交与没有商号存量的人对人交易，54 行要求扣除持有者自用保留。结合本卡明确要求，将私人携带与营业存量分开；没有修改设计文档。

market.mjs 的公共供给保留已登记商店、明确 trade 经营服务、动态开业且有 shopType 的经营者、既有聚落粮仓/材料存量；不再把玩家和无经营身份居民的行囊列入供给。serviceCatalog.trade 是普通人交易能力，不能当营业身份。私人原有自用保留和承诺需求仍计入需求，不随供给排除而抹除。

finance-assets.mjs 的统一物品估值始终经现有 supplyApart 排除 holder 自己的存量，不再依赖调用方是否传 apart。无 holder 的盗采估值也因公共市场已排除私人行囊而稳定。原 mining-jurisdiction 的王国 15+4×2=23、赭牙部盟 31+4×3=43 断言未改。新增同地点连续盗采：行囊由一块变两块，两次案值均为4，罚金相同。

extraction.mjs 还补齐实际盗采入口漏掉的 null 分支：不再把 goodsWorth(null) 转成0，结果返回 value:null、unvaluable 和 valuationNote，法律链路只算基础罚则。新增零基准物品手算：基础17、倍率3，罚金17，赔偿仍未知。

公开供给改变后真实触发商铺调价，暴露 shop_pricing 的小数持久化。shop.mjs 写入时使用已有整数分子/分母工具编码倍率及决策记录，读取时兼容旧数字倍率与有理数倍率；报价经济含义不变。没有增加持久化白名单。s5-04b 检查1.4新格式及1.2旧格式读回，numeric-persistence 已通过。

## 测试调整依据

没有删除/跳过测试，没有改 mining-jurisdiction 的原罚金预期。价格用例按新的真实公共库存重算，保留原有交易、正利润、现金守恒、FIFO取得成本、税款、分红、冻结赊账与不可重复领取等断言。

* w8a-price-migration：私人存量不影响估值；布匹无公共供给值500，盗窃50，走私24；增加实际 economy:value ×2 的真实案值100/48，继续验证不是目录价。
* s5-02：按 D14/S6 重算净资产；连续买剑367/781、隔日690，买家私人持货不回补市场。独立品质锚点恢复共同初始事实。保留量拒绝实际先命中市场深度，断言准确原因并保留无写入断言。积分固定点向零截断改用同宽单侧误差区间[-q/SCALE,0]，未扩大容差，整数账单差仍精确断言。
* w3-trades：连续镐购买28+61=89，双方精确守恒不变。
* daily-b2-exact：五张兽皮6×1×.6×5=18，钱包20→38、柜台300→282；daily-b2-trade 布匹议价下限 ceil(50×1×.979×.9)=45。
* daily-b2-events2：原药品金额6、总消费30及治疗断言不变；药品模板12→6，去掉原先用来抵消虚假私人供给稀缺.5的系数。
* finance-assets：只调整首例起始事实为玩家20面包、正式商铺60薄饼（面包仍为零），经真实交易取得16面包，每份成本1。满足真实食品供给、深度、日成交上限和30kg负重；所有原财务断言保留。其余四项既有工坊夹具未改。
* s5-04b：原1.2/1.4的数值断言改查精确整数分子/分母，并补实际 currentShops 读回新旧格式。

M2 三文件 tests/m2-preconditions.test.mjs、tests/m2-task-flow.test.mjs、tests/playtests/npc_quest_social.json 逐字节复用已审 E7 提交23fad255，修正本分支尚未合入的燕麦饼10份50文锚点。主会话可通过合并E7取得这些相同改动，避免重复归属；不是本轮另造剧情。

## 验收结果

全部逐文件独立 node --test --test-isolation=none，TEMP/TMP=F:/dnd-tmp，最多三个 Node；只读取摘要，失败定位只看单例尾部。最终重新运行导出工具成功，然后 CORE engine 21/0、storage 12/0、plugin 7/0；actions-catalog 4/0、action-registry 7/0、arch-metrics 4/0。advance-registry 4/1，原因见快照表，未重生成。

通过：w8e6-leftovers 7/0、mining-jurisdiction 7/0、w8a-price-migration 6/0、s5-02 15/0、s5-04b 8/0、shop-restock 7/0、numeric-persistence 1/0、a3-domain-properties 11/0、a1-daily-probes 18/0、r06-bs-market 10/0、labor-market 16/0、settlement-trade 18/0、village-trade-live 5/0、w3-trades 5/0。

全部 daily-b2 文件已跑：exact 7/0、exact2 10/0、trade 10/0、events2 8/0、events 4/0、world 10/0、tables 8/0、mechanisms 4/0。全部 M2 文件已跑：task-flow 4/0、preconditions 6/0、action-context 10/0、reply-protocol 10/0、people-content 8/0、npc-prompt 6/0。

finance-assets 最终5/4：首例真实交易与财务链已修复并通过；其余四项为原有工坊夹具在玩家负重约217kg时再加4.8kg木钉，超过30kg。原卡交接已有这组阻塞，本轮没有放宽负重或断言。需要主会话串行安排工坊仓储/夹具处理，不能据此称全绿。overfit-guard 2/2：两项 spawnSync git EPERM，须主会话在沙箱外补跑。原卡明确允许不跑的慢测 ledger-price 本轮未跑；原卡其他验收参见既有 w8e6-leftovers-report.md，不冒充本轮重跑。

## 金快照与下一步

逐字段清单见 w8e6-supply-golden-table.md，列明全部272项字段、旧→新、原因。full 场景因营业食品采购、补货、利润和安全的调价记录产生变化；quiet 不变。钱袋与聚落公库总和 full 29191→29191、quiet 29216→29216。数值函数哈希不变，full 状态哈希 f605172d99ec33bb1428db17e62550fa42cd7a71eb8d99d7e89637a79361162f → b18de1ad6ad255c95c26c1de128bdfcb493be84693843818d59cb77c21f3460f；quiet 哈希不变。

对当前 s5a 另有12项 E3 cultivation/weather_exposure 记录本分支未合入的差异，已单列，不能作为本卡删除。主会话合并时保留E3。未设置 UPDATE_ADVANCE_GOLDEN，也未修改快照文件，由主会话审核表后统一更新。

下一步：主会话合并时处理E7重复文件，保留E3；处理四项既有工坊夹具阻塞；沙箱外补跑overfit；审核金快照表后统一更新，再提交并更新主会话状态文档。

git diff --check 通过。仅源码、对应测试、自动导出的 docs/actions.json 有改动；未触及 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。未修改其他卡锁定的 agriculture/body-needs/environment 文件。原有未跟踪 .base 保持原样。未结束任何进程，临时运行副本与调试差异文件已清理；保留本报告、完整前后状态导出和逐字段表作为交接材料。
