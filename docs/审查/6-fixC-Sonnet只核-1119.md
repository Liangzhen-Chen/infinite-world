# 块 6 补值卡 C 只核（Sonnet 5.5 中档，2026-11-19；只读，非写者）

对象：分支 ds/b6-fixC，HEAD 56ddf0495，对 origin/master 的三点 diff；依据李白 11-19 20:3x ②–⑥（docs/审查/李白裁定-1117.md 末节）、卷三乙 :304/:310/:1930/:1948/§4.10.5、卷二 §1.2 :101–102、§3.3 :1357/:1408、卷五 §4.13.3、卷六 §2.1，回报 docs/卡回报/ds-b6-fixC.md。

## 结论：可封（无必须改项；下列 3 条为建议，不挡封）

## 逐项

1. ② access 与一般成员：通过。
   - `_vocab.json` access 三档 0/1/2 保留并各加 basis"设定数待调"，次序与裁定一致。
   - 持有种类行 `membership` 为真的整类共 7 行（hk_member_of、hk_household_member、hk_household_head、hk_business_member_of、hk_devotee_of、hk_citizen_of、hk_enlisted）逐行核对均为 grantsEntry 真、entryRankMax 0；hk_permit 仍 1，未被改动。是按行字段整类填，不是点名 id；测试同样用 `membership === true` 过滤，非按 id 列表。
   - 不含 hk_resident_of（membership 假、domicile 真）：理由合理（卷五 :1033 说"一般成员关系"），已作自定裁定写明，改法为两列，可逆。
   - 测试落在数据口径（holdings.test.mjs 新用例）并在回报中明说 canEnter 未建，如实。断言是 entryRankMax < 每个 needsGrant 档 rank，未放宽。
2. ③ durability extScale：通过。
   - item.json durability 改 `precision: 8`、`stockMode: "extScale"`，照卷二 :101–102、:1408 第 6 条体例。
   - item-state.mjs 的 durabilityOn、wearStep、wearCost、useWear 全程 10⁸ 标度；自然劣化量仍按 10⁴ 算再乘 fixedScale() 升标度后减，D-2 例（0.9136）不变，测试仍过。
   - fixedDivide8、fixedToNumber8 只在 det-math.mjs 定义一份（全仓 grep 无第二份），item-state 只引用；fixedUnits8、fixedMultiply8 是既有函数。
   - 铁斧手算：0.002÷60=0.0000333…→0.00003333；×40÷60=0.0013333…→0.00133333（先乘后除）；750×0.00133333=0.9999975→剩 0.0000025；1−0.00003333=0.99996667；0.002×30000÷60=1 恰磨尽为 0。均与测试字面量一致。
   - 十二类判据经 tools/accept/register.mjs 各升 rev 并写修订记录（criteria.json 见 const_literal rev 56 等，ref 说明"判据本身未改，指纹随 import 闭包变"），体例合规。
3. ⑤ 勘误 1119k12：通过。
   - 勘误前快照 卷六-v10-勘误前-1119k12.md 与 origin/master 卷六正文同 blob（1772a10b3…）；卷三乙-v7-勘误前-1119k12.md 同 blob（21c339c0d…）。
   - 现行快照 卷六-v10.md、卷三乙-v7.md 与改后正文 cmp 一致；两卷附录各加一行修订记录，不升版本号，历史修订未回改。
   - 卷六在 §2.1 资源种类表字段表加 `item` 行（`ref item nullable`，resfam_goods 必填）；卷三乙 :1948 交互表行补 `item`。李白原话为"卷六 §4.1 条目字段"，§2.1 是字段表出处（卷六 :129 写明"条目字段归本卷，见 §2.1，§4.1 为登记处"），落点合理。item-state.mjs 的 resourceKindsOf、itemOfResource 本就按条目 `item` 字段读，无需改码。
4. ⑥ quality、wear、持有种类：通过。
   - quality 七档 rank：awful 1、poor 2、normal 3、good 4、excellent 5、masterwork 6、legendary 7，与卷三乙 :304"劣次常良优精绝"一致；wear intact 0、worn 1、damaged 2、broken 3、ruined 4 与 :310 一致；代号取裁定指定的名字。
   - hk_wearing（agent→thing）、hk_containing（thing→thing）新建，40 列同 hk_wielding 体例，未自编语义字段；hk_wielding 即装备未另立。checkHoldingKindRows 返回无错。
   - unbuilt：quality 去 tierCodes、wear 去 wearKinds、containers 只剩 maxNesting，registry.json 说明与表内 basis 同步；quality_fine 占位删除，未被其他数据引用，仓库内测试全过；卷十四 :961 的引用已由主会话报李白。
5. ④ 未写：如实。读码核对 lotsUnmergeable（ledger.mjs:1298）判同键只比 source/qualityTier/purports/batchTag/material/project 与 temperature/burn/leakAnchorDay/taint，没有任何实例批次区分，mergeLots 因此会把同种铁斧的实例批次并成一批；与回报的复现一致（我未重跑其一次性探针，读码支持其结论）。裁定④原话"若存在一个批次装多件实例，先别写，列具体例子报我"，写者照办，没有拿简化版顶上。
6. 卡文外改动：item-state.mjs（③ 算术所在）、registry.json、containers.json、wear.json（⑥ 要求相应 unbuilt 条目删除）、holdings.test.mjs（② 测试）均为完成本卡所必需，断言未放宽（行数 47→49 随新增两行同步；其余断言为新增）。

## 建议（不挡封）

- A. det-math.mjs fixedDivide8 的注释写"a × SCALE² ÷ b"，代码是（a×SCALE）÷b（入参为 10⁸ 标度整数，结果仍为 10⁸ 标度，代码正确，与卷二 :1410 的实数口径一致）。建议注释改成"入参为 10⁸ 标度整数：a × SCALE ÷ b，等价于实数口径 a′ × SCALE² ÷ b′"，免得后人读错。
- B. 卷二 §3.3 第 6 条要求 extScale 字段"所在卷须写出误差界断言"（n×m×10⁻⁸）。本卡未补 durability 的误差界；durability 每次用损单点截断（m≤1），随后续任一写 durability 的卡一并补，或由李白认定已含。
- C. tests/kernel/item-lots.test.mjs 末尾换行被去掉（diff 显示 No newline at end of file），无功能影响，下次触碰时补回。

## 亲跑验证

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1057、pass 1057、fail 0。
- `node tools/accept/run.mjs pre_commit`：verdict pass（items fail 3 为 vol12.A12-4.5、vol12.S12-2、vol12.S12-3，属卷十二条目、与本卡文件无涉，未在 master 复跑对比；verdict 为 pass，不挡 pre_commit）。
