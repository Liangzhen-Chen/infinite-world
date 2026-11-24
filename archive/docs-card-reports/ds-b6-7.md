# 6-7 地点表与包含树 回报

写：Claude Opus 中档（会话内子代理），两轮（第二轮照 docs/审查/6-7-Opus只核-1119.md M1–M4 与主会话勘误指令改）。

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷五 §2.1 :90–:101（parent、coord、areaM2、terrain :93、elevationM、skyExposure、aperture、enclosed、surfaceRefElevationM、depthM、underground）、:129 waterAccess、:136 forestCover、:144 accessClass、:145 regionLevel、:168 hiddenness、:193–:195（edges 节）、:219 组件类段；§2.2 :227 terrain 族、:229 water 族、:236 access 族；§3.1 :285；§4.1.2 :393；§4.1.3 :409 规则 1–5（规则 3 前半坐标包含）；§4.5.3 :628；§4.14.1 :1058；A5-1.2；卷二 §5.6 :1753–:1781、:1760 terrain 十项；§1.9 :288 族名表；§1.12；§2.8 S13 :2428；:287 实体前缀；§1.4 m、m2；det-math.mjs atan（π/4 表值）|
| 2 | 没有按 id/名字/场景写特例 | 是 | place.mjs 只读表头登记的维度名、边节字段与关系行；族名比较取 T.vocab_family（markers.mjs 定义源），错误码取 E.E_MOD_RX（generated.mjs），无地点 id、层级代号分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | place.test：parent 不存在/空串/null（多根）/缺键/自指；areaM2 0、负、null；坐标同点（距离 0）、父最小面积 1 m2 边界、空坐标 {}、缺 y、null；边两端 null、空串、不存在、相等、倒序；distanceM 负、null、0；openness 2；juris rank 缺、1.5；always 五列逐列缺、非族条目、forestCover 1.5、hiddenness −1 与 null、waterAccess 空集过。空表不核"恰一根"：主会话已记到 6-24 必过项（只核第 1 条有条件可接受）|
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 前提全在测试里造；期望手算：坐标边界 17.8412 过/17.8413 拒（314159264×178412²=9 999 953 814 795 516 416 ≤ 10¹⁹ < …×178413²），父 1 m2 时 0.5641 过/0.5642 拒；最短路 20<25 与四级并列、0.1+0.2=0.3、ascentM ±5、400+601>1000 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 第一轮的冻结对象成员（CODE.unbuiltRead、FAMILY.relation、JURIS.family）已全部撤掉：错误码改 `codeOf(e) === E.E_MOD_RX`（同 ledger.mjs:330）；族名改 `T.vocab_family.relation`、`T.vocab_family.juris`（markers.mjs VOCAB_FAMILIES 照卷二 :288 补两名，主会话授权）；通配段 GRAMMAR_TOKENS.wildcard |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 对合并基共 18 文件 +3103/−49（不计只核文），其中勘误前快照 1803 行、现行快照 9 行、criteria.json 重盖指纹 +102/−34。卡文外：_units.json（m、m2）、kernel/files.json、material.test.mjs（只改装配）；第二轮经授权：markers.mjs、markers.test.mjs:78、tools/accept/criteria.json（register.mjs 重盖）、卷五正文与两份快照（勘误 1119k2）|
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 822 pass 822 fail 0；`node tools/accept/run.mjs pre_commit`：verdict pass（失败项 A12-4.5、S12-2、S12-3 与 master 相同）|
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 世界有了"地方"一层：6-24 有齐全的 always 列表头与树、坐标、边校验可灌九省 31 郡，6-6/6-8/6-27 有 placeView、routeView 与唯一距离算法可读；未建派生按登记未知带出，不编值 |

## 做了什么

- `place.json`：表头 parent、coord、areaM2、elevationM、skyExposure、aperture、ledgerHolder、regionLevel、terrain、waterAccess、forestCover、hiddenness、accessClass；派生 enclosed、surfaceRefElevationM、depthM、underground；`edgeStruct`（from、to、distanceM、waterway、openness）与空 `edges`、空 rows。
- `_vocab.json`：terrain 族（封闭，卷二 :1760 十项，条目字段 paceFactor/roughness/coverScore 无数据未填）、water 族、access 族、juris 族（三族本卷 §2.2 所有，条目归 6-24）；relation 族三行（via/inputs 已随勘误写 `created.*.props.parent`）；comp_enclosure、comp_region。
- `_unbuilt-derived.json`：enclosed、surfaceRefElevationM、depthM 未建（缺 first、带关系的 exists/nearest）。
- `kernel/place.mjs`：placeView、routeView、三关系实现、checkPlaceTable（单根、到根、面积和、坐标包含、边节、juris rank）。`kernel/reverse-index.mjs`：reverseLookup。
- 勘误 1119k2：卷五 §4.1.2 :397、:405–:407 共 7 处 `created.*.parent` 改 `created.*.props.parent`；附录修订表加一行；改前快照 版本快照/卷五-v11-勘误前-1119k2.md 与 origin/master 正文同一 blob（acb1272f），改后 版本快照/卷五-v11.md 与正文 cmp 一致；不升版本、历史行不改。

## 自定裁定

1. 边节字段定义放表头 `edgeStruct`，数据放 `edges` 列表（卷二 §5.6 只说"表内 edges 节"）。
2. 边节暂只登 from、to、distanceM、waterway、openness；terrainMix、requirement、speedFactor 未登（terrain 条目字段无数据、requirementBlock 未建、§4.10 归 6-27），routeView 对它们与 bearingDeg 按未知带出。
3. idPrefix `loc_ bld_`（卷二 :287）；behaviors `contain`、`route`。
4. 数值精度一律 4；coord 取值域不设界。
5. 反查关系 via 写 `{index, field}`。
6. rel_residents 只算未关闭（terms.until 为 null）的常住边。
7. 面积和里每个子地点都计入（underground 未建，只严不松）。
8. 最短路：较小端起非负权最短路、标签全序、按调用方向倒写。
9. 坐标包含不开方：比 π·(dx²+dy²) ≤ areaM2，π 取 atan 表 x=1 的 π/4 连加四次（10⁸ 标度），全程 BigInt；coord 缺 x 或 y 报 E-DIM-STRUCT-FIELD，不按 0 顶替。
10. waterAccess 的 set 取值域写 `{}`（卷文"—"，不设条数上限）；access、water、juris 三族先建空族，条目与行一起归 6-24；terrain 十条按卷二写全。
11. K6-29：`place` 是卷一模板名，现有闭集已可解析。

## 偏离

- 第一轮测试与实现同批写成，没有先红后绿。
- 第一轮的关系族行形状加载检查已删（会拒收夹具 `rel_part: {}`），未建。
- 第二轮重盖判据指纹时，生成登记器输入的脚本（F:/dnd-tmp/b67-crit.mjs）把 stdout 丢到 /dev/null；输入文件由脚本写（卡头允许的登记器输入写法）。17 个判据类 rev 各加一，修订记录同一句（markers.mjs 补族名致检测器 import 闭包变）。

## 未决

1. 关系族行形状加载检查（字段封闭、intimate 逐行）未建；要建须同时修正 tests/kernel/dims 与 fixture.mjs 的 `rel_part`。
2. relation:<rel_id> 节点未经 declareInputs 登记，依赖闭包仍空（勘误后 inputs 路径已对）。
3. 块 5 遗留 9（地点真类别行）未做，挂 6-24/卷十九首卡。
4. 主会话已记的附条件项：空表不查一根、未建派生排卡、K6-42 写者（6-24/6-27 必过）。
