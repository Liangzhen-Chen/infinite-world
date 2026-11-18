# FX11 只读盘点：审批指纹失效清单（t-m26 HEAD d8c613ae）

方法：在 F:/temp/claude/066df71e3594f148/91a2ffab-45cc-4033-adab-94b22866f267/scratchpad/cur（HEAD 的只读副本，挂禁网预加载）里，把 tools/content-pipeline.mjs readApprovedContent 的"遇错即抛"改成"逐条记录指纹是否相符并保留当时的 entry 与 context"，再跑原入口；仓库本身未动。
旧值取自各记录最后写入的提交（git archive 到副本）：该提交下指纹相符，所以"旧 entry/context"就是审批时的；与现值逐字段比对。
m2-6 的界定：m2-6 基线 = d7676be9（t-l2fix 尖，PLAN 所记 m2-6 拼装的底）；t-sat/t-avail/t-perf/…/FX 的提交都在其后。注意用户给的 5b5d4589 已含 t-sat、t-avail 等七次合并，所以我对 d7676be9、5b5d4589、HEAD 三点都实跑了。
每个集合在 d7676be9（m2-6 之前）、5b5d4589、HEAD 三点的失效数：a3-world 2/3/3，s5-market 1/1/1，w3-journey 4/4/4，w5-festival 1/1/1。

## 1. 各审批集失效条目

### 1.1 a3-world（world/design/a3-world-approval.mjs --verify）：失效 3 条（共 30 条），其中 1 条由 m2-6 引起
| 条目 | 变了什么（字段级） | 提交 | m2-6？ |
|---|---|---|---|
| item_hoe | entry.row.tags: 无 -> ["soil_work"] | d24147b4（2026-10-23 a3w-props 给 29 件目录物加用途标签） | 否（d7676be9 前已失效） |
| item_sickle | entry.row.tags: 无 -> ["cut","harvest"] | 同上 d24147b4 | 否 |
| recipe_w3_fish_broth | ctx.publishedFacts.output.nutrition: {"satiety":35} -> 无（item_fish_broth 不再手写营养，a3-world 目录 NUTRITION_IDS 去掉鱼汤等四项，条目数 34→30） | 01423926（2026-11-09，t-sat "饱腹派生幂等"；其父 4d027ba4 的 verify 本身在 item_bread 上先报错，故以 01423926 为首次失效点） | 是（t-sat） |

连带（指纹之外，同一原因）：item_hoe、item_sickle 的已审草稿与现条目不符（缺 tags）、正式文件行与已审行不同，重审时会一并解决，因为新草稿取自现条目。
重审方式：`node world/design/a3-world-approval.mjs --review`（整批，不要用 --id，会把批次文件缩成单条）。草稿冻结（reuseFrozenDrafts），所以每条只 1 次 L2 复核，共 3 次；未失效条目不发请求。
L4：失效条目所在的两个批次（batch-0 含 hoe/sickle，batch-1 含 fish_broth；批次组成也已因 34→30 变化）指纹都会变，旧 L4 作废，须按新抽样（每批 5 条）和告警条补读阅读记录。然后 --verify。
费用估算：A3FW 账本实测 0.14103688 元/60 次 = 0.00235 元/次；3 次约 0.007 元。余量充足（已用 60/88 次，0.141/1 元）。

### 1.2 s5-market（world/design/s5-market-content-approval.mjs --verify）：失效 1 条（共 2 条），m2-6 之前已失效、m2-6 又叠加改动
条目 s5-market-parameters（row = world/rules/tables/market.json 全文）。审批时 fb0346ce（2026-10-25）下指纹相符。此后新增字段：
- forward：0d20f2fb（10-26，S5-08 远期合约）——m2-6 前
- householdBuffer：b05ef0ef（10-29，K02）——m2-6 前
- customerChoice：394a9b94（10-30，K08）——m2-6 前
- foodHabit：bb8dd96c（11-09，t-avail），随后 c1fa7907、97c1dd1e 改其内容——属 m2-6
所以 m2-6 不是原因（去掉 foodHabit 仍失效），只是又加了一个字段。s5-regional-pricing 指纹相符；rules.json 的 pricing 句与 m5-trade-rules.mjs 里的句子我也核对过，与审批文字一致。
重审方式：`--review`，1 次 L2。但 S502C 账本 maxRequests=3，已用 2，只剩 1 次，第一次审查若判 hard 则无法重试，须先请李白提次数上限（不是放宽金额，金额 0.3 元只用了 0.0024）。L4：batch-0（只含这一条）重读 1 条。
费用估算：账本 0.002408 元/2 次 = 0.0012 元/次；上下文变大，按 0.0015–0.002 元估。

