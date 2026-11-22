共 7 条，甲 0 乙 5 丙 2，有理由 1 无理由 6。

本卡读了：卷二十 :94-212、:424-466、:488-570（三段的指定范围全读完）；server-plugin/kernel/scheduler.mjs :1-717、:795-898（未读 :718-794 争夺裁决正文）；为取证据另读 events.mjs :135-146、:440-524，storage.mjs :188-300，vocab.mjs :40-99，save.mjs :490-515，validate/types.mjs :215-254，world/ontology/state-owners.json、world/rules/tables/clock.json、world/rules/registry.json 的相关行。

核过无偏离（卡文点名要核的三项）：① scheduler.mjs 无 1440、60、24 字面量（唯一出现是注释 :65），日换算走 minutesPerDay（读 _units.json，符合 :491 与 :197-208）；② 同刻全序键逐字段与 :507-514 一致：dueKey :106-108=(stage,kindRank,layerRank,owner,ref,registeredMinute)、clockKey :115-117=(stage,phaseRank,sortKey,layerRank,hook,subject)、reactionKey :125-127=(stage,rank,pack,rule,subject)、sourceKey :135-138=(stage,layerRank,source,subject)；③ due_kind.rank 全族互不相同在 checkClockTables :887（E-DUE-RANK-DUP）核，堆内按 (dueMinute,handle) 全序、同刻再按 dueKey 排序且 sortChecked :645-651 拒并列；④ delay 0/负数/非整数在 enqueueDelay :260 拒收，重复 (owner,kind,ref) 在 schedule :374-376 报 E-DUE-DUPLICATE；句柄进制读 kernelConstants.handleRadix（:240-243、:379），无字面量进制。

---

### 1 到期事件的 id 没有并入句柄，同拥有者同种同刻多 ref 会撞号
- 位置：server-plugin/kernel/scheduler.mjs:406-418（emitDue）；events.mjs:146（deriveEventId 只有 seed/rule/subject/minute/position 五段）
- 设计原文：卷二十 :517，"该事件 id 的派生成分统一加入该到期项自己的句柄 id，即上文 `due.*` 的键段，确定性派生、唯一，所有到期事件都如此……（封卷后勘误 1121k11）"。
- 代码实际：emitDue 只传 `{rule: item.kind, subject: item.owner, position: 'pos.only'}`，不给句柄；id 五段里没有 handle。
- 理由：无。前身已记在 docs/审查/6-19-Opus只核-1120.md 第 5 条（未决 C，当时卷文未给细则）；1121k11 已给出"并入句柄"的细则，实现未跟。
- 影响：规则缺。同一 owner、同一 kind、同一分钟、不同 ref 的两笔到期事件派生出同一 id，events.mjs:522 撞号即 E-SEED-COLLISION 拒写，整刻作废、世界卡在该刻；现登记的两个 due_kind（due_revive_window 每实体一项、due_recurrence）暂时碰不上。
- 严重程度：乙
- 合并：见 docs/审查/6-19-Opus只核-1120.md 第 5 条（同一处；该文判 C 等李白，1121k11 后已可判为实现缺口）

### 2 untilEvent 型时长没有实现"调度器订阅该动词、事件到达即发到期事件"
- 位置：server-plugin/kernel/scheduler.mjs:429-463（dueSource 只从到期堆取项；全仓库 server-plugin 无 untilEvent 订阅路径）
- 设计原文：卷二十 :518，"`untilEvent` 型时长不入堆，由调度器订阅该动词，事件到达即发同一个到期事件。"
- 代码实际：到期项只能经 schedule 入堆、由 dueSource 弹出；没有任何模块登记订阅 untilEvent 所指动词并派发 verb_due_elapsed。
- 理由：无。
- 影响：规则缺（暂未出错）：现世界数据只有 due_kind 两项且都是按时长入堆，尚无 untilEvent 型到期项；一旦有卷登记这种时长，到期永远不会触发。
- 严重程度：乙
- 合并：无

