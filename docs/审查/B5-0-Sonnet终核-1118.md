# B5-0《块 5 勘误与码登记》Sonnet 终核（只读）— 分支 ds/b5-0，对 origin/master...ds/b5-0

（原文由主会话从 F:/dnd-tmp/review/ 原样入库。）

依据：docs/审查/李白裁定-1117.md :1077 起（李白 11-18 22:10 裁定）原文亲读。

## 结论：可封

## 逐项

1. 码登记。error-codes.mjs 在 vol2.s4.3 与 vol9.s2.8 两组各登 E-ACT-WRITER-NOT-READY；卷九 §2.8 码表行（卷九:410）、卷二 §4.3 码表行（卷二:1574）含义为“原语适配器或其目标写者尚未上线”，与丙9 原句一致，并注明 E-ACT-PRIMITIVE 保持原义、只管契约不合；E-ACT-PRIMITIVE 行未动。error-codes.test.mjs 595→596、E 577→578 是必需同步，并加了出处断言（vol2.s4.3、vol9.s2.8）。`node --test tests/kernel/error-codes.test.mjs`：7 pass 0 fail。
2. 五.1 / 丙5 / 丙8 照原句，未扩写。卷二 §2.7 只删 applyPrimitive 一行（卷二:595）；卷九 §4.2.2（卷九:653）写明执行器归规则层、`server-plugin/primitives-runtime.mjs`、入口 `execute`、只由 resolve() 提交段与推进钩子调度方调用，与五.1 一致；卷二 §2.6（卷二:517）与卷十八 §4.1.1（卷十八:457）补“端类型先收为模板名闭集、按实体表解析的核对随第一张建对应实体表的卡启用”，与丙5 一致。docs/迁移体检/块1-P-2.md 的 P2-12 primitives 半改为“块 5 同路径改写 world/ontology/primitives.json 不删（丙8）”，holdings/verbs 照原挂账，第四节第 2 条同步；与丙8 一致。仓库内 applyPrimitive 在现行卷二正文仅余勘误行自述。
3. 勘误 1118k25。三卷（卷九、卷二、卷十八）勘误前快照与 origin/master 对应正文 blob 逐字节相同（`git diff --exit-code origin/master:正文 ds/b5-0:快照`，三者皆无差异；工作区 CRLF 只是检出差异）。现行快照与正文 cmp 相同（卷九-v2、卷二-v17补26-现行、卷十八-v8、卷十八-封卷）。附录各增一行（卷九:1764、卷二:3165、卷十八:1671），版本号与卷首未动。`git diff --word-diff=plain -U0` 附录区全部为纯新增行，既有历史修订行（含 1118k23、1118k24）无任何改动；此前只核唯一的必须改项（1118k24 行引号）已恢复，现与 origin/master 一致。
4. criteria.json 只改 print/rev 与追加 revisions 行（ref 文案格式与 4-4b 相同、rev 递增 1），属登记器重盖指纹的形态；未见手改判定口径。

## 保留意见（不阻封）
- 卷十八:457 勘误句直接并入正文段尾，已在附录登记，符合勘误做法。
- 全量 tests/accept 在跑时见本文末补记（若有）。

终核者：Claude Sonnet 5.5。
