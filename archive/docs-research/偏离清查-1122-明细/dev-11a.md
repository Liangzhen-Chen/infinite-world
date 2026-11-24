共 6 条，甲 0 乙 5 丙 1，有理由 1 无理由 5。
本卡读到的范围：卷二十七 :525–605、:720–775（全读指定段）；卷二 :936–1005、:1120–1149、:1178–1202（其余靠 Grep 定位 DigestCap :1034、:1040、:1128、:1181、:1192；:1006–1119、:1150–1177、:1203–1330 未读）。代码：kernel/save.mjs 全 1–716、kernel/save-session.mjs 全 1–62、kernel/load/save.mjs 全 1–404；另读 kernel/storage.mjs :520–556、transaction.mjs :235–250、events.mjs :490–530、scheduler.mjs :229–240/:637、menu-entry.mjs 仅 Grep、registry.json :77–86、save-layout.json 全、digest-exclude.json 全、host.json 仅 Grep；kernel/ 内 crypto 仅 Grep。未读：上面列出的卷二未读段、storage.mjs 其余、其他 kernel 文件。

### 1 日志保留只裁快照，R27-4.12 折叠与 logKeep 两键都没做
- 位置：server-plugin/kernel/save.mjs:500、:505–522；world/rules/tables/save-layout.json:3–23；world/rules/registry.json:81
- 设计原文：卷二十七 :561 "保留最近 `keepSnapshots` 个快照及其后的日志段；更早的日志段不整段删除，在同一快照点按 R27-4.12 折叠"；:564–569 R27-4.12 全文
- 代码实际：`tickEnd` 只 `book.snapshots.shift()` 裁快照，`book.segments` 永不折叠、不回收；注释写"折叠归 R27-4.12，不在本卡"；`save-layout.json` 与 `registry.json` 的 saveLayout 都没有 `logKeepSig`、`logKeepVerbRoles`（§2.2 :172–173 登记、§4.4.5 :593 首条数据行 `["roles.verbs.genesis"]`）。
- 理由：无（仅注释自述，save.mjs:500）
- 影响：规则缺（存档里的日志段无界增长；保留档以上投影的折叠断言 A27-4.8 无从成立）
- 严重程度：乙
- 合并：无

### 2 复演一开始就把全部追加段可见，没有按事件挂载与摘要比对
- 位置：server-plugin/kernel/load/save.mjs:310
- 设计原文：卷二十七 :740 "两种复演走到'世界追加了一个包'事件时才挂上该追加段（R27-4.2），在此之前该段不可见；挂上时以事件载荷里的追加段摘要比对所挂之段，不符即 E-REPLAY-DIVERGE"
- 代码实际：`restore` 把 `loaded.doc.doc_data`（含全部 `appends`）整份交给候选世界，重跑全程可见；没有"追加包事件处挂载"、没有载荷摘要比对。
- 理由：无（6-20 只核只要求改用存档里的 doc_data，未涉挂载时机）
- 影响：规则缺（装了扩展包的世界复演语义错；块 6 无包，暂不触发）
- 严重程度：乙
- 合并：无

### 3 Sealed 按 base64 字串进内存，与"内存 Uint8Array、存档才 base64"不符
- 位置：server-plugin/kernel/save.mjs:172–175；server-plugin/kernel/load/save.mjs:130–133；server-plugin/kernel/storage.mjs:528–530
- 设计原文：卷二 :1181 "内存形态 `{bytes: Uint8Array（冻结副本）, digest: Digest}`……**存档序列化**为 `{"$sealed": 1, "bytes": "<base64>", "digest": "<64 位十六进制>"}`，由 kernel 的 `encodeSealed/decodeSealed` 负责"
- 代码实际：`isSealedValue` 要求 `bytes` 是字符串；`encodeSealedValue` 原样写 `v.bytes`（不编码），`decodeSealedValue` 原样还回字符串——把存档形态当成了内存形态。
- 理由：无
- 影响：数据错（一旦 kernelApi `makeSealed` 按卷二交出 Uint8Array，写档会 `canonical` 拒收；现无 Sealed 生产者故未触发）
- 严重程度：乙
- 合并：无（公共部件审查-乙未列 Sealed）

### 4 part_by_chunk 只认 cells，拒收 fieldCells
- 位置：server-plugin/kernel/save.mjs:44、:317–322
- 设计原文：卷二十七 :555 "只用于第二、三段是格空间号与里块号的状态路径，即格差分 `cells.<w>.<chunk>.<cellKey>`……与现场泡内细格上的场增量 `fieldCells.<w>.<里块>.<格键>`"
- 代码实际：`GRID_KEY = markersOf('grid_diff_key', ['cells'])`；`compileLayout` 的 part_by_chunk 校验要求 `segs[0] === GRID_KEY.cells`，`fieldCells.<w>.<里块>.<格键>` 行直接 E-SAVE-SHARD-UNCOVERED。`grid_diff_key` 亦未在卷二 §1.9 登记。
- 理由：无（ds-g1-pos.md:77 只移交 cells 的分片行，未提单这条拒收）
- 影响：规则缺（卷二十 :459 的场增量一旦登记 pathTypes，存档加载即失败）
- 严重程度：乙
- 合并：无

