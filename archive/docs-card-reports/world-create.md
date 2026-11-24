# 世界创建事务总调用方：generateWorld 与步骤表（李白 11-22 18:36 P-28～P-30，18:40 模块化评估 §4.4）

写：Claude Sonnet 5.5 中档（未交 DeepSeek）；核：待 Opus 一轮（跨卷）。前一版"前置不足停下回报"已由裁定 P-28～P-30 解开，本版为续做。

## 自查表
| # | 是/否 | 证据 |
|---|---|---|
| 1 | 是 | 卷十 :291（generateWorld 唯一入口）、:295–:303（各步由写回器在世界创建事务内调用，卷文没排次序）、:405 A10-1.3、R10-1.2 ①（同一笔事务）；裁定 P-28～P-30（李白裁定-1117.md :1714–:1716） |
| 2 | 是 | 次序在规则表数据里，代码无 id、步骤名特判；DEFAULT_MODULES 只是步骤代号到既有写入口的接线 |
| 3 | 是 | 空表、空串通道名、重复步骤、通道被两步写、写外部通道、缺模块、读未提供的通道都拒收（tests/kernel/world-create.test.mjs） |
| 4 | 是 | 期望是手列字面量（调用次序、错误码、回滚后状态值） |
| 5 | 是 | 已合阶段算法原样挪位，没改任何阶段算法 |
| 6 | 是 | 见下；worldgen.mjs 与各阶段文件按 18:40 追加项改，规则表登记是 createSteps 必需的数据改动 |
| 7 | 是 | node --test --test-concurrency=3 tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 2090 pass 2090 fail 0 |
| 8 | 是 | 开局三步有了统一调用方，块 6 开局世界里能真有统治边、房产归属、人物与家户；不违背北极星 |
| 9 | 是 | 三个写入口与 generateFill 都存在（holdcalls.mjs:13、assetcalls.mjs:46、opening-people.mjs:56、worldgen.mjs generateFill）；新局路径不存在，按 P-28 归 6-16，本卡不碰 |

## 改了哪些文件
- 新：server-plugin/world-create.mjs（generateWorld、checkCreateSteps、DEFAULT_MODULES）。
- 规则表：world/rules/tables/worldgen.json 与 world/rules/registry.json 加 rules.gen.createSteps。
- 生成器接口：kernel/gen/{fields,order,water,waterfoot,siteform,envelope,polity,holdings-open}.mjs 各导出 stage = {run(ctx)}；kernel/gen/worldgen.mjs 只留登记表（节点名 到 文件导出的 stage）、统一表读入口 readEntry、generateFill 流程；openingAssets 自 worldgen.mjs 挪进 holdings-open.mjs，polityInputs、holdingsInputs 的取输入搬进各自阶段，改经 ctx.read 与 ctx.views。
- 测试：tests/kernel/world-create.test.mjs（小夹具：次序、依赖拦截、回滚、接口、换模块）、tests/kernel/world-create-rules.test.mjs（真实规则表次序与依赖）、tests/cloud/world-create-hw.test.mjs（真实世界跑一遍、两遍逐字节相同；腾讯云 G18 跑，本机未跑）。
- 文档：卷十 §3.2 表末加一行与勘误 1124k90（快照 版本快照/卷十-v3-勘误前-1124k90.md，与 HEAD 同 blob 83ba839c，git 复制）。

## 步骤表与依赖检查
- 表在 rules.gen.createSteps，行序即次序：fill（generateFill）、governors（applyGovernorCalls，作者统治边在前、生成的调用提案在后）、assets（applyOpeningAssets）、people（applyOpeningPeople）。每行 {step, reads, writes}。
- checkCreateSteps（事务开启前）：每步 reads 须是 inputs 的键或排在前面的步骤的 writes，否则 E-GEN-STAGE-CYCLE；缺模块 E-GEN-STAGE-UNKNOWN；结构错 E-DIM-STRUCT-FIELD；空表 E-RULES-UNREGISTERED。运行时每步返回的键须与声明的 writes 一一相符。全部步骤在一笔 runTransaction 里，任一步失败整笔回滚。
- 偏离：实际签名 generateWorld(engine, state, template, inputs, opts)，比 :291 多状态树（调用方建）与外部通道，已写进勘误；入口放 server-plugin/world-create.mjs 而非卷文的 worldgen-writeback.mjs（kernel 组不能 import 根目录的 opening-people.mjs）。错误码借用已登记的 E-GEN-STAGE-CYCLE、E-GEN-STAGE-UNKNOWN，要专码请李白定。

