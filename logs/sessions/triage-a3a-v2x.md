## advance-registry
✖ failing tests:
✖ 历史服务回执：full仍逐字节回放S3之前的推进 
✖ 历史服务回执：quiet仍逐字节回放S3之前的推进 
✖ 对照：full存档推进结果可重放且与快照逐字节相同 
✖ 对照：quiet存档推进结果可重放且与快照逐字节相同 
      4 expected: [Array],
      4 actual: [Array],
      4 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      4 + actual - expected

## balance-metrics
✖ failing tests:
✖ 真实世界冒烟：开账后货币总量等于旧字段余额之和，各指标不抛错 
      1 expected: 290,
      1 actual: 288,
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## data-coverage
✖ D1 数据由设计稿生成：rules.json 与设计数据一致 
✖ failing tests:
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## lod2-1
✖ T142 正式发布九省、各省郡数不等合计25–40郡，每省每郡有地形群落、产业、统治、邻里和三到五名关键人物 
✖ failing tests:
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: locations/loc_far_huancheng
      1 + actual - expected

## m6-07
✖ M6-07 已发布层级覆盖河湾四村与野外；不新增白石镇和远方映射 
✖ failing tests:
      1 TypeError: Cannot read properties of undefined (reading 'length')

## m6-08
✖ M6-08 80张实际原创场景覆盖10×2×4、全部已发布人物和地点，许可及逐人提示可追溯 
✖ M6-08 生成器在临时目录复现全部素材，不改变世界输入 
✖ failing tests:
      2 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      2 + actual - expected
      1 expected: [Object],
      1 expected: [Array],
      1 actual: [Object],
      1 actual: [Array],

## mining-jurisdiction
✖ failing tests:
✖ 本地所有可开采的有主地点都派生出法域：五村读本村法典并以西陲王国法典补罪名，自治营地读本会规矩，无法院的白石镇只读政体条文 
      1 ✔ 自治营地无法典：被看见时按共炉议规矩降立场、不立案；规矩缺失时明确拒绝而不借用五村法典 (164.8386ms)
      1 ✔ 五村盗采按西陲王国法典判罚，不读全局默认；政体条文缺罪名时明确拒绝 (162.5027ms)
      1 expected: /^(loc_bs|bld_bs_|site_w5_)/,
      1 actual: 'bld_hc_citywall',
      1 AssertionError [ERR_ASSERTION]: bld_hc_citywall

## npc-depth-lq
✖ failing tests:
✖ tests\npc-depth-lq.test.mjs 
      1 Error: 人物补丁冲突或原档已过期 npc_lq_huoji/schedule.default[2].activity

## npc-depth-sb
✖ failing tests:
✖ 冻结原档首次预演不写入，正式发布闭合15事件30人且仅更新桑坂 
      1 ✔ 桑坂独立出处拒绝候选自证、过期字段、泄密及未参加者获知 (497.2401ms)
      1 ✔ 不能篡改合格字段或原身份，不兼容的共享结局会被拒绝 (351.5152ms)
      1 [RangeError: Array buffer allocation failed]

## npc-depth-wt
✖ failing tests:
✖ 冻结原档首次预演不写入，正式发布闭合7事件30人且仅更新苇汀 
✖ 苇汀已发布完整卡重发零写入，不重复追加共享记忆 
✖ 苇汀正式30人等于已审批完整档，其他人、旧记忆和钱物身份保持原值 
      1 ✔ 钉死T07来源仅接受完整LF或原CRLF，字段篡改、混合换行和伪凭证拒绝 (9.975ms)
      1 ✔ 真实首批存在失败且未完成L4，发布读取必须拒绝 (249.667ms)
      1 ✔ 未提供显式重开授权时原T07 proof仍拒绝新规划，不移除冻结守卫 (460.844ms)
      1 ✔ 冻结叶子拒绝身份、财物和合格声音字段改动 (448.2605ms)
      1 [RangeError: Array buffer allocation failed]
      1 [Error: 人物补丁冲突或原档已过期 npc_wt_zhouzhu/schedule.default[2].activity]

