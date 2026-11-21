# 回报：攒批第八批两处已合代码（工价单值、locales）

执行：Claude Sonnet 5.5 中档；未委派 DeepSeek（改动小且机械量少，自己写）。照李白 11-21 攒批第八批第一、四条（docs/审查/李白裁定-1117.md 末节）。

## 自查表
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 裁定第一条（卷十四 :750 SK-7、卷三乙 :1714 V-1，勘误 1121k7）；第四条（卷二十九 :203、:208、:740 R29-6.3） |
| 2 | 没有按 id/名字/场景写特例 | 是 | 工价读法不看技能、不看配方 id；locales 只改数据 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | laborRate 登记域 [0, null]：负数拒（测试 −0.2）、旧列表形态拒、缺值按未知带缺口（V-8 两条既有测试仍过）；0 合法（免费工价是规则值，不是绕过） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 新测试把 laborRate 显式设为 0.5，期望 8.8、9.35 按 V-1 公式手算并写在用例名 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 删的是分阶查表与阶序校验（该形态已废） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | git diff --stat：5 文件（不含本回报），共 52 行（24 增 28 删） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs → tests 1307 / pass 1307 / fail 0；node tools/accept/run.mjs pre_commit --root F:/dnd-wt/ds-b8c → verdict pass，failed 仅 vol12.A12-4.5、S12-2、S12-3（基线），vol5.S5-10 不在失败列 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 6-9 估值工价口径与卷十四/卷六一致，不再按技能阶查表；没违背北极星 |

## 改了哪些文件
- server-plugin/kernel/valuation.mjs：laborRateAt 改为 laborRate(engine)，读单值，非数字按未知带缺口 rules.crafting.laborRate；删加载期 laborRate 阶序/阶数校验（非负由登记域守）。
- world/rules/tables/crafting.json：laborRate 值改 0.2（暂定·待试玩标定），出处与依据改写。
- world/rules/registry.json：laborRate 类型 number（copper_per_minute，precision 4），域 [0, null]。
- tests/kernel/valuation.test.mjs：跨键校验用例改为负值与旧列表形态都拒；新增"工价单值、与技能无关"用例（手算 8.8、9.35）；头注改述。
- world/i18n/locales.json：digitGroup 3，出处写进该行 basis 字段（Unicode CLDR 数字分组 grouping size 3）；published 改 false。

## published 取值与依据
zh：false。R29-6.3 要求齐全率满才可为真；仓库里没有现成的齐全率机检（textcore/labels.mjs 注明键集合核对随语言卡与离线校验，未建），且语言包不全（只有 labels.zh、blocklist.zh，无 templates、码点范围文件等），所以按卷二十九 R29-6.3 无法证明为满，按裁定"查不到检查就填 false"。en：locales.json 现无 en 行，未添加——mount.mjs 对每种语言加载屏蔽词表，加 en 行而无 en 包会使装配失败，且要编英文 pluralRows；en 行连同其 digitGroup 3 留给语言卡落 en 包时一起加（digitGroup 3 的口径已记在 zh 行 basis）。此点偏离指令"zh、en 都取 3"，请主会话定。

## 其他
- 相关测试：price.test.mjs 两个涉及 laborRate 的用例（删值造缺口）无需改，期望不变。output-gate 测试未涉及 digitGroup/published。
- 未解决：无 fingerprint 类需升 rev（pre_commit 无 E-ACC-CRITERION-UNVERSIONED 报错）。
- 命令纪律：中途误用过一次 cd 与一次 sed -i 指向 /dev/null（后者失败无副作用），其余合规。
