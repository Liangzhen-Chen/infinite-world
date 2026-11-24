# 补值卡 B 回报：李白 11-19 18:1x ②⑤（环境温度域取真实极值、太原降水 lognormal 对 gamma）

## 交卷前自查
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷三乙 :1469（T-13）、:2125（Q-30）；卷二十 §2.9 :396；裁定 docs/审查/李白裁定-1117.md :1347–:1362 ②⑤ |
| 2 | 没有按 id/名字/场景写特例 | 是 | 域值写规则表一行、原型极值挂原型行；物态读法 kernel/item.mjs 未改，按区间公式对任意材料读 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 域缺失时整件按未知带出的用例仍在（tests/kernel/item.test.mjs「环境温度域没给」，夹具改为真去掉该行） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | env-temp-domain.test.mjs 期望按 T-13 区间公式对真实材料温度点手算（水 0/100、米酒 −5/90、蜂蜡熔点 63、橡木只有分解点）；极值断言取 WMO 页面原文值 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无此类改动 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 约 150 行（含新测试与回报），见「改动清单」 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1003 / pass 1003 / fail 0（含本卡 2 个新用例）；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 物品物态、密度、体积不再全读未知（尺寸档仍等 6-22 的 rules.items.sizeClasses），未违背北极星 |

## ② 环境温度域

**全局域（WMO 官方页面原文，取用日期 2026-11-19，WebFetch 读到页面原文）**
- 下限 −89.2 ℃：https://wmo.int/asu-map?map=Temp_020 ，页标题 "Global; Southern Hemisphere; Eastern Hemisphere; Antarctica: Lowest Temperature"，值 "-89.2°C (-128.6°F)"，地点 Vostok, Antarctica [77°32'S; 106°40'E; 3420 m]，记录日期 21-Jul-1983。
- 上限 56.7 ℃：https://wmo.int/asu-map?map=Temp_001 ，页标题 "Global; Western Hemisphere; Northern Hemisphere; WMO Region IV (North America): Highest Temperature"，值 "56.7°C (134°F)"，Furnace Creek Ranch, CA, USA [36°27'N; 116°51'W; -54.6 m]，记录日期 10-Jul-1913。
- 入口页 https://wmo.int/site/world-weather-and-climate-extremes-archive 给的是 PDF 表（Table_Records_25Jul2025.pdf），PDF 读不出文本（压缩流），改读同一档案的 asu-map 记录页；未取任何二手数字。注：WebFetch 工具自己把该 PDF 缓存到了会话工具目录，不是我下载，未入仓库。

**原型极值（太原，GHCN-Daily CHM00053772，1991–2020）**：日 TMAX 最大 39.4 ℃（2010-07-30），日 TMIN 最小 −23.3 ℃（2002-12-27）。只用年缺测 ≤ 10% 的年份：TMAX、TMIN 各 22 年（1991–2012），2013–2020 年缺测 26%–99.5%（TMAX）、31%–50%（TMIN）不用；无质检标志日；是日极值不是瞬时极值。脚本 F:/dnd-tmp/b6fb-ext.mjs。

**改动清单**
- world/rules/tables/climate.json：新增 envTempDomain 行 {min −89.2, max 56.7}（出处、取用日期写在行内），从 unbuilt 删去。
- world/rules/registry.json：climateProto 行类型加必填 tempExtremeC {min,max}；climate 的 volume 说明更新。
- world/rules/tables/climate-proto.json：cpr_taiyuan 加 tempExtremeC {min −23.3, max 39.4}，basis 写口径。
- world/ontology/dimensions/_unbuilt-derived.json：possibleMatterStates 的 missing 去掉 constant。
- kernel/item.mjs 未改：读口早已按 rules.climate.envTempDomain 读，只接了数据。
- tests/kernel/item-world.mjs：夹具"域没给"改为从真世界删去该行并登回 unbuilt（真世界现已有值）。
- tests/kernel/env-temp-domain.test.mjs（新）：全局域值、原型极值在域内、真实材料可能物态集手算。