## npc-depth-yp
✖ failing tests:
✖ 双人完整真实L2及实际L4绑定新候选，当前正式源等于批准视图并保留钱物身份与旧记忆 
✖ 已发布正式世界重发幂等：单卡和T11批预演零差异、无新增事件、零写 
✖ 新授权离线双人修订冻结原record/原源/旧proof，所有历史文件逐字保留 
      2 expected: [Object],
      2 actual: [Object],
      2 + actual - expected
      1 ✔ 旧裘砚L2只对应旧事件，缺受控上下文及单侧漏改仍拒绝新候选 (707.2626ms)
      1 Error: 人物补丁冲突或原档已过期 npc_yp_zhusheng/schedule.default[2].activity
      1 AssertionError [ERR_ASSERTION]: 正式源不等于批准视图 npc_yp_zhusheng

## npc-profile-publication
✖ failing tests:
✖ tests\npc-profile-publication.test.mjs 
      1 [cause]: Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/schedule.default[2].activity
      1 Error: 已发布档案发生后续修改；深度补丁来源核验失败：人物补丁冲突或原档已过期 npc_hw_duanyan/schedule.default[2].activity

## npc-publication-increments
✖ failing tests:
✖ 真实正式世界prepare保留四项教学、17人特征和钱物，直接纯函数仍须有效凭证 
✖ 隔离世界预演不写，首次写入后重发零变动，运行字段与17人traits完全保留 
      1 ✔ 根目录缺少来源、伪造学习映射、错导师和审核hash漂移均拒绝 (545.1081ms)
      1 ✔ 原人物L2事实审核记录篡改仍在合并前被拒绝 (131.9141ms)
      1 ✔ 删除、替换、额外服务技能、顺序和技能表示变化仍拒绝 (876.264ms)
      1 ✔ 候选确已审核但正式法术、技能或导师关系缺失和同ID值冲突仍拒绝 (631.666ms)
      1 expected: true,
      1 actual: false,

## ontology
✖ I18 词汇封闭：代码与法典里用到的动词、标签、罪名都已登记 
✖ failing tests:
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## r06-bs-dock
✖ failing tests:
✖ 本批33个ID正式提升且名册去重，河埠与栈西原登记身份保持 
✖ 逐人真实L2证据、串行共享账和L4阅读与最终作者稿相符 
      1 ✔ 休息日没有库存接洽，未获许可的住宅入口保留原拒绝 (74.4436ms)
      1 expected: '335961263d2724bcac196fa8cd950e3eaf78ab177e8391a634a31b47cb2c4b07',
      1 actual: 'a4d14b35c3081d51351bcfa05a0c3f4ffe882631762bb88572702bfdef5bc820',
      1 Error: 发布骨架或引用事实已改变 npc_bs_016_2
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      1 + actual - expected

## r06-bs-skeleton
✖ failing tests:
✖ 聚落经济引用实有商货和小窑，职责与争议有来源和边界，登记不凭空发钱物 
      1 ✔ 玩家实际走到街区和前厅，私宅无许可拒绝；严辙在场许可可入户且不转移库存 (388.227ms)
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## reputation-registry
✖ K10：只从 world 数据派生的势力与成员覆盖每条手填条目（id、members、relations、source 相同） 
✖ failing tests:
      1 expected: [Array],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## s3-delivery-conditional
✖ failing tests:
✖ 已验证委托报酬转为同一规范债权，托管不双计，取消不能退回已赚报酬 
      1 ✔ 预约互斥先拒绝且不扣款；收约方可取消自己的预约 (72.3ms)
      1 TypeError: Cannot read properties of undefined (reading 'length')

## s3-sv
✖ SV: live skill threshold, arrival, work hours and facility condition control derived services 
✖ SV: published smith derives services at a live workstation without changing his profile 
✖ failing tests:
      1 ✔ SV: derived recipe can actually be crafted with real inputs, time and conservation (73.6729ms)
      1 expected: true,
      1 expected: false,
      1 actual: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## w1-village-profiles
✖ failing tests:
✖ 聚落档案出版保留人物补充，重复零写入，篡改 details 被拒绝 
      2 ✖ 聚落档案出版保留人物补充，重复零写入，篡改 details 被拒绝 (20070.0374ms)
      1 Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/schedule.default[2].activity

## w1-villages-publish
✖ failing tests:
✖ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 
✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 
✖ 四村补丁预览执行engine结构校验，临时目录发布及重复零写入 
      2 ✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 (2523.9304ms)
      2 ✖ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 (2146.3852ms)
      2 Error: 人物补丁冲突或原档已过期 npc_hw_duanyan/schedule.default[2].activity
      1 ✔ 同编号正式事实冲突拒绝覆盖，非四村目录不随合并改变 (113.2998ms)
      1 Error: 公告栏公库未登记：loc_far_huancheng