### 1.3 w3-journey（tools/w3-journey.mjs --check）：失效 4 条（items 2、recipes 2），m2-6 之前已失效
| 条目 | 变了什么 | 提交 | m2-6？ |
|---|---|---|---|
| item_stitchbound_folio | entry.basePrice 61 -> 37（骨架按材料成本派生） | a5d26db8（2026-11-05 P1 修订：item_parchment basePrice 12→4） | 否 |
| item_paper_cord_tags | entry.basePrice 29 -> 21 | 同上 | 否 |
| recipe_w3c_stitchbound_folio | ctx.materials[0].facts.basePrice 12->4；ctx.product.basePrice 61->37 | 同上 | 否 |
| recipe_w3c_paper_cord_tags | ctx.materials[0].facts.basePrice 12->4；ctx.product.basePrice 29->21 | 同上 | 否 |
记录最后写入 7eb4eb4c（10-10），该提交下指纹相符。
重审方式：w3-journey 无 L2-only 模式；`node tools/w3-journey.mjs`（无参数）对指纹变了的条目整条重新起草+复核，其余已通过的不发请求（该命令会重写 journey/bones.json）。4 条 × (起草 1 + 复核 1) ≥ 8 次 DeepSeek 调用，若有改写 ≈ 10–12 次。
费用估算：journey 批次文件的 costUpperYuan 差分——items batch-4 共 34 条 0.2425 元（0.0071/条，含 16 条改写），recipes batch-1 共 42 条 0.2471 元（0.0059/条）；4 条合计约 0.026 元（上界口径）。w3 账本已用 5.25/20 元。
L4：items batch-4（抽样 5 + 告警 2）、recipes batch-1（抽样 5 + 告警 1）两批作废重读。
注意：重审后还要决定正式条目价格是否随之更新（见第 2 节）。

### 1.4 w5-festival（tools/w5-festival-publication.mjs --check）：失效 1 条（共 24 条），m2-6 之前已失效
条目 festival_borrowbench：entry.running.status "暂不举办，等候主办人" -> "可以正式举办"；entry.running.host 无 -> "季澄（灯祠照看）"；ctx.host 无 -> {季澄, 灯祠照看, notes…}。提交 5c908091（2026-10-15 W5S：借凳归途日主办人派生）。记录写于 45964293（10-15），该提交下指纹相符。非 m2-6。
指纹之后的连带：旧已审草稿带 hostRequirement（等候主办）而现设计稿没有，也报"已审核正文与设计稿不符"，重审后消失；其余 23 条通过 L1 与正文比对。
重审方式：`node tools/w5-festival-publication.mjs --review`（整批，不用 --ids，否则批次文件缩成单条会毁掉波次评分核对）。草稿冻结，1 次 L2。
L4：批次指纹变，旧 L4（含 10 条六项波次评分）作废，须重抽 5 条阅读记录并重做"随机 10 条 × 6 项评分"（均值 ≥4、单项 ≥3）。
费用估算：T108 账本 26 次结算 0.0634 元 ≈ 0.0024 元/次，1 次约 0.0024 元；次数 57/70、金额 0.883（含 0.82 预留）/1.5，够用。

### 1.5 其余审批集
READONLY_ENTRIES 里其他 `--verify`/`--check`（matprops、a3-content、a3-people-life、a3cap-data、a3w-props、s4-*、s5-credit、s505、s507、s504、p1-revision、w3-trades、w5-festivals/social、w5-sites 批 3 等）云上没报指纹失效。我在副本里跑过的（a3-world 嵌套调用 s505/s4 的 readApprovedContent、w3-wave-score、w5-sites 三批的 approved()）也没有发现除上表外的失效条目。

## 2. w3-wave-score --check
publishedW3 逐条比对"正式条目 vs 骨架 + 已审文字"，云上首个报错 item_warm_vinegar_drink/tags。我写了不抛错的版本，519 条全部列完：共 23 条、不一致字段如下（全部 notApproved=0）。

