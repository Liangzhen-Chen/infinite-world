# 补值卡 B 只核（Sonnet 中档，11-19）

对象：分支 ds/b6-fixB，HEAD 24763dea9，相对 origin/master 的 diff。依据：李白 11-19 18:1x ②⑤；卷二十 Q-30、§2.9 :397；卷三乙 :1469、T-13；卷十二 A12-4.5。

**结论：可封。无必须改项。**

## 逐项
1. envTempDomain {−89.2, 56.7}：WebFetch 复读 wmo.int/asu-map?map=Temp_020（Vostok，−89.2°C，21-Jul-1983）与 Temp_001（Furnace Creek Ranch，56.7°C，10-Jul-1913），标题、值、地点、日期与 climate.json 行 basis 一致，无二手数字。
2. 太原 tempExtremeC {−23.3, 39.4}：我独立写 F:/dnd-tmp/b6fb-verify.mjs 重算 1991–2012（年缺测 ≤10%，各 22 年；2013–2020 缺测 26%–99% 被剔），TMAX 最大 39.4（2010-07-30）、TMIN 最小 −23.3（2002-12-27），无质检标志，与写者一致。
3. "物品读全局域"：卷三乙 :1469 原句"加载期求一次，不随时刻、地点变"，成立；kernel/item.mjs:147 读 rules.climate.envTempDomain。测试期望（水 0/100、米酒 −5/90 固液，蜂蜡熔点 63 > 56.7 只固，橡木只有分解点只固）按 T-13 区间公式手算无误，是字面量。
4. tempExtremeC 无读者：A12-4.5 的范围是登记行中键表（keyed）的键（tools/accept/detectors/decl_cmp.mjs:133–143）；climateProto 是行表，tempExtremeC 是行内字段，不在扫描范围，本卡不会新增 A12-4.5 命中；envTempDomain 有读者（item.mjs:27/147）。亲跑 pre_commit：A12-4.5、S12-2、ITEM-COUNT 三项 fail、verdict pass，与回报所述基线一致。局限：未逐符号对比 master 的命中清单（工具只输出码），"集合未变"由上述机理推得而非实测对照。保留数据行不违反"键没有读者"，但它确无读者，basis 已如实写"现无读者"；后续有读者卡接上即可，不构成打回。
5. ⑤：只比较未改数据，卷二 §1.10 与 weather.json 未动（diff 无）；1119k10 用于卷二十 Q-30 登记，附录第 45 行承接 44。快照：卷二十-v10-勘误前-1119k10.md 的 git blob 178680679 与 origin/master 的卷二十正文同一 blob；工作区该文件为 CRLF，去 CR 后与合并点正文逐字节一致，现行快照 卷二十-v10.md 与正文 cmp 相同，不升版本。体例合格。
6. 问题.md 三条（6-2 待报、envTempDomain 缺口两处）改"已落实"如实：域已有值，I-7/8/9 随之生效，rules.items 首批值仍标未建，保留未改。
7. 亲跑 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1003 / pass 1003 / fail 0；pre_commit verdict pass。

## 小备注（不阻塞）
- 写者回报说 WebFetch 缓存了 WMO 的 PDF 到会话目录，未入仓库，无影响。
- 我复核中 pre_commit 输出曾误带重定向被拒，已改管道，未写任何文件进仓库（仅 F:/dnd-tmp 下两个临时脚本）。
