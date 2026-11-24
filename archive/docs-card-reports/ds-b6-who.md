## 自查表

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | life.json 各行 source：卷四 :306、:307、:639、:640、:374、:654–:659、:1462；李白裁定-1117.md :1401 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只写规则表数据与词表条目字段，life.mjs 未改 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 未新增校验；E-LIFE-STAGES 既有测试保留（空表、首行下界非 0 即抛） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | person.test.mjs 新测试按曲线两点手算 3.675、33.502、70，成熟龄与寿命在测试里造 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无代码改动 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 105 行；另动 _vocab.json（life_stage 条目 adult 字段，建人所需）、registry.json（life 说明改正，按主会话令）与新增本回报；`git diff --cached --shortstat` |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 1145 / pass 1145 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 真实世界阶段表与体重曲线建成，ageYears 路径建人不再被拒；用真实 WHO 数据，未写死岁数；缺的（物种行、示例数）已标待调并报告 |

# ds-b6-who 回报：块 6 数据卡《人类阶段与生长（WHO）》

照：李白 11-19 22:0x 裁定·攒批第六批 ①（docs/审查/李白裁定-1117.md :1401–:1402）；卷四 §2.5 :306–:307、§4.4 L-1 :639、L-2 :640、E-LIFE-STAGES :374、§4.4.5 :654–:666、§7.5 M4-49 :1462。写：Claude Sonnet 中档。

## 做了什么

- `world/rules/tables/life.json`：`stages` 四行与 `growthCurve` 22 点建成并带出处，从 `unbuilt` 删去这两键。
- `world/ontology/dimensions/_vocab.json`：life_stage 四条目补 `adult` 字段（婴儿、少年假，成年、老年真）；`_unbuilt-derived.json` 删去 life_stage.adult 一行（fertile 仍归 6-23）。
- `tests/kernel/person.test.mjs`：真实表头测试改为"已建、ageYears 建人成功、三读数确知"；新增真实世界人类阶段与体重测试（期望值按曲线手算：3.675、33.502、70；阶段界 0.99/1、18.9/19、41/42 岁）。

## 数据口径（读到原文才写）

- 0–5 岁：WHO Child Growth Standards 体重年龄 expanded tables（xlsx，列 M，日龄），男女各一。
- 5–19 岁：WHO 2007 Growth reference 的身高年龄、BMI 年龄 expanded tables（xlsx，列 M，月龄 61–228）；WHO 体重年龄参考只到 10 岁，故体重 = BMI 中位 × 身高中位²（两中位之积不严格等于体重中位）。
- 归一：各性别用自己 19 岁中位体重（男 69.1554、女 57.0373 kg），男女比值逐点平均；x = 年龄 ÷ 19。
- 婴儿界：WHO GHO 指标页「before reaching the age of one」→ 1 ÷ 19 = 0.0526。成熟龄 19：WHO 青少年 10–19 岁界定。
- 逐点（年龄 岁；男 kg；女 kg；均比）：0 3.346 3.232 0.0525；0.25 6.369 5.839 0.0972；0.5 7.939 7.302 0.1214；1 9.646 8.946 0.1482；2 12.155 11.481 0.1885；3 14.344 13.852 0.2251；4 16.349 16.070 0.2591；5 18.335 18.218 0.2923；6 20.579 20.238 0.3262；7 22.945 22.482 0.3630；8 25.488 25.115 0.4044；9 28.204 28.257 0.4516；10 31.215 31.931 0.5056；11 34.694 36.256 0.5687；12 38.968 41.161 0.6426；13 44.396 45.975 0.7240；14 50.607 49.954 0.8038；15 56.450 52.829 0.8712；16 61.267 54.674 0.9222；17 64.867 55.793 0.9581；18 67.353 56.528 0.9825；19 69.155 57.037 1。

## 偏离与未解决（报李白）

1. 真实世界物种表 rows 为空（物种行归 6-23），本卡没有物种行可写：人类 maturityYears **必须为 19**（曲线与婴儿界按它折算），寿命 62 与 infantShare 0.1 迁入无处落地（snapshot-20261010 里没有 balance/population.json，查不到原数）；牲畜、超自然物种同理未做。因此"真实世界能建人类"目前是：阶段与曲线就绪，ageYears 路径不再被拒；还差 6-23 的人类物种行。
2. 按 Sonnet 只核（docs/审查/6-who-Sonnet只核-1119.md）改：foodFactor、sleepFactor 不再用示例数。foodFactor 取 FAO/WHO/UNU 2004 能量需要表（婴儿 1.1538、少年 1.1683、成年 1、老年 0.8448）；sleepFactor 取 AASM 年龄推荐时长中点 ÷ 成人 7 小时（婴儿 2、少年 1.4841、成年 1、老年 1）；算法与网址在 life.json stages 行 basis。只有老年 relAgeMin 0.7 用卷文数标设定数待调。成人 7 小时的原文（Watson 2015）被 PMC 验证码挡住，改读 Sleep Foundation 转述页，未绕过。新增对物种行的前提：人类 sleepHoursPerDay 须为 7、maturityYears 须为 19（归 6-23）。modifiers 全空（婴儿操作、移动折减只是示例，未写）。
3. 卷四勘误 1119k20 未写（出处口径都在表行 basis 里，卷文无需改）；registry.json 里 life 的 volume 过时说明已改正。
4. 工具：为读 xlsx 在 F:/dnd-tmp 写了 xlsx.mjs、curve.mjs（只读 WebFetch 自动存下的文件，输出到终端）；一次误跑了无意义的 sed（对 /dev/null，失败无副作用），自报。
