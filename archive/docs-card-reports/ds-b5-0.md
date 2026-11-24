# 卡回报：B5-0《块 5 勘误与码登记》（勘误 1118k25）

## 交卷前自查

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 李白 11-18 22:10 裁定 五.1、丙5、丙8、丙9 原文（`docs/审查/李白裁定-1117.md:1081–1101`）逐条落到：卷二 §2.6 :517、§4.3 :1574、附录 D :3165；卷九 §2.8 :410、§4.2.2 :653、附录修订记录 :1764；卷十八 §4.1.1 :457、附录 :1671；`docs/迁移体检/块1-P-2.md:24`、:66 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 新码是整类拒收码（原语适配器或其目标写者尚未上线），不按 id、文件名或卷名分支；端类型按模板名闭集，不点名个别类；E-ACT-PRIMITIVE 原义未动 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不新增限额/门槛/校验；删除 applyPrimitive 后 `grep -rn "applyPrimitive" server-plugin world tools tests schemas` 无输出（调用方为 0）；`world/ontology/state-owners.json` 无 applyPrimitive 行，未改 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 新断言只用手写码名与卷出处：`tests/kernel/error-codes.test.mjs:93` 断言 `E-ACT-WRITER-NOT-READY` 出处为 `['vol2.s4.3','vol9.s2.8']`；条数是该测试自身"手写字面量"设计，随有依据的勘误改，不是抄基线读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何允许写法的代码，未造假常量；只登新码、删 applyPrimitive、改卷文登记与测试手数 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 已跟踪文件 11 个：104 行增、39 行删，共 143 行；另 3 份勘误前快照整卷新增 6838 行（不计入改动行）。`tests/kernel/error-codes.test.mjs` 不在卡文所有权清单，但该测试把码表总条数写成手数字面量（595/E 577），加一码必须同步，否则测试必红；改动仅为计数与一条出处断言，见下"说明" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 接主线并合入 4-4c 后重跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 595 / ℹ pass 595 / ℹ fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`、无 `E-ACC-CRITERION-UNVERSIONED`（items 三个既有 fail 为 `vol12.A12-4.5`、`vol12.S12-2`、`vol12.S12-3`，非本卡引入） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 清掉块 5 开写前的登记障碍（整类拒收码、执行器归组、kernelApi 裁决、P2-12 primitives 同路径改写、端类型启用条件），使 5-1 能按裁定开写并按"明确拒收"处理未上线写者，直接服务块 6 可玩切片所需的原语/持有/终止；未写死、未造桩、未跳规则引擎 |

## 做了什么

1. **新码 E-ACT-WRITER-NOT-READY**（含义"原语适配器或其目标写者尚未上线"）：先登 `server-plugin/kernel/error-codes.mjs:82–83`（卷九组）与 `:105–106`（卷二组，只登记）；再登卷九 §2.8 错误码表 `:410`、卷二 §4.3 码表 `:1574`。E-ACT-PRIMITIVE 保持原义，只管契约不合。
2. **删 applyPrimitive**：卷二 §2.7 kernelApi 示例删 `{"export": "kernel/primitives.mjs#applyPrimitive", ...}` 一行；`world/ontology/state-owners.json` 无该行（亲读确认），未改；全仓代码/数据/测试 `grep applyPrimitive` 无命中，无调用方。
3. **执行器归规则层**：卷九 §4.2.2 :653 写明"执行器归规则层，文件 `server-plugin/primitives-runtime.mjs`，入口 `execute`；只由 `resolve()` 的提交段与推进钩子的调度方调用（二者都在规则层，调用面最短）"（裁定五.1 原文）。
4. **P2-12**：`docs/迁移体检/块1-P-2.md:24` 的 primitives 那半改为"块 5 同路径改写 `world/ontology/primitives.json` 不删"（裁定丙8，以卷九 :624 为准），holdings、verbs 照原挂账转换后删；同步改第四节第 2 条与修订说明 :66。
5. **丙5 启用条件**：卷十八 §4.1.1 :457 与卷二 §2.6 :517 同号写明"持有种类端类型先收为模板名闭集；按实体表解析的核对随第一张建对应实体表的卡启用"（照裁定原句）。
6. **勘误手续**：三卷各存 `版本快照/…-勘误前-1118k25.md`，改正文，附录追加一行（依据"李白 11-18 22:10 裁定"），覆盖现行快照（卷二 `卷二-v17补26-现行.md`、卷九 `卷九-v2.md`、卷十八 `卷十八-v8.md` 与 `卷十八-封卷.md`），不升版本，历史修订不回改。

## 说明（偏差与判断）

- **卷九"§4.3 码表"实际位置**：亲读卷九，§4.3 是"统一裁决流程与检定"，错误码表在 §2.8（:392 起）。按卡文"`grep -n "E-ACT-PRIMITIVE"` 两卷找码表位置"，新码登在卷九 §2.8 :410 与卷二 §4.3 :1574，未另立表。
- **"卷二同处"**：卷二没有独立的"端类型"段；落在卷二 §2.6"持有写者的开边与关边次序"条末（:517，持有写者登记处），与卷十八 §4.1.1 :457 同号写明同一启用条件。
- **测试文件越出所有权清单**：`tests/kernel/error-codes.test.mjs` 的总条数按该测试注释的设计是手写字面量（改前 595/E 577）；新增一码若不改，测试必失败。改动仅为 595→596、E 577→578（附依据注释）与一条出处断言，未降门槛、未改判定口径。
- **判据指纹重盖**：`error-codes.mjs` 经 `validate/dimensions-validate.mjs` 进入 12 个扫描类别的检测器 import 闭包；用 `tools/accept/register.mjs` 以 `.tmp/b50-register-input.json`（`criteria.json` 副本、12 行 rev+1 并追加同号修订记录）重盖，`registered: criteria`。旧修订记录一条未删，`print` 由登记器按当前闭包现算；`.tmp/` 被 `.gitignore` 忽略，未提交。
- 未用 `--no-verify`、未 push、未 force-push、未改历史；未操作原存档；未用 Fable。

## 测试与门禁

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 591`、`ℹ pass 591`、`ℹ fail 0`、`ℹ duration_ms 125014.2631`。
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`items` 的 3 个 fail 是既有开放项（`vol12.A12-4.5` E-ACC-PARAM-UNCONSUMED、`vol12.S12-2` E-ACC-REGISTRY-WRITE、`vol12.S12-3` E-ACC-ITEM-COUNT/ORPHAN/UNREGISTERED），本卡未改其判定。
- `grep -rn "applyPrimitive" server-plugin world tools tests schemas` → 无输出（0 命中）。