### 5 导入长度上限量的是重新序列化后的字节，可按原始字节绕过
- 位置：server-plugin/kernel/load/save.mjs:392–393
- 设计原文：卷二 :959 "请求体总长不得超过 `rules.host.saveImportMaxBytes`（单位 `byte`）"；卷二 :996 "先核对长度与槽位编号"
- 代码实际：`const whole = JSON.stringify(body)` 后量 `utf8Length(whole)`；宿主已解析请求体，量不到原始字节。原始请求若带空白/缩进，重新序列化后会变小，超长请求可混过。
- 理由：见 docs/问题.md:320（已登记，归 6-21 宿主层在解析前限原始字节）
- 影响：规则缺（限额可绕过，暂无人利用）
- 严重程度：乙
- 合并：无

### 6 读档/导入的校验顺序与卷二 §2.9 第 0 条第 5 点相反
- 位置：server-plugin/kernel/load/save.mjs:365–367；:394–395
- 设计原文：卷二 :996 "先核对长度与槽位编号……再经 `narrow` 按存档 schema 收窄，重算各 `Sealed` 的摘要，做卷二十七 R27-4.3 的规则指纹比较"
- 代码实际：导入先核长度、再核形状（含 `bytes` 类型）、最后核槽位；`checkBundle` 先比 `rulesDigest`，后由 `assemble` 重算 Sealed 摘要。两处都把卷文列在后的那步提前。
- 理由：无（仅注释与 6-20 回报自述"已定"）
- 影响：只是形式（多项同时不过时报哪个拒收码不同，判定结论不变）
- 严重程度：丙
- 合并：无

## 已登记未建
- **世界分片表 `shards` 的类型与数据行**：`registry.json:81` 的 saveLayout 只有三键，`save-layout.json` 无 `shards`；`compileLayout` 在开局装会话时按未覆盖拒。登记：docs/卡回报/ds-b6-20.md:49、docs/审查/6-20-Opus只核-1120.md:36（归 6-16）；ds-g1-pos.md:77（cells 分片行随建表卡）。卷二十七 :168 登记该键、:552–556 给分片规则。
- **带"只追加"标记的状态路径按段分片**：代码 save.mjs:331 一律按未覆盖拒。卷二十七 :969、:1102 明写"只追加"标记与分片登记"仍开放"；:554、:587 要求可用。
- **`replay_verify`**：仓库无此入口，读档内只有 `replay_apply`。登记：docs/迁移体检/块2.md:37 K2-21"随块 4 补验"；卷二十七 :734、:770。
- **生产接线**：`installSaveEnv`、`setGame`、`saveAction`、`loadAction`、`autoLoadSlot` 无生产调用者，menu 未分流（`menu-entry.mjs` 57 行内无存读）。登记：docs/卡回报/ds-b6-20.md:51–52；docs/迁移体检/块6.md:101 K6-84（6-20）；合并：docs/研究/公共部件审查-乙-1122.md:32。
- **`rulesDigest` 的合成算法**：现由存档环境交入，无出处。登记：docs/卡回报/ds-b6-20.md:48（归 6-16）；卷二十七 R27-4.3 :549。

## 拿不准
- **封段与快照的"每 N 条"是否要按倍数切分**：卷二十七 :551"每 `segmentEvents` 条封成一段；每 `snapshotEveryEvents` 条事件做一次快照"，代码在刻末把全部未封条目封成一段、只做一个快照（tests/kernel/save.test.mjs:517 期望 `segmentEvents=2` 时段长 [3,5,4]）。若"每 N 条"应切出多个整段，代码与之不符；若指"刻末一到就封/照"，代码正确。卷文未明确，不判。

## 跨卷待判
- **存档摘要是否含 `doc_data`**：卷二十七 R27-4.1 :542 说存档摘要对逻辑文档五部分计算（含世界数据副本）；卷一 §8.3 的"进哈希"清单未列世界数据副本。代码照卷二十七（save.mjs:205–216 含 doc_data）。docs/审查/卷二十七-终核.md:53 已记"留给卷一收口对齐"。
- **追加包后 `dataDigest`/`rulesDigest` 重算**：卷二十七 R27-4.2 :548 要求追加提交时按新范围重算并由它合成 `rulesDigest`；代码每次存档重算 `dataDigest`，但 `rulesDigest` 来自交入的固定值，装包流程未建（卷二十八 §4.6、R28-6.6/C28-5）。
- **折叠与卷二十二 R22-12.1**：卷二十七 :871 已登记"离开时刻会被折叠并掉"的配合请求；本卡第 1 条说折叠未做，故该跨卷问题暂时不显现，做折叠时须一并处理。
