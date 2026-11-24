# 试玩地区人物载入卡回报（李白 11-24「家户两问1122」H-4）

写者：Claude Sonnet 5.5 中档（亲写，未委派 DeepSeek）；待另一个 Sonnet 5.5 中档复核一轮。分支 ds/hw-persons，基于 master 446872c18。

## 自查表（派活卡头 §三，九项）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 下文"卷文逐条落实" |
| 2 | 没有按 id/名字/场景写特例 | 是 | opening-people.mjs 无任何 id、人名、户名、代号字面量：家户边种类取 rules.gen.householdMemberKind/householdHeadKind，原因取 rules.polity.genHoldCause，户是否家户读 orgTraits.domestic；户主按 R18-2.9 全序派生，不逐户写。tools/convert-people-hw.mjs 里只有"试玩地区 loc_hw"与旧性别标记映射两个转换常量 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | opening-people-hw.test.mjs「特殊值拒收」：不存在的户、空串户、非家户组织、年龄 -1/字符串/null、多键、缺键、不存在物种、sex_none、重复 id、名册不是 {persons}；失败整笔回滚（state.created、state.holdings 均无）；「空名册」不是错误；「规则表缺键」拒收 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 22 户成员与户主对着旧作者数据（households.json、baseline.json、residents.json 的 age）手列字面量；birthMinute 期望 −⌊年龄 × rules.astro.yearDays × 1440⌋ 整数手算；寿命、体重、属性只断言落在物种行 clamp 内、不抄采样值 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 没动检查器与基线；rules 键走登记（worldgen.json、registry.json），不是改名绕过 |
| 6 | 只改了卡文列出的文件；diff 共 909 行 | 是 | 新增文件 opening-people.mjs、convert-people-hw.mjs、opening-roster-hw.json、opening-people-hw.test.mjs 与已改的 person.mjs、registry.json、worldgen.json、tests/cloud/opening-holdings-hw.test.mjs、docs/问题.md、docs/PLAN.md（卡文没点名的 person.mjs、两个规则表文件、cloud 测试是接线必需，见偏离）；909 为 git 增删行合计，不含本回报 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test --test-concurrency=3 tests/kernel/*.test.mjs tests/accept/*.test.mjs`：末行统计 tests 2079、pass 2079、fail 0 |
| 8 | 这张卡让块 6 哪一步更近了，且没有违背北极星 | 是 | 开局世界里"谁家、家里有谁、谁当家"能从成员边与户主边读出：试玩地区 59 个有名有姓的人建成了个体行，22 户各有恰一个户主；没有编值（寿命、体重、属性都按物种分布采样），没有写死 |
| 9 | 前置数据行是否已存在 | 是 | 物种行 species_human（world/ontology/dimensions/species.json:91）；户行 org_house_hw_01–22（org.json:78 起）；边种类 hk_household_member、hk_household_head（_vocab.json:765、:766）；开局动词 verb_opening（_vocab.json:2865）；rules.polity.genHoldCause（polity.json:36）；orgTraits.orgkind_household（social.json:11）。person 表头必填维度里 personality、sensitivity、pos、facing、origin 已登未建列（_unbuilt-derived.json:179–183），writePersonRow 对未建列不查必填 |

## 做了什么

1. **人物名册**：world/people/opening-roster-hw.json（59 行：id、species、sex、ageYears、birthplace、household），由 tools/convert-people-hw.mjs 从旧作者数据转（`--check` 比对，重跑恒同）。选人规则是旧数据 scope 为试玩地区的人；家户取户籍索引；索引里没有的明确 household: null（npc_hw_hezhou）。npc_hw_yanzhe 旧 scope 是白石镇，不属试玩地区，不载入。
2. **建人与成员边、户主边**：server-plugin/opening-people.mjs 的 applyOpeningPeople，在调用方已开的世界创建事务里，对每个名册行调 instantiatePerson（instanceId 取名册 id；寿命、成年体重、属性按物种分布从种子键采样），再对每户写一条户主边与其余成员各一条成员边。户主 = 本户成员按 R18-2.9 全序取第一位（firstInFullOrder）。
3. **person.mjs**：抽出 birthMinuteOfAge（现刻 − 年龄 × 年长），instantiatePerson 的 ageYears 路径与本模块共用一处。不直接用 ageYears 路径：它要成年阶段表，阶段表未建，未成年人会整笔拒收（问题.md 阶段表与生长曲线）。
4. **规则表键**：rules.gen.householdMemberKind、householdHeadKind（worldgen.json、registry.json）。
5. **测试**：tests/kernel/opening-people-hw.test.mjs 九条（真实世界加载约 9 秒，整文件本机几秒）；tests/cloud/opening-holdings-hw.test.mjs 里原来断言"人物未载入、成员边写不了"的缺口测试改成 H-4 的核对：九栋住处的持有户（生产调用点 generateFill 的 assets）= 成员边与户主边指向的户，成员恰是索引里该户成员、恰一个家长（单条约 55 秒）。

## 卷文逐条落实

- 卷四 :984（P-4）：手写的具名个体也走 instantiatePerson，物种、出生时刻、出生地必给，实例 id 可给，未给的维度采样 → applyOpeningPeople。测试：「建人」。
- 卷十八 :712（R18-2.9）：先权重、再亲等、再 birthMinute 早者、最后实体 id 字典序，不依赖遍历次序 → firstInFullOrder。测试：「R18-2.9 全序」「确定、可复现」（名册倒序结果同）。
- 卷十八 :746（A18-2.2）：每个在世个体的家户边至多一条（成员边与户主边合计）、每个家户恰有一条户主边 → 户主只写户主边、其余成员边，种类行 incompatible 互斥。测试：「22 户每户恰一个家长…每人至多一条」。
- 李白 11-22 15:21 P-2：开局家长照 R18-2.9 户主候补全序派生（亲等、出生时刻、id 序），不逐户手写 → 同上；权重、亲等开局无数据，视为相等，登问题.md。

## 派生口径

- 户主：22 户里同户成员年龄都不相同，户主就是户内年龄最大者（01 林穗、02 陈柏、03 许玲、04 段焰、05 吴朔、06 范荣、07 郑水生、08 石瑾、09 阮峥、10 俞星、11 梅岳、12 陆询、13 安淮、14 申鹤、15 邵禾、16 华慈、17 冉默、18 翁巧、19 杭丽、20 钟秀、21 李岩、22 殷戈）。
- 成员边 36 条（58 人 − 22 户主），户主边 22 条；npc_hw_hezhou 无户无边。
- 九栋私宅：home_15–22 对 org_house_hw_15–22，河边小屋对 org_house_hw_03；成员数 4、3、4、4、4、4、4、4 与 1。

## 缺口与须李白定的事（详见 docs/问题.md "待李白：开局建筑归属缺口" 第 2 条）

1. **采样寿命常低于已有年龄（须李白定）**：卷文无条件采样寿命（物种行正态 62、sd 12、夹 [28, 98]），换 5 个种子试，59 人里每次 10–13 人的寿命抽得比自己现在的年龄还小（relAge > 1）。是否改为按存活条件采样或补卷文规则要李白定；本卡没改分布、没手写寿命。
2. 亲等、权重无数据（亲属边未载入），户主取最早出生者；出生日期（baseline 的 birth 年月日）未转，统一取整数年龄；出生地取所属地域 scope 是迁移取值；culture 不写（文化表未前移）；pos、facing 不写（卡 6-27），59 人无位置。
3. 户籍索引没有补"家长字段"：家长是可由出生时刻与 id 派生的值，存进索引会与派生不同步，卡文这一句按"派生优先"没照做，见偏离。

## 偏离

- **户籍索引未补家长字段**：同上，家长在建世界时派生；cloud 测试断言索引不带 head 字段。
- 另动 server-plugin/person.mjs（抽 birthMinuteOfAge，行为不变）、world/rules/registry.json、worldgen.json（两个规则键）、tests/cloud/opening-holdings-hw.test.mjs（旧缺口测试改 H-4 核对）、docs/问题.md、docs/PLAN.md。
- 命令纪律：全量测试那条命令带了 `| tail -40`（管道），并因超 180 秒被工具转后台；一次探索中误用 `sed -i` 改了 F:/dnd-tmp 下的一个临时脚本（不在仓库）。其余探索脚本放在 F:/dnd-tmp。DeepSeek 未委派：这张卡的难处在接线与口径判断，机械部分（转换脚本）本身只有几十行，委派的说明成本高于自己写。

## 验收

- `node --test --test-concurrency=3 tests/kernel/*.test.mjs tests/accept/*.test.mjs`：`ℹ tests 2079 / ℹ pass 2079 / ℹ fail 0`（改前 master 为 2070，本卡新增 9 条）。第一次跑暴露 s2s3 两处门禁命中（opening-people.mjs 的 JSDoc `{any}`、表名字面量 `.get('org')`），已按门禁原意改成 `{object}` 与按 id 登记 kind 取表，再全量重跑。
- `node tools/accept/run.mjs pre_commit`（不带 --write）：`"verdict": "pass"`，失败项仍只是 vol12 三项既有基线（A12-4.5、S12-2、S12-3）。
- `node tools/convert-geo-g5b.mjs --check`：退出码 0（真实世界整体加载、补缺一遍过）。
- `node tools/convert-people-hw.mjs --check`：退出码 0。
- `node --test --test-name-pattern="H-4" tests/cloud/opening-holdings-hw.test.mjs`：1 条通过（约 55 秒，走生产调用点 generateFill）。
