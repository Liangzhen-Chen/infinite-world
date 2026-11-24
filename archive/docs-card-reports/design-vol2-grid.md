# 卡回报：卷二格子世界新版（第十八版，迁移第 1 步第二卷）

写：Claude Opus 5.5 中档；分支 design/vol2-grid（工作树 F:/dnd-wt/dz-v2，基于 master eb7eac54e）。未派子代理。

## 自查表（派活卡头规矩第三节）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 依据：卷五第十二版 §5 卷二两行（卷五:1297 八项、:1298 `layout_change`）、卷五 §2.1（:85–:236）、§3.3（:341–:385）、§4.1.1（:425）、§4.1 规则 2（:452）、Q23（:1437）；卷五审查 `审查/卷五v12-Opus只核-1120.md` :86（Q23 交卷二）、:111（无行为人事件带 `pos`）；研究文档 :241（卷二行）、:155、:162；李白 11-20 00:15 拍板第 3、5、9、10、12 条与 V1 |
| 2 | 没有按 id/名字/场景写特例 | 是 | `byFootprint` 只按组件类判足迹种类（判据只在卷五 §4.1 规则 2）；个体所在地点统一走 `zoneAt(pos)`（卷二 §1.12 新条） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `zoneAt` 未知按未知传播总则（§1.12 新条），不顶替；`portal` 为 null 即非门边；`coarse` 位置仍在目标足迹内（照卷五规则 14）；`location` 写进 person 行即按未知字段报错 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 本卡只改设计文档，不写测试 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 不涉代码 |
| 6 | 只改了卡文列出的文件；diff 共 70 行 | 是 | 卷二正文＋旧版快照作废标记：2 files changed, 44 insertions(+), 26 deletions(-)；另加本回报 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 1200 / fail 0；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 迁移第 1 步三卷之二定稿草稿，G1–G5（`struct:pos` 类型登记、人物 `pos`、place 新表头）可据此开卡；不缩规模、不写特例、位置只一份真相 |

## 改了什么（结构要点）

- 卷首升第十八版，写依据与改动清单；旧第十七版（含全部封卷后勘误）的最终全文就是已有的 `版本快照/卷二-v17补26-现行.md`（cmp 与改前正文逐字节相同），首行标【作废】并指向现行版。
- §1.2 `required` 加 place 表专用命名条件 `byFootprint:<种类>[,<种类>…]`（解卷五 Q23，选"卷二加一类"）；§1.9 补代码内封闭枚举 `footprint_kind`（region building room volume），判据与禁填只在卷五 §4.1 规则 2。
- §1.5 登记命名 struct `struct:pos = {w, x, y, z: integer:count, coarse: boolean}`，定义处卷五 §4.1.1。
- §1.12 新条"个体所在地点"：从个体出发找地点一律取 `zoneAt(pos)`；§3.5 `located`、`jurisdiction` 读 `npcs.*.pos`。
- §2.6 行改挂：人物换位置写 `pos`、`facing`；离场读法"按坐标"改"按足迹与格"。位置量仍按归属卷单项登记名单枚举，卷五已登 `parent`、`anchor`、`facing`，原语本身不用改。
- §2.7：`dated` 的旧"待补"（位置量与按日改写冲突）在第十二版下已不存在，改写为两类写者落在不同模式；收录顶层键 `cells`（写者 grid-diff.mjs，分片口径归卷二十七）；`sys.travel`、`sys.place` 两行跟改。
- §5.5 人物：删存储列 `location`，加 `pos`、`facing`，`location` 只作 `zoneAt(pos)` 的读法说明。
- §5.6 place 表头照卷五 §2.1：`coord` 改区域种子，加 `targetAreaM2`、`boundary`、`anchor`、`facing`、`spanZ`、`anchorElevationM`、派生 `centroid`、`areaM2`、`zRange`，`elevationM`、`slope`、`skyExposure`、`waterAccess` 改派生；edges 删 `distanceM`、`terrainMix`、`speedFactor`、`openness`，加 `portal`；`waterKind` 进表后组件类说明。
- §6.3 迁法三行；附录 G 加一行；D.1 加第十八版行（含别卷牵连清单）。

## 须跟改的卷（本卷不改，详见 D.1 第十八版行）