### 3 floorRX 延迟下界没有实现，非空即抛普通 Error
- 位置：server-plugin/kernel/scheduler.mjs:259-268（enqueueDelay；:265 遇到非 null floorRX 抛 `new Error`）
- 设计原文：卷二十 :148，`floorRX` | rx nullable | 结果 ≥ 1 分钟 | skip | 延迟下界（:251-253 注释亦自述待补）。
- 代码实际：入堆缩放只取 `max(1, floor(delay × den ÷ num))`，不编不读 floorRX；floorRX 非空直接抛普通 Error（非 KernelError、无错误码）。
- 理由：无（仅代码注释自述"待首个延迟类条目所在卷接入"）。
- 影响：玩法不可达：一旦登记延迟类（latency）且带 floorRX 的 due_kind，schedule 即抛错，这类到期项无法入堆。
- 严重程度：乙
- 合并：无

### 4 clock.seq 声明由调度器写，实际无任何写者，不是日志位次
- 位置：server-plugin/kernel/scheduler.mjs:204-208（clockView 只读 clock.seq）；world/ontology/state-owners.json:7 登记 writer 为 kernel/scheduler.mjs
- 设计原文：卷二十 :454，"`clock.minute` `clock.seq` | `kernel/scheduler.mjs` | 单调不减。`clock.seq` 是事件在日志里的位次，只是输出"。
- 代码实际：scheduler 只读 clock.seq，从不写；events.mjs 追加日志（appendLogEntry 返回序号）后也不回写 state.clock.seq；生产代码全仓无第二写者，测试夹具一律给 0。
- 理由：无（world/ontology/state-owners.json:7 只登记写者名字；docs/PLAN.md:144 的世界创建卡未登记 clock.seq 的初值与增量写者）。
- 影响：读数错：clockView().seq 永远停在初值，不是事件在日志里的位次；且状态缺 clock.seq 时 clockView（含 emitDue :408 取 minute）直接 E-DIM-UNKNOWN-READ。
- 严重程度：乙
- 合并：无

### 5 clock.dueNext 缺失时默认 0，可绕过"计数器在状态里"的校验并撞号覆盖
- 位置：server-plugin/kernel/scheduler.mjs:377-381（`readPath(...) ?? 0`）
- 设计原文：卷二十 :498，"序号计数器存在世界状态里随存档走（落 `clock` 状态……）；……序号只增不回收，`cancel` 后不复用"。
- 代码实际：计数器读不到时静默取 0 继续发句柄；不像 clockField :191-195 那样缺值即 E-DIM-UNKNOWN-READ。
- 理由：无。
- 影响：规则缺/特殊值绕过：状态若已有 due 行而缺 clock.dueNext（旧夹具、手造或世界创建漏写），新句柄 `due_0` 会与现存句柄重名，txSet :381 静默覆盖该到期行（数据丢失），不拒收。
- 严重程度：乙
- 合并：无

### 6 rules.clock 要求两个卷文 §2.1 未登记的表键：contestDefault、paceFactor
- 位置：server-plugin/kernel/scheduler.mjs:49（tableKeys 含这两键，:854 缺即 E-DIM-STRUCT-FIELD）、:263-264（读 paceFactor）
- 设计原文：卷二十 §2.1 的 rules.clock 字段表只有 cadence、phaseOffset、reactionDepthMax/proposalMax、drawSites、paceSoakTol（:134-138），没有 contestDefault、paceFactor；全卷正文也无这两键（仅 :1044 说入堆缩放"显式配置项、暂按 1、标待补"）。
- 代码实际：加载时把这两键当必备字段，schedule 的延迟类缩放读 paceFactor；世界 data 里两键都有（world/rules/tables/clock.json:8-9）。
- 理由：有。paceFactor 依李白 11-18 02:40 K4-43（docs/审查/李白裁定-1117.md:734）与 §4.10.5 的显式配置要求；contestDefault 依方案 §1.2 :53（旧 CONTEST_RULES 缺省表进规则表）。卷二十 §2.1 表补行未回补（docs/审查/块4-2-只核原始输出.md:30 已提出）。
- 影响：只是形式：代码按要求建了显式配置项，卷文表落后；照卷文表原样写世界的会被判缺字段。
- 严重程度：丙
- 合并：无