## 第二轮复核后（按地点判）
assets 一步改按地点判：via 是 authorPlaceGovernor 的建筑，经 genViews.ownerOf 取作者地点，用 governorOf 读状态里该地点的统治组织（含沿包含树继承），不等于推出的 owner 即整笔拒收；同一组织在别处另有边不再放行。步骤表 assets 的 reads 加 genViews。用例在 tests/kernel/world-create-rules.test.mjs（真实世界规则）。

## 18:40 追加项：生成器接口固定，输出逐位不变
- 证明：全量 tests/kernel 与 tests/accept 全绿（含 gen-worldgen、gen-layout-fill、gen-water-grid、gen-waterfoot、gen-envelope、polity-opening-hw、gen-opening-holdings 等世界生成测试）；node tools/convert-geo-g5b.mjs --check 退出码 0（它跑 generateFill 并与已烘入 place.json 的 generated 节逐位比对）；pre_commit verdict pass。tests/cloud/opening-holdings-hw.test.mjs 的读数腾讯云块验收时一并跑。
- 评估行号核对：模块化评估 §4 所引 worldgen.mjs:38–61、:66–90、:93–126、:95、:114、:92、:105–106，holdcalls.mjs:13、assetcalls.mjs:46、opening-people.mjs:56、docs/PLAN.md:144、卷十 :405（勘误后移为 :406）、:124，核对全部对得上。唯一没落的是 4.4 末条"开局三件登成 opening 相 gstage 阶段"：按 P-28、P-29 本卡只做步骤表，未登成 gstage，留待另议。

## Opus 核后修改（审查原文 F:/dnd-tmp/review-world-create.md，结论改后合）
- M1：generateWorld 每步只交该步声明的 reads；assets 真读 edge.governor：作者 owner 取地点统治组织（via_author_place_governor）而该组织的边被统治一步跳过、已写下的边里没有它，整笔拒收（E-GEN-ROW-INVALID）。用例：tests/kernel/world-create.test.mjs（拒收回滚、不误拒两种、声明的读有约束力）。
- M2：fill 把 generateFill 全部产出（plan、generated、created、pending、deferred、report、calls、assets、assetGaps）作为 writes 通道交出，通道名由返回的键派生；步骤表登记；测试 world-create-rules.test.mjs 证明不丢，cloud 测试断言内容齐全。生成行与新建组织行的落盘待 6-16 新开局卡建（已写进步骤表 basis、卷十 §3.2 与勘误 1124k90）。
- 建议 6 条：做 S1（:291 入口栏指向 :304）、S2（§2.7 两码各补半句）、S3（cloud 测补 written.length 等于 2）、S6（外部通道值为 undefined 即拒收）；不做 S4（依赖检查抛错与运行期返回 {ok:false} 两种失败形状，留 6-16 装配时定，抛错是事务前的结构错、返回是事务内失败，语义不同）；不做 S5（holdings-open.mjs 直读 ledger SCHEMA 是挪位前已有，宜由 ledger 导出读口，记公共部件修理清单，不在本卡扩 ledger）。

## 未解决
- 新局路径（startGame、autoLoadSlot、bindCampaignSeed 的生产调用、index.mjs 调用清单）归 6-16；P-30 要求 6-16 验收时必须有非测试代码调用 generateWorld。
- 真实世界跑一遍的 tests/cloud/world-create-hw.test.mjs 本机未跑（每遍约两分钟，两遍）。