卷五（§2.1 必填栏改写 `byFootprint:<代号>`，§4.1 规则 2 写四个代号与禁填、错误码，Q23 关闭，§5 卷二两行改为已落地——:1298 所请 `layout_change` 的 `row`、`fromParent`、每次改挂必发、`resource-field.mjs` 接收方在卷二第十七版 §2.6 第 4 点与 §2.9 第 0 条早已具备）；卷四（person 读 `location` 处）；卷十七（`placeSubject` 写 `pos`、`facing`）；卷二十四（表 A 载荷公共字段加可选 `pos`——事件字段归卷二十四，不归卷二）；卷二十七（`cells` 按里块分片）；卷三乙（批次 `spot` 引 `struct:pos`）；卷十（写回器按新表头、人物经 `landCell` 落格）；卷十九（§4.4 规则 3 ④ 翻修房间行原经 §2.6 第 1 点 ③ 挪位置，卷五第十二版已改为随蓝图派生）。代码：`validate/types.mjs` 登记 `struct:pos`、加载器认 `byFootprint`、`person.mjs`/`death.mjs`（卷五 M5-38）。

## 未决与已定

- 已定：§2.6 第 1 点 ③（限事务改挂）机制暂留——条文只说"只许卷五房间行这样登记"，卷五第十二版不登记不构成矛盾；卷十九跟改后若仍无登记者，再按删除优先删。理由：删机制是设计改动，超出本卡"必然牵连"范围。
- 已定：`struct:pos` 四个序号字段单位取 `count`（照 `manifestRow.ordinal`、`identityKey.keyId` 先例），`facing` 同。
- 已定：人物 `location` 不登派生维度（`zoneAt` 超出 §1.12 封闭原语），也不另设视图字段名，读者直接调 `zoneAt(pos)`。
- 偏离卡文：旧版快照没有另存 `卷二-v17.md`（该文件已是第十七版初版、勘误前，覆盖即改写历史快照），改为把与改前正文逐字节相同的 `卷二-v17补26-现行.md` 标作废，做法同卷五（标已有 `卷五-v11.md`）。
- 无"等李白裁定"项。

## 违纪自报

- 跑 pre_commit 时用了一次 `2>&1 | tail -3`（重定向），只读、未写文件；随后改用 `| grep verdict` 重跑。

## 验收

- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1200 / ℹ pass 1200 / ℹ fail 0`
- 本卡只改文档，未使任何自检脚本或测试失败；`tools/accept/scanclasses.json` 只按 `S` 前缀读卷二 §7 断言，§7 未动。

## 修改轮（`审查/卷二v18-Opus只核-1120.md` 与 6-19 只核 M6）

- 必须改 M1：§2.7 `sys.facility_type` 收录行删 `aperture`、`skyExposure` 两项写者（注明卷五第十二版改派生）；项数"11 项"是卷十九 §3.3 的计数，卷十九未改前不动。D.1 卷十九项补"§3.3 删这两维写者"。
- 6-19 M6：核实属实——卷二 §2.7 kernelApi、groupApi 都是"逐个导出名的闭集"，两项都不在表内，而 ds-b619 的 state-owners.json:280、:302 已登。`loadDisplayBlocklist` 只返回词条数，`BlockNeedle` 不出 gate 组，与 §2.9 第 6 条不冲突。照数据原样补登两行，只登记、不改语义。
- 建议全采纳，都只动文字：B1 把 `location` 从 §5.5 表里挪到表后说明；B2 卷首收窄为"按卷五 §5 卷二行 ③ 所列"，Q1 其余维度记进 D.1；B3 `comp_route` 旧请求记进 D.1，正文不改；B4 D.1 写明卷十九卡须收尾 ③；B5 D.1 卷五项补 `zoneAt` 写 `declareInputs`；B6 D.1 卷五项补"登码后收进本卷 §4.3"。
- 验收：pre_commit `"verdict": "pass"`；卷二两份自检 `check-vol2.mjs`、`check-vol2-ext.mjs` 都是 `== 结果：PASS`；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 1200 / fail 0。修改轮卷二 diff：1 file changed, 7 insertions(+), 4 deletions(-)。

## diff 行数

卷二正文与快照：2 files changed, 44 insertions(+), 26 deletions(-)，共 70 行；另加本回报文件。