### 7 取词表条目与 rank 直读 engine.vocab / registry().vocabIndex / env.vocab.families，未走 vocab()
- 位置：server-plugin/kernel/scheduler.mjs:159-163（entryRank 读 engine.vocab.index.get(id).entry.rank）、:365（registry().vocabIndex.get(kind)）、:857-859（env.vocab.families 枚举）
- 设计原文：卷二 :469，"横切入口：……`vocab(engine,family,id)`；`kindOf(id)`（查注册表）"。
- 代码实际：按代号取条目的地方自读索引哈希，拿活引用而非 vocab() 的冻结副本；族枚举也无公共读口（族枚举读口本身缺）。
- 理由：无（属已登记待修的直读面）。
- 影响：只是形式：现只读 rank/family，读数与 vocab() 相同；风险是拿到未冻结的内部对象，且族枚举没有单一读口。
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 五.6（族条目枚举读口缺，45 处直读之一；修理项第 12 条）

---

## 已登记未建

1. **advance 推进驱动、dueSource/hookSource 装配、advancePlan 回调**：卷二十 :505（第 2 条 next=min(堆顶,各钩子下一拍,target)）、:547（§4.1.4 调度器每次推进先取 advancePlan 结果）。生产代码无调用者，只有测试（tests/kernel/scheduler*.test.mjs 等）；登记处：scheduler.mjs:16 注释"advancePlan 的回调时机与层序……块 6 卷二十七 §4.1 卡"、docs/迁移体检/块6.md K6-101（6-27 time 适配器）。
2. **clock.dueNext 字段未回补卷文**：卷二十 :498 自述"具体字段由 4-2 定、随卷二十勘误回补"；code 已用 clock.dueNext（scheduler.mjs:377，state-owners.json:7）。
3. **paceSoakTol 未建**：卷二十 :138（§4.10.6 浸泡容差）；登记处 world/rules/registry.json:180"paceSoakTol 随块 7 节奏卡（收尾待办）"、K4-43。
4. **schedule 待执行项记录落处与到期执行入口**：卷二十 :500（封卷后勘误 1118k26，挂"第一张要 AI 定时动作的玩法卡之前"）；登记处 docs/PLAN.md:46。
5. **释放钩子先于折叠**：卷二十 :510（封卷后勘误 11-14，附录戊）；现 state-owners 无释放/折叠钩子，待其登记时由 phase/sortKey 数据排，代码无专设分支。

## 拿不准

1. **paceFactor 的入堆缩放用浮点除法 + Math.floor**（scheduler.mjs:266）：卷二十 §4.10.3 第 2 条公式就是 floor(原延迟 × den ÷ num)，代码算式相符；但公共格式第三节要求确定性数值走 det-math、不许规则层浮点除法。scheduler 是否算"规则层"、delay 与 num/den 均安全整数时 Math.floor 的舍入边界是否须另证，卡文范围（§4.10 不在本卡卷:行）不足，未判。
2. **advance 的参数是绝对 target 还是分钟数**：卷二十 :505 写 `advance(target)`、:591 注释按 `now + minutes` 求 target；kernelApi 的正式签名在卷二/卷二十七，未在本卡范围读到。
3. **上限报错 detail 的字面格式**：卷二十 :526 示例 `reactionDepthMax limit=… actual=…`；代码 :678 生成 `reactionDepthMax: limit 8, actual 9`（多冒号与逗号）。三项信息齐全，是否须逐字照示例未写死。

## 跨卷待判

1. **到期事件 id 的确切成分形状**：卷二十 :517 已给"并入句柄"这条，但"细则见卷二十七 §8 第 13 条③"未在本卡卷:行内，五段派生的最终写法（句柄作独立成分还是并入主体段）需读卷二十七方能定；本条 1 只按卷二十 :517 判"未并入"。
