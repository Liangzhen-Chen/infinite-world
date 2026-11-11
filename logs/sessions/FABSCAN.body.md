# FABSCAN：W3 正文按整件判"骨架外编造的具体"只读排查（李白 11-11 定，零花费）

## 背景
李白定：评分按整件作品判编造，删掉已发布正文里的骨架外编造，整类处理、不逐条特判；接受分数先降，门槛 4 不放宽。
新细则下评分者已指出一批编造，例如：
- 罂粟籽：籽粒形状、颜色、气味；
- 乳酪饼：烙斑、酪片遇热变软；
- 黄铜腕圈：圈身窄而匀、内壁锉痕；
- 五个配方：火色回炉、逆纹崩口、脚长比对、晾干与指痕、验收动作等。
这些正文之前都过了 L4，说明需要整类重读。

## 任务
读你那一份条目的已发布正文，逐条列出骨架外编造的具体细节。
- id 列表：F:/dnd-tmp/fab-ids-<N>.json，元素是 {line, kind, id}。
- 正文：物品在 F:/dnd-wt/M27/world/meta/items.json 的 description、inspection、storage；配方在 recipes.json 的 process。

骨架怎么查（只读，在 F:/dnd-wt/M27）：
- 物品骨架是 economyW3 / economyW3Journey / economyW3Trades(world).items 的对应条目，含 use、weight、shelfLifeDays、origin、seasonality、acquisition，以及派生事实 `physical`（体积、尺寸档、带出处的材料外观、工序步骤、形制短语）。
- 配方骨架是各自 recipes 的条目，含 materials、tools、minutes、workstation、processFacts、byproducts。
- 引用事实是 w3Context / journeyContext 给的世界事实。
- 看 physical：`node --import file:///F:/temp/claude/066df71e3594f148/91a2ffab-45cc-4033-adab-94b22866f267/scratchpad/nonet.mjs F:/dnd-tmp/j2w/phys.mjs` 只打印少数几件；需要别的条目，复制这个脚本自己改 id，只读。

判定口径（整件判，L4 必查清单第 1、5、8、9、12–15 条）：
- 编造：正文里的具体细节（颜色、形状、气味、纹理、尺寸、数量、加工动作、火候判断、检验动作、失败返工、手感），在骨架、physical、配方、引用事实里都找不到出处的。
- 不算编造：
  - 骨架事实的同义转述，不加程度、位置、数量；
  - 由骨架必然推出的；
  - 工序中由配方工具和材料直接构成的动作（L4 清单第 12、13 条）；
  - 配方原话的照写。
- "推广配方原话"算编造，例如配方写"削平凸棱"，正文写"通体无棱"。
- 只列编造，不评文笔好坏。

## 输出
F:/dnd-tmp/fab-<N>.json，数组，每条 {id, kind, field, span, reason}：
- span 必须是正文原文片段，逐字；
- reason 写骨架里没有什么。
没有编造的条目不列。另在文件末尾的总结里写：本份共读多少条、有编造的多少条、编造片段多少处。

## 红线
只读：不改任何文件，不提交，不跑任何测试，不调模型。

## 汇报（150 字内）
读了多少条；有编造的条目数；编造片段数；最常见的三类编造。