## 只核（DeepSeek，2026-11-18）

- 只核对象：a7cb8c5d《块 5 勘误与码登记》；原文见 `docs/审查/B5-0-DS只核-1118.md`。
- 结论：**必须改（一项）**——卷二附录修订记录里 1118k24 那一行被回改（ASCII 引号改全角），违反“历史修订不回改”；其余重点五项通过（码登记与出处、删 applyPrimitive、执行器归规则层、P2-12/丙5、勘误快照与附录、criteria 12 类）。
- 修法：把正文与 `版本快照/卷二-v17补26-现行.md` 的 1118k24 行恢复为改前字节，再核正文与现行快照 `cmp` 一致；1118k25 新增行不动。
- 命令：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → 591/591/0；`node tools/accept/run.mjs pre_commit` → verdict pass（3 个既有 fail：vol12.A12-4.5、S12-2、S12-3）。

## 接主线（4-4c 并入后重盖，2026-11-18）

- `git fetch origin && git rebase origin/master`：B5-0 三个提交接到主线 `be759cb6`（4-4c《整数开方全仓一份》）。唯一冲突 `tools/accept/criteria.json`，按卡文取主线一侧（rebase 中 `--ours`）；其余文件无冲突。
- 主线 4-4c 与本卡都从同一基线对同样的 12 个扫描类别 rev+1（`det-math.mjs` 的 fixedSqrtInt 与 `error-codes.mjs` 的新码都在检测器 import 闭包内）。rebase 后按卡文经 `tools/accept/register.mjs` 对 12 类各重盖一次，rev 在主线值上再加一、log 追加“接主线 4-4c 后重盖，判定口径不变”：
  const_literal 38→39、dual_write 29→30、handfill_derived 30→31、instance_name 46→47、item_form 31→32、namelist 31→32、param_consumed 23→24、registry_write 47→48、seed_sites 10→11、self_name 36→37、state_pattern 7→8、undeclared_io 25→26。
  主线 4-4c 的修订记录一条未删，`print` 由登记器按当前闭包现算（合并了两处改动的闭包），未手改 `criteria.json`。
- 卷文不动：`cmp` 逐卷核对正文与现行快照仍相同——卷二 `卷二-维度表规范与统一入口.md` = `版本快照/卷二-v17补26-现行.md`；卷九 `卷九-AI接口.md` = `版本快照/卷九-v2.md`；卷十八 `卷十八-社会关系与家族.md` = `版本快照/卷十八-v8.md`，亦 = `版本快照/卷十八-封卷.md`。四组均无差异。
- 验收（接主线后重跑）：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 595 / ℹ pass 595 / ℹ fail 0`；`node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097/9901/15709/15709/2001)`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，无 `E-ACC-CRITERION-UNVERSIONED`、无 `E-ACC-ITEM-DOWNGRADE`。