## w2-reuse-publication
✖ failing tests:
✖ 旧战役world_upgrade保留钱物和历史，三册书逐键进入一次，升级后能付费购买研读 
✖ 正式ID冲突拒绝，已有零库存和残本不补，合并幂等 
✖ 隔离预演不写入，只追加T19的14条法术且重复零写入；正文/来源/L4篡改在写入前拒绝 
      2 ✖ 隔离预演不写入，只追加T19的14条法术且重复零写入；正文/来源/L4篡改在写入前拒绝 (34854.6315ms)
      2 ✖ 正式ID冲突拒绝，已有零库存和残本不补，合并幂等 (3.6493ms)
      2 [DOMException [DataCloneError]: Data cannot be cloned, out of memory.]
      1 [RangeError: Array buffer allocation failed]

## w2-s1
✖ failing tests:
✖ 隔离发布只追加S1的30条法术并保留后续批次，重复零写及篡改/冲突拒绝且不补库存 
      2 ✖ 隔离发布只追加S1的30条法术并保留后续批次，重复零写及篡改/冲突拒绝且不补库存 (31567.6847ms)
      1 [RangeError: Array buffer allocation failed]

## w2-s3
✖ failing tests:
✖ 灯祠巫祝安抚：收惊、安神、避阴、雾灯、归路灯标、避风寒按真实条件生效 
      1 ✔ 隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存 (4592.3355ms)
      1 expected: /许可/,
      1 actual: undefined,
      1 AssertionError [ERR_ASSERTION]: Missing expected rejection.

## w2-s4
✖ failing tests:
✖ 度亡：止波寺资格对雾滩低阶游魂施放，游魂进入已超度终态、记入牌位，种群扣减且不能用于复活 
✖ 灯祠祭礼：净场与镇窑灯礼作用于废窑瓦灯魅，净坛、灯前立誓与门印守戒按教派资格生效 
      1 ✔ 隔离发布只追加本批，保留其他条目，重复发布零写入，篡改或冲突拒绝且不回补库存 (4463.0481ms)
      1 Error: 有限区域没有可确认的低阶邪秽 @world_cast {"spell":"spell_s4_purify","permit":"ritual_permission:s4-116"} t=17107

## w3-journey
✖ failing tests:
✖ tests\w3-journey.test.mjs 
      1 Error: 公告栏公库未登记：loc_far_huancheng

## w3-trades
✖ failing tests:
✖ 候选 world_upgrade 保留已交易库存和人物变化，新的书及配方目录可检索 
      1 ✔ 候选矿镐从段岩真实有限库存购买，双方铜币与镐数量守恒且售罄拒绝 (1370.5164ms)
      1 Error: 公告栏公库未登记：loc_far_huancheng

## w4-b1
✖ failing tests:
✖ tests\w4-b1.test.mjs 
      1 Error: 发布骨架或引用事实已改变 boss_b1_ridge_warden

## w4-b2
✖ failing tests:
✖ w4-b2 隔离发布重发零写；候选与L4篡改在写入前拒绝 
      2 ✖ w4-b2 隔离发布重发零写；候选与L4篡改在写入前拒绝 (26193.2843ms)
      1 [RangeError: Array buffer allocation failed]

## w4-b3
✖ failing tests:
✖ w4-b3 隔离发布重发零写；候选与L4篡改在写入前拒绝 
      2 ✖ w4-b3 隔离发布重发零写；候选与L4篡改在写入前拒绝 (16767.7218ms)
      1 [RangeError: Array buffer allocation failed]

## wildlife-creatures-mixed
✖ failing tests:
✖ 隔离正式发布与重发零写；候选与L4篡改在写入前拒绝 
      2 ✖ 隔离正式发布与重发零写；候选与L4篡改在写入前拒绝 (27564.8769ms)
      1 ✔ 本批正式发布：中西各九的设计，已过L2者入正式目录，未过者留置；合并幂等且冲突拒绝 (935.6242ms)
      1 ✔ L1拒绝写繁殖的亡灵、漏写弱点和把文明族群写成猎物材料 (2.3355ms)
      1 [RangeError: Array buffer allocation failed]