| 条目/字段 | 正式值 | 骨架/已审值 | 来源提交 | m2-6？ | 判断 |
|---|---|---|---|---|---|
| item_warm_vinegar_drink.tags | +drinkable | 无 | e4636d01（11-10 补齐饮品 drinkable 标签） | 是（FX，在 5b5d4589 之后） | 正式对 |
| item_clay_bowl.tags | +liquid_container | 无 | d24147b4（10-23 a3w-props）；capacityMl 同批由 5fabdad0 | 否 | 正式对 |
| item_frame_saw / mortise_chisel / leather_shears / stitching_awl / mining_pick / sheet_shears（行商工艺 6）.tags | +cut / pierce / pry,soil_work | 无 | d24147b4 | 否 | 正式对 |
| 远行细作 11 条 .tags：iron_wire(+unlock) drawknife jeweler_pliers(+grip) jeweler_saw button_shank_tool(+grip) quill_knife broad_steel_chisel hooked_pruning_knife leather_round_knife carpenters_adze steel_gouge_tip(均 +cut 或 +grip) | 同左 | 无 | d24147b4 | 否 | 正式对 |
| item_parchment.basePrice | 4 | 12 | a5d26db8（11-05 P1 修订；publication.json 明写 supersedes "world/drafts/w3/trades/bones.json#item_parchment basePrice"） | 否 | 正式对：P1 经 L4 批准并登记了"取代骨架"，骨架硬编码 12（economy-w3-trades.mjs 第 26 行）没跟上 |
| item_stitchbound_folio.basePrice | 61 | 37 | 骨架按材料成本派生，parchment 12→4 后重算为 37；正式条目是按旧价 12 发布的 61 | 否 | 骨架对（派生规则），正式条目过期：P1 只改了 parchment，没有级联这两件派生价（另有 item_paper_cord_tags 29→21） |
| item_paper_cord_tags.basePrice | 29 | 21 | 同上 | 否 | 同上，正式条目过期 |
| recipe_w3_fish_broth.minutes / process("全程60分钟") | 60 / 含"60分钟" | 30 / 含"30分钟" | 64b2a12d 改 60，ccf61b5e 退回 30，14b1fc70（10-22 fix4-data，a3-world 审批）又定为 60，依据目录写的"半个时辰=60分钟，D16.5" | 否 | 正式较新且有 a3-world 审批（item 为 a3-world 批的 recipe 条目）；骨架（economy-w3.mjs）与 w3 草稿文字（30分钟）过期。注意历史上有一次"无独立依据"的回退，建议主会话确认 60 的依据后再定 |

归类：骨架该跟的 = 3 类（parchment 价格、fish_broth 时长与文字、tags 用途层）；正式条目该更新的 = 2 条（folio、cord_tags 价格）。
处理方式的取舍（只给后果，不替你定）：
- 若改骨架（economy-w3*.mjs 的 tags/价格/分钟）：每条骨架变化都会让该条 w3 指纹失效、需重新起草+复核；tags 涉及 19 条，每条 1 次起草+1 次复核，约 38 次调用 ≈ 0.09 元（按 0.0048 元/次"起草+复核"；有改写则到约 0.14 元），并重做相关 L4；parchment 1 条约 0.007 元，fish_broth 约 0.006 元。
- 若改工具规则：让 publishedW3 对"后续已审层叠加的用途标签"按子集比对，并读取 world/drafts/p1-revision/publication.json 的 supersedes 回执（P1 已声明取代骨架值），零 L2 费用。这与 w5-sites 的两处冲突（见第 3 节）同一类原因：P1 修订声明了"取代设计源"，但消费设计源的检查没有读这份回执。
- 即使上述全部消除，wave-score.json 的 corpusHash 仍会不符（"正式内容已改变，评分依据失效"）：评分建于 e6120996，之后 22 个正式条目变了（19 条 tags、clay_bowl 的 capacityMl、clay_oil_lamp 的 lifecycle（e4c17422）、parchment 价格、fish_broth 分钟与文字）。10 个固定样本的 entityHash 全部仍相符，评分内容本身没受影响，需要的是一次带回执的重算语料哈希（现有 acceptFactCorrections 只认字符串替换型补丁，不够用），这也要算作一个规则层缺口。

