# 卷十九 :109 流水账改三个求和映射：只核（Sonnet 5.5 中档，非写者）

被核：分支 ds/wallflow-maps，写者提交 23c83368e，对基线 31a8aa028。照卷十九 :109、Opus 终核 C 卡第 2 轮 M2（docs/审查/C卡建账-Opus终核-1123.md :107–114）、李白 11-24 H-2。已读派活卡头规矩一至三节。

## 结论：过，必须改 0 条

## 1. 改法是否就是 Opus 建议
是。Opus 建议"struct{laidKg, takenKg, lostKg: map<ref material, number> combine=sum}，onUnknown 保持 error"。place.json 的 wallFlowKg 现为 struct，三个字段各是 combine: sum 的 material 键映射，值域 [0,null]、precision 4、unit kg，onUnknown 回 error，requiredFields 三项。与 materialKg 同为 sum 映射，用的都是 types.mjs 现有的 struct 字段与 sum 映射，没有新造类型；卷二 §1.6 第 4 项（非 sum 映射报错级须写满键族）因三项都是 sum 而不触发。wall-flow.mjs 的 openingWallFlow 只改输出形状，仍按代号序，0 也逐料照记。envelope.mjs 未动（它只调 openingWallFlow），合理。

## 2. 勘误与流程
- 卷十九 :109 类型栏、守恒式、"没有的料按 0"与代码一致；勘误句写明了依据、原因和不变项。
- 快照 版本快照/卷十九-v16-勘误前-1124k10.md 的 blob（228606e5…）与基线 31a8aa028 上卷十九的 blob 相同，合"改前快照"。
- 不升版本号；勘误 1124k10 追加在修订记录末尾（:2222，紧接 1123k60），历史记录没改。
- 小瑕疵（不挡）：勘误写"gen/envelope.mjs 随形状"，实际该文件没改；无影响。

## 3. 八个夹具
逐个看 diff：blueprint-view、bubble-world、cave-view、grid-diff、perceive-world、place-footprint-columns、place-footprint、route-edges 八处，都只是在建筑行夹具上补 `wallFlowKg: { laidKg:{mat_granite:1000}, takenKg:{…:0}, lostKg:{…:0} }`，与同行 materialKg 一致、满足守恒。这是 wallFlowKg 变成 byClass:comp_facility 的 error 级必填后夹具需要的前提数据，不是放宽；这些测试的断言一行未动。gen-envelope.test.mjs 里只是把期望值改写成新形状，数值逐项不变（16800/100/5/0/7/3 等）；守恒用例仍逐料断言 laid−taken−lost=materialKg，且 openingWallFlow 的字面量期望按代号序手写。

## 4. 作者写仍拒收
gen-envelope.test.mjs 的"流水账是账、作者不写"用例仍在：作者写 wallFlowKg 即 E-GEN-ROW-INVALID，非作者值不重写不报错。

## 命令
- node --test tests/kernel/gen-envelope.test.mjs：tests 14 pass 14 fail 0。
- node tools/accept/run.mjs pre_commit（不带 --write）：verdict pass，items fail 3（vol12 的 A12-4.5、S12-2、S12-3，即已知基线三项）。
- 未跑全量测试；八个夹具所在测试文件未单独跑，合入前主会话请跑全量。
