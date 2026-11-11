# S5CA 交接

## 结果

- `server-plugin/world-clock.mjs`：持久化 SHA-256 uint32 `draw` 与 `lastDraw`；按 `draw < ceil(probability × 2^32)` 判定，保留原随机决策。
- `server-plugin/effects.mjs`：区域报价 `price` 按 `toRational` 保存为百万分之一文铜分子/分母；覆盖世界时钟历史及原语 applied receipt。
- `server-plugin/det-math.mjs`：从 S5 基线恢复同一确定性数学实现，供有理数写入使用。已登记 `tools/arch-layers.mjs`（L0）与 `tools/system-map.mjs`（base_numeric）。
- `tests/numeric-persistence.test.mjs`：恢复基线验收测试；删除未命中的 `finance_profit` allowlist 项，未放宽断言。`tests/world-clock.test.mjs`、`tests/effects.test.mjs` 将旧小数锚点改为等值有理锚点，仍精确断言价格；新增恢复基线 `tests/det-math.test.mjs`。
- I18 当前闭合，未需改词表。D04 两项当前行为正确：单间 40 文、扣款 120→80、柜钱 +40、只收一次；540 分钟睡眠恢复至体力上限。D04 首项来自 `d0033214`，D04.4 由 `c777e8cd`（A3B，非 S5）启用。

## 验收

- CORE：engine 21 pass；storage 12 pass；plugin 7 pass。
- 动作导出：245 项；actions-catalog 4 pass；action-registry 7 pass；arch-metrics 4 pass。
- 本卡/直接相关：ontology 5 pass；numeric-persistence 1 pass；daily-b2-exact 7 pass；world-clock 6 pass；effects 6 pass；det-math 5 pass。
- invariants 1 pass；invariants/i31-total-order 18 pass。
- 影响测试清单 433 项（>120），按共同规则运行上述 CORE、同步、invariants、本卡和直接相关测试；未跑全量清单。
- `tests/advance-registry.test.mjs`：3 pass、2 fail（full/quiet 两条状态金快照）；未设 `UPDATE_ADVANCE_GOLDEN`、未重生成。预期字段差异：`history[].roll` 小数→`history[].draw` uint32（抽签整数持久化）；`lastRoll` 小数→`lastDraw` uint32（同因）；`effect.price` 小数→`{numerator, denominator:1000000}`（百万分之一有理报价）。
- numeric-digest 当前 Node v24.13.1：full `ae0cde5dbf11c50166fb901adc8b0f28f2fdf5183dc94e56f2558f83172bdeb1`；quiet `f0f1d1a96fbf8a3ddae27ce5e9efd79fd2819a57b385ba6f4ff1c50daecb3533`。状态摘要因上述持久化表示变化而改变；数学函数实现取自基线原样。
- `tests/system-map.test.mjs` 未能在沙箱内运行：`F:/dnd-tmp` 的 `mkdtemp` 返回 EPERM，需主会话沙箱外补跑。

## 工作区

未提交。保留原有未跟踪 `.base*`。临时 `tools/numeric-digest.mjs` 已删除；未改 `docs/actions.json`，未重生成快照。