## 3. w5-sites 第 1、2 批（--dry-run）
两批的审批（approved(n)）都通过；冲突只出在 mergeSites 与正式 world 合并这一步。逐条列全（第 3 批无冲突）：
| 批 | 地点 | 字段 | 正式值 | 设计源值 | 提交 | m2-6？ |
|---|---|---|---|---|---|---|
| 1（patch，"已有据点参数冲突"） | loc_wild_lq_adit | site.resources[0].item（adit_ore） | item_iron_ore | item_iron_scrap（world/design/w5-sites-1.mjs 第 94 行） | a5d26db8（11-05 P1 修订） | 否（d7676be9 前已如此，pre/base/HEAD 三点输出相同） |
| 2（新增地点，"正式地点冲突"） | site_w5_ll_deep_drift | site.resources[0].item（ll_ore） | item_iron_ore | item_iron_scrap（w5-sites-2.mjs 第 121 行） | a5d26db8 | 否 |
publication.json 明写 supersedes "world/design/w5-sites-1.mjs#loc_wild_lq_adit" 与 "…w5-sites-2.mjs#site_w5_ll_deep_drift" 的这两个字段。正式值是对的；设计源没跟。
处理：改设计源两处 item 值会使这两条的 skeleton 变、指纹失效，需各 1 次 L2（可能还要重读 L4），约 2×0.0025 元（T114 等账本按 0.0024 元/次估）；或在 mergeSites 读取 P1 回执（规则层，零 L2）。我没有核对合并之后 validateWorld(release) 是否还有别的错（需先消除冲突才能走到那一步）。

## 4. d1-system-data --check
rules.json 与 applyD1 输出的差异：值级逐字段比较 0 处不同，键顺序也相同；纯格式差异。文件里 4 个顶层段（facilities、travel、governance、agriculture）是手工紧凑排版（如 `"material": {"wood": 3, "stone": 1}` 在一行），工具输出为全展开，相差 28 行（13260 vs 13288）。引入提交：facilities/governance/agriculture = b2d3ab28（2026-10-30 K07），travel = eae0458b（11-01 CT07，经 K16 合并仍在）；之后 rules.json 再无整文件往返相同的提交，d7676be9、5b5d4589、HEAD 三点输出一致，非 m2-6。
修复：`node tools/d1-system-data.mjs`（无参数）会把 rules.json 重写为全展开，只改排版不改内容；或让 --check 比 JSON 值而不比字节（规则层）。注意文件在 Windows 检出为 CRLF，工具已先做 CRLF 归一，不是原因。

## 5. a3-score --summary
本机（Windows，只读副本，禁网预加载）HEAD：580 秒到时被 timeout 杀掉，120 条语料只完成 5 条（第 1 条约 3.7 分钟含启动，第 2 条 229 秒，其后 3-4 条各 5-30 秒）。结论：本机 15 分钟内跑不完，按进度推算远超 600 秒。loadWorld 仅 1.4 秒，慢在逐条执行。
m2-6 之前的 d7676be9：401 秒只完成 1 条，同样慢，故不是 m2-6 引起。
二分（每点 90-100 秒探测，看首条出现时间与条数；沿 first-parent 链，14b1fc70 起）：
- 14b1fc70（10-22）：281 秒完成 60 条，约 5 秒/条，全量约 10 分钟
- 6bca04b0（10-27）、d47ec5c7（10-29）、52a48aa7（10-29，K02 fix）：首条 14-15 秒，100 秒 6-9 条，快
- 60f061f1（10-29，合并 t-k05-law "K05 business lifecycle"）：首条 60 秒、100 秒只 1 条，慢；之后 dafae4cd、8fd5c006、69174ba6、9b105b45（10-30）、3a7ce601（11-05）均同样慢
- 与上一个快点 52a48aa7 相比，该合并只改了 server-plugin/business.mjs（+201/-9 行）。
慢化点定位到 60f061f1（K05 经营生命周期）合入，早于 m2-6；a3-score.mjs 本身最后改于 11-08（b316ab9e，只改退料上限）。未做进一步热点剖析。二分已完成，无剩余待测提交。

## 6. 复算脚本与产物位置
scratchpad = F:/temp/claude/066df71e3594f148/91a2ffab-45cc-4033-adab-94b22866f267/scratchpad：mk.sh（git archive 某提交到副本并打诊断补丁）、run.sh、d-*.mjs（各集合的不抛错版逐条诊断）、cmp.mjs（新旧 entry/context 逐字段对比）、*-stale-*.json（原始结果，含新旧 context）。
