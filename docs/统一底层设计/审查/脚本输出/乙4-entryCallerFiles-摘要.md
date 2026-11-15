# 乙-4 H2 entryCallerFiles 采集摘要（脚本生成，勿手改）

- 生成脚本：脚本/卷十一/collect-entry-callers.mjs（只读、确定性；同一树重跑逐字一致）
- 采集对象：目录树哈希 server-plugin 2998475680、extension b32997d4ae
- 登记项口径：卷二 §2.7 的 systems 登记表现只有两行示例（status、capacity），没有全书汇总的登记数据；本次按各领域卷 §3.1「读入口」节登记的入口名取（表格取前两格里的反引号记号，列表项取行首第一个记号，记号须是小写开头标识符，后接 `(` 或到记号结束）。每个入口名在其所在卷下算一项。
- 检索口径：静态读 server-plugin、extension 下 337 个 .mjs/.js 文本，先去掉块注释与行注释；「定义文件」= 含 function 名、const/let/var 名 = 或 export { … 名 … } 的文件；「调用文件」= 不是定义文件、但含 名( 的文件（`.名(` 的成员调用也算）。以名字为准，不区分同名的不同函数，所以是上界。
- 登记项数：413（入口名 408 个）；其中旧代码里已有同名定义的 40 项；有调用文件的 28 项；调用文件为空集的 385 项（本设计新立的入口在旧代码里没有调用方，属预期）。

| 卷 | 登记项数 | 旧代码已有同名定义 | 有调用文件 |
|---|---:|---:|---:|
| 卷七 | 39 | 1 | 1 |
| 卷三乙 | 5 | 1 | 1 |
| 卷九 | 28 | 7 | 7 |
| 卷二十 | 15 | 1 | 1 |
| 卷二十一 | 6 | 1 | 1 |
| 卷二十七 | 9 | 1 | 0 |
| 卷二十三 | 14 | 1 | 1 |
| 卷二十九 | 6 | 0 | 0 |
| 卷二十二 | 22 | 3 | 1 |
| 卷二十五 | 12 | 0 | 0 |
| 卷二十八 | 6 | 0 | 1 |
| 卷二十六 | 4 | 1 | 1 |
| 卷二十四 | 16 | 0 | 0 |
| 卷五 | 2 | 2 | 1 |
| 卷八 | 31 | 0 | 0 |
| 卷八b | 32 | 2 | 2 |
| 卷六 | 34 | 10 | 5 |
| 卷十 | 14 | 2 | 1 |
| 卷十一 | 13 | 0 | 0 |
| 卷十七 | 15 | 0 | 0 |
| 卷十三 | 18 | 0 | 0 |
| 卷十九 | 2 | 1 | 1 |
| 卷十二 | 10 | 0 | 0 |
| 卷十五 | 13 | 0 | 0 |
| 卷十八 | 11 | 4 | 2 |
| 卷十六 | 17 | 0 | 0 |
| 卷十四 | 16 | 1 | 0 |
| 卷四 | 3 | 1 | 1 |

有调用文件的登记项（前 40，按调用文件数降序）：

| 卷 | 入口 | 定义文件 | 调用文件数 |
|---|---|---|---:|
| 卷二十二 | subjectiveView | server-plugin/dialogue.mjs、server-plugin/subjective-view.mjs | 27 |
| 卷十九 | facilityView | server-plugin/facility-state.mjs | 23 |
| 卷九 | npcDecision | server-plugin/dialogue.mjs、server-plugin/npc-autonomy.mjs、server-plugin/npc-decision.mjs | 21 |
| 卷九 | check | extension/action-builder.mjs、server-plugin/action-affordances.mjs、server-plugin/action-rite.mjs、server-plugin/activities.mjs、server-plugin/checks.mjs、server-plugin/domain-rules.mjs、server-plugin/elections.mjs、server-plugin/environment.mjs、server-plugin/extraction.mjs、server-plugin/faction-clock.mjs、server-plugin/husbandry.mjs、server-plugin/item-class.mjs、server-plugin/local-exams.mjs、server-plugin/magic-object.mjs、server-plugin/monster-society.mjs、server-plugin/npc-schedule.mjs、server-plugin/primitives-effects.mjs、server-plugin/primitives-runtime.mjs、server-plugin/seasonal-hazards.mjs、server-plugin/sites.mjs、server-plugin/smuggling.mjs | 18 |
| 卷九 | route | extension/tools.mjs、server-plugin/building-maintenance.mjs、server-plugin/business.mjs、server-plugin/compat/v2-phase1-engine.mjs、server-plugin/engine.mjs、server-plugin/facility-state.mjs、server-plugin/labor-market.mjs、server-plugin/law.mjs、server-plugin/learning.mjs、server-plugin/magic-air.mjs、server-plugin/magic-light.mjs、server-plugin/magic-message.mjs、server-plugin/magic-movement.mjs、server-plugin/npc-cognition.mjs、server-plugin/npc-crime.mjs、server-plugin/npc-labor.mjs、server-plugin/npc-obligations.mjs、server-plugin/place-layout.mjs、server-plugin/primitives-movement.mjs、server-plugin/quest-board.mjs、server-plugin/remote-generation.mjs、server-plugin/settlement-trade.mjs、server-plugin/transition.mjs、server-plugin/ui-map.mjs | 14 |
| 卷六 | marketQuote | server-plugin/market.mjs、server-plugin/shop.mjs | 12 |
| 卷九 | consent | server-plugin/action-authority.mjs、server-plugin/action-consent.mjs、server-plugin/distribution.mjs、server-plugin/family-politics.mjs、server-plugin/magic-mind-space.mjs、server-plugin/magic-ritual.mjs、server-plugin/monster-society.mjs | 11 |
| 卷九 | authority | server-plugin/action-authority.mjs、server-plugin/civic.mjs、server-plugin/governance.mjs、server-plugin/law.mjs | 10 |
| 卷二十一 | personView | server-plugin/entity-view.mjs | 9 |
| 卷二十六 | personView | server-plugin/entity-view.mjs | 9 |
| 卷四 | personView | server-plugin/entity-view.mjs | 9 |
| 卷十八 | holdingKind | server-plugin/holdings.mjs | 7 |
| 卷六 | householdBudget | server-plugin/household-budget.mjs | 6 |
| 卷二十 | placeView | server-plugin/entity-view.mjs | 4 |
| 卷五 | placeView | server-plugin/entity-view.mjs | 4 |
| 卷七 | faithOf | server-plugin/faith-state.mjs、server-plugin/magic-ritual.mjs | 2 |
| 卷八b | normStack | server-plugin/norm-stack.mjs | 2 |
| 卷六 | balance | server-plugin/business.mjs、server-plugin/credit.mjs、server-plugin/finance-bank.mjs、server-plugin/household-budget.mjs、server-plugin/law.mjs、server-plugin/ledger.mjs、server-plugin/legal-appeal.mjs、server-plugin/obligation-runtime.mjs、server-plugin/office-salary.mjs、server-plugin/organizations.mjs、server-plugin/titles.mjs、server-plugin/transition.mjs | 2 |
| 卷三乙 | itemView | server-plugin/entity-view.mjs | 1 |
| 卷九 | aiAllows | server-plugin/ai-profile.mjs | 1 |
| 卷九 | sceneCard | server-plugin/scene-card.mjs | 1 |
| 卷二十三 | itemView | server-plugin/entity-view.mjs | 1 |
| 卷二十八 | loadWorld | — | 1 |
| 卷八b | evidenceScore | server-plugin/law.mjs | 1 |
| 卷六 | exchangeRate | server-plugin/currency.mjs | 1 |
| 卷六 | wageQuote | server-plugin/obligation-state.mjs | 1 |
| 卷十 | composeName | server-plugin/remote-generation.mjs | 1 |
| 卷十八 | opinionOf | server-plugin/public-opinion.mjs | 1 |
