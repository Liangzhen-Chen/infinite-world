# 卡 W8-E3：S5 剩余四个消费者（D32⑤ 伤愈速率、D09④ 淋湿、D10⑤ 田地已锄进度、D14 草药分种与季节密度）

先读 F:/dnd/logs/sessions/w8e-common.md（必须遵守）、docs/架构设计/ 中相关段落（grep "recoveryRate" "wound" "淋湿" "wet" "weather_exposure" "暴露状态" "已锄" "草药" "herb"），以及下列 todo 原文。

工作树 F:/dnd-wt/W8E3（分支 t-w8e3-consumers）。

## 要做（每项先查规则表与架构文档，按文档做；文档没写的数值不要编，用表里已有的；确实缺的参数追加进 world/ 表并标 calibrate-pending 和出处）
1. **D32⑤**（tests/daily-b2-events2.test.mjs:84）：
   - 生命"几天逐步回升"按伤情病程走：消费 health.json 的 wound 病程与 health:recoveryRate 槽（world/ontology/slots/core.json 已声明）。
   - 替换或叠加引擎里睡眠/休息每 30 分钟 +1 生命的固定速率，以文档为准。
   - 闭式计算（按经过时间一次算出，不逐分钟循环）。
2. **D09④**（daily-b2-world.test.mjs:42）：
   - 淋湿暴露状态 wet 由天气暴露反应规则 weather_exposure 产生（附录 A §A.18 暴露状态行）。
   - 有遮蔽、雨具、室内时不淋湿。
   - 干燥按时间与环境消退。
   - 状态派生或带来源事件，回执和人物面板能看到。
3. **D10⑤**（daily-b2-mechanisms.test.mjs:14）：田地"已锄/耕作进度"成为事实，由真实劳作（受雇锄地或自家锄地）推进，并影响该田地的产量派生（按 agriculture 现有产量派生接入，不另造公式）。
   - 参考 magic-water-earth.mjs:155 的 till 已写 tilledAreaM2：这类写法要统一到同一个事实上。
4. **D14**（daily-b2-mechanisms.test.mjs:72）：草药分种（车前、金银花等，以目录与采集表为准），季节密度与再生各自独立；采集读取它。
   - 先 grep extraction.mjs / remote-generation.mjs 的采集候选处。

四项相互独立：先做成本小的。某项若要大改（例如需要新的公共框架），停在设计说明，写进汇报，不要硬做。

## 可改文件
server-plugin/ 下：health/伤情相关（primitives-body.mjs、body-needs.mjs、medicine-state.mjs、population-health.mjs）、天气暴露相关（weather.mjs、environment*.mjs，反应规则所在文件 grep 后确认）、agriculture.mjs（只限锄地进度；W8-E1 同时会改它的私田收割函数 privateFarmAction，不要动那个函数）、magic-water-earth.mjs（till）、extraction.mjs；world/rules/、world/ontology/ 下相关表（只追加字段，不改已有数值）；ui-personal.mjs（只加显示）；对应测试与新测试 tests/w8e3-consumers.test.mjs。不改 engine.mjs：确需改的写进汇报。

## 测试
- 四条 todo 转正式用例，每条带手算锚点。
- 另跑：tests/medicine*.test.mjs、weather*.test.mjs、agriculture.test.mjs（慢，单独跑，超时就写明）、extraction*.test.mjs、daily-b2-*.test.mjs。