**读出效果**：mat_water、mat_rice_wine 读固液；mat_beeswax（熔点 63 > 56.7）、mat_oak（只有分解点）、mat_cast_iron 读固。物品行数据现有 0 行（item 表只有表头），所以物品级读出由夹具世界测（已有用例）；尺寸档仍未知，因 rules.items.sizeClasses 归 6-22。

## 自定裁定
1. 全局一份、原型各自一份：物品读全局域。依据卷三乙 :1469 "加载期求一次，不随时刻、地点变"，可能物态集不能随地点变；原型实测极值只作各地数据挂在原型行，现无读者（A12-4.5 参数消费检查在基线本就报 fail，见下，且 pre_commit verdict 仍 pass）。
2. 不取"原型极值作为物品域"：会让同一物品在不同地区类别不同，违反 T-13 与 M-9 单一来源。
3. 极值用日极值（GHCN-Daily 只有日值），写明不是瞬时极值。

## ⑤ 太原降水：lognormal 对 gamma（只比较，未改数据）

按 6-29 回报的同一口径（逐相位月，状态概率取内核权重精确递推、乘该状态截断期望降水；实测取 23 年有日降水值的日均 × 365.24219/12）：gamma 矩匹配 α = x̄²/s²、θ = s²/x̄，clamp 同取观测最小最大（脚本 F:/dnd-tmp/b6fb-precip.mjs）。

| 相位月 | 实测 mm | lognormal | 误差 | gamma | 误差 |
|---|---|---|---|---|---|
| 0 | 18.24 | 24.47 | +34.2% | 24.99 | +37.0% |
| 1 | 25.39 | 33.28 | +31.1% | 33.96 | +33.8% |
| 2 | 36.75 | 48.26 | +31.3% | 49.21 | +33.9% |
| 3 | 87.51 | 76.23 | −12.9% | 77.71 | −11.2% |
| 4 | 107.90 | 76.78 | −28.8% | 78.29 | −27.4% |
| 5 | 74.57 | 62.78 | −15.8% | 64.07 | −14.1% |
| 6 | 40.81 | 45.56 | +11.6% | 46.51 | +14.0% |
| 7 | 17.82 | 21.61 | +21.3% | 22.07 | +23.8% |
| 8 | 4.06 | 6.77 | +67.0% | 6.92 | +70.5% |
| 9 | 4.37 | 4.55 | +4.2% | 4.64 | +6.3% |
| 10 | 2.97 | 6.11 | +105.6% | 6.24 | +110.0% |
| 11 | 9.21 | 12.39 | +34.5% | 12.65 | +37.3% |
| 全年 | 429.59 | 418.79（−2.5%） | | 427.25（−0.5%） | |

结论：两者都仍 > 15%，且差别不大（gamma 在夏三个相位月稍好、春秋稍差）。原因不在分布族：两者都按各状态均值匹配，每个状态只有一条全年的降水量分布，逐月误差来自"同一状态全年同均值、而实际夏季雨日量大、春秋雨日量小"。换 gamma 治不了。按李白 ⑤ "两者都仍 > 15% 再报"，**停下报主会话**：未实现 gamma 采样，卷二 §1.10 与 weather.json 未动（也就没有勘误号占用，1119k10 未用）。要逐月准，需要降水量分布按季节变（例如按太阳相位月给均值调制，类似季节曲线），是新设计，等李白定。

## 偏离与未解决
- 收尾（主会话追加授权）：docs/问题.md 环境温度域三条已改为"已由补值卡 B 落实"；卷二十勘误 1119k10 已做（§2.9 :397 登记 envTempDomain 与原型 tempExtremeC 字段说明，附录第 45 行，改前快照 版本快照/卷二十-v10-勘误前-1119k10.md 取合并后最新正文，改后 cmp 覆盖 版本快照/卷二十-v10.md，不升版本）。自定裁定：tempExtremeC 数据行保留——A12-4.5 在基线本就 fail 且本卡前后失败集不变、verdict 仍 pass，故未撤数据行。
- 本分支已合 origin/master；合后全量 tests 1003 / pass 1003 / fail 0。
- 基线 pre_commit 的 A12-4.5、S12-2、S12-3 三项 fail 与本卡无关（在未改的 HEAD 上同样 fail），verdict 仍 pass。
