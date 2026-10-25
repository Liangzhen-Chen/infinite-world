// A3 第二轮 W 的本批事实；不是 setup 结论，也不在加载世界时执行。
// 新人物只使用题面给出的年龄和职业，不改任何已发布人物。
export const revision = 'a3-owner2-w-1';
export const draftRoot = 'world/drafts/a3-owner2-w';

const person = (id, name, age, occupation, location, notes, aliases = []) => ({
  id, name, aliases, age, ...(occupation ? {occupation} : {}), location,
  // 本批没有新增河湾常住户籍：不把独立场景人物列入固定起始居民。
  // location 仍为真实初始地点，setup 可按原生 ID 按需物化；不改原 58 人。
  scope: location.startsWith('bld_hw_') || location === 'loc_hw' ? null : location,
  coins: 0, inventory: {}, skills: [], services: [],
  flags: {minor: age < 18, romanceable: age >= 18}, notes,
});

const characterDetails = {
  npc_a3_repair_apprentice: {
    description: '这名学徒还带着少年人的瘦长轮廓。听见哪里咯噔作响，他会先歪头寻声，接着蹲下去看接缝；一被人催促，原本想好的话又容易挤成半句。他想把修理的道理弄明白，偏又不大愿意承认自己没看懂。',
    appearance: ['眉梢上扬，思索时会把额头皱起来', '指甲缝里常留着细白木屑', '蹲着看接缝时，两膝总收得很近'],
    voice: {register: '短句，先说看见的细处，急了会把句尾吞掉', habits: ['遇到疑问先说“等一下”', '解释时常拿声音或形状作比'],
      samples: ['等一下，这边的缝怎么比那边宽？', '听，刚才那一下像不像卡住了？', '我还没看明白，让我再瞧一眼。']},
    personality: {traits: ['好奇', '要面子'], flaws: ['被催时容易抢着作答，随后又要回头核对']},
    currentConcern: '想把看不懂的接缝问题问清楚，又怕被当成只会跟着点头。',
  },
  npc_a3_herb_apprentice: {
    description: '药铺学徒醒着时说话轻，辨东西却肯多看几遍。她会把相似的叶片翻到背面再比较，听人谈病情时也先等对方讲完。遇上拿不准的事，她宁愿把话停住；只是旁人一催，手指便不自觉地绞紧。',
    appearance: ['额前碎发贴着两侧鬓角', '看细物时眼睛眯得很窄', '拿不准主意时，两手指尖相互抵着'],
    voice: {register: '轻声慢句，把确知与疑问分开说', habits: ['不急着替别人把话接完', '犹豫时先重复对方最后一个词'],
      samples: ['让我把叶背也翻过来看看。', '这个我还拿不准，得问清楚。', '你先说完，我听着呢。']},
    personality: {traits: ['仔细', '安静'], flaws: ['受催促时容易把已经想好的问题也咽回去']},
    currentConcern: '想记住容易混淆的草叶差别，不愿为了应声而装作认得。',
  },
  npc_a3_apprentice_father: {
    description: '学徒的父亲问事有固定的次序：先问是谁亲眼看见，再问眼下究竟怎样。担心时他会把嘴唇抿得很紧，等别人停下才接话。有时同一处细节被他问过两遍，他自己也知道显得啰嗦，却怕漏掉要紧的一句。',
    appearance: ['眉间竖纹较深', '等人答话时嘴唇抿紧', '说到要紧处会把手掌摊平'],
    voice: {register: '平直、有次序，追问时仍把称呼说完整', habits: ['先问消息从哪里来', '把亲眼所见与猜测分开问'],
      samples: ['这话是谁亲眼看见的？', '我得知道孩子眼下怎样，你慢慢说。', '别急，刚才那一处再同我讲清楚。']},
    personality: {traits: ['慎言', '重条理'], flaws: ['担心孩子时会反复核问细节，让传话人着急']},
    currentConcern: '人在白石，想听到孩子近况中确实被看见的部分。',
  },
  npc_a3_apprentice_uncle: {
    description: '叔叔说话常比别人快半拍，听到孩子的事更容易抢着应声。真要他解释刚才那句话，他又会停下来摸摸下巴，把话重讲一遍。他愿意替家里人跑腿，但心急时总把“我来问问”说得像“这就办妥”。',
    appearance: ['下巴宽，停顿时会抬手摸一摸', '听人说话时身体常往前倾', '开口前很少先深吸气，句子说到后半才放慢'],
    voice: {register: '快而直，急时先答应跑腿，再回头问细节', habits: ['常以“我去问”开头', '发现说急了便停住重讲'],
      samples: ['我去问，你把地方说给我。', '我是孩子的叔叔，家里人。', '慢着，刚才那句我说急了，得再讲清楚。']},
    personality: {traits: ['热心', '急躁'], flaws: ['着急时容易把打算说成把握，细问才肯放慢']},
    currentConcern: '想替孩子做些眼前能做的事，又不愿耽搁找父亲核问。',
  },
  npc_a3_zhaosan: {
    description: '赵三站着时不爱正面对人，常侧过一点身，让目光落在来客的手边。问到交易，他先听物件和条件，价钱没有说拢便不接下一句。他不是全无耐心，只是讨厌别人省去商量，直接替他定了主意。',
    appearance: ['眼角有细密的日晒纹', '侧身站立时重心落在后脚', '沉默时下颌收紧，目光先落到对方手边'],
    voice: {register: '低声，词少，谈物件时一句只说一个条件', habits: ['先问“哪一件”', '遇到催促反而把话说得更慢'],
      samples: ['哪一件？先说清楚。', '旧事归旧事，这回怎么算，另谈。', '别伸手，话还没说完。']},
    personality: {traits: ['警醒', '执拗'], flaws: ['不喜欢被催，有时连可以商量的话也先冷着不答']},
    currentConcern: '想把别人要谈的条件听完整，免得一句含混的话被当作已经答应。',
  },
  npc_a3_laozhou: {
    description: '老周谈地里的事时很少先看人，倒会低头看脚下的泥。讲到垄沟，他的鞋尖跟着比划出走向；轮到算账，又把话放得很慢。他能忍住许多急话，但一遇到自己认定说不清的数目，常闷着不答，让对面摸不准他的意思。',
    appearance: ['两颊晒得深，鼻梁颜色稍浅', '说田垄时鞋尖会轻轻转向', '听账目时眉头压低，嘴角向内收'],
    voice: {register: '带停顿，谈庄稼时用眼前的形状作比', habits: ['先说田里的实情，再说账', '算数时把每个数重复一遍'],
      samples: ['霜一落，叶尖先软，远看倒还绿着。', '哪一笔租？数目你我当面核。', '你先把话说全，我不抢这一句。']},
    personality: {traits: ['能忍', '认实情'], flaws: ['不知怎样表达异议时会闷着不答，容易被当成默认']},
    currentConcern: '想把田里的损失与账上的数目分别讲明白，不愿只凭急话争高低。',
  },
};

export const people = [
  person('npc_a3_repair_apprentice', '十五岁的修理学徒', 15, '修理学徒', 'bld_hw_mill',
    '十五岁的修理学徒。', ['在场的十五岁学徒']),
  person('npc_a3_herb_apprentice', '十五岁的药铺学徒', 15, '药铺学徒', 'bld_hw_herbs',
    '十五岁的药铺学徒。父亲是监护人，叔叔不是监护人。', ['昏迷的未成年药铺学徒']),
  person('npc_a3_apprentice_father', '药铺学徒的父亲', 40, null, 'loc_bs',
    '药铺学徒的父亲，也是其监护人。', ['不在场的监护父亲']),
  person('npc_a3_apprentice_uncle', '药铺学徒的叔叔', 40, null, 'bld_hw_herbs',
    '药铺学徒的叔叔，不是其监护人。', ['在场的叔叔']),
  person('npc_a3_zhaosan', '赵三', 35, '猎户', 'loc_bs_nanshi',
    '猎户赵三。', ['猎户赵三']),
  person('npc_a3_laozhou', '老周', 50, '佃户', 'loc_hw',
    '佃户老周。', ['佃户老周']),
].map(row => ({...row, ...characterDetails[row.id]}));

const source = (row, detail) => ({row: `A3V2-${row}`, detail});
const personSources = [
  source(148, '题面为十五岁学徒；本卡 W1 明定修理学徒，不使用十九岁的阿砚。'),
  source(215, '题面及 instances 给定十五岁药铺学徒、四十岁父亲和四十岁叔叔；只有父亲有监护身份。'),
  source(215, '父亲四十岁且在白石；题面未指定职业，不补职业或同意。'),
  source(215, '叔叔四十岁且在药铺；亲属关系不等于监护权，不补治疗权限。'),
  source(217, '题面及 instances 给定三十五岁的猎户赵三；买剑及旧票状态交 G4 历史来源加载，不成为永久库存。'),
  source(220, '题面及 instances 给定五十岁的佃户老周；十亩租约、欠租和霜灾属于场景历史，不写进永久财物。'),
];

// 数值沿现有相邻目录物的参数；新用途与材质来自本卡和题面。
// 重量/目录价格不是题目 physical_stock 的单位换算，也不向任何人赠送库存。
export function itemRows(world) {
  const byId = id => world.items.find(row => row.id === id);
  const item = (id, name, reference, aliases, use, tags, unit) => {
    const base = byId(reference);
    return {id, name, aliases, quality: base.quality, weight: base.weight,
      durability: base.durability, basePrice: base.basePrice, scope: null, origin: base.origin,
      use, description: use, tags, ...(unit ? {unit} : {})};
  };
  return [
    item('item_wheat_seed', '麦种', 'item_wheat_grain', ['小麦种子'],
      '供播种的小麦种子，不是已经煮熟的食物。', ['seed', 'wheat'], '斤'),
    item('item_earthworm_bait', '蚯蚓饵', 'item_fishing_bait', ['蚯蚓鱼饵'],
      '以蚯蚓作钓饵，按条计数；与谷粒钓饵分开存放。', ['bait', 'earthworm'], '条'),
    item('item_bamboo_fishing_rod', '竹鱼竿', 'item_staff', ['竹竿', '竹钓竿'],
      '竹制钓竿；钓饵须另备。', ['tool', 'fishing_rod', 'bamboo']),
    item('item_herb_hoe', '药锄', 'item_hoe', ['采药锄'],
      '用于采挖药草的手工药锄。', ['tool', 'herb_hoe']),
  ];
}

export function contentEntries(world) {
  const mill = world.locations.find(row => row.id === 'bld_hw_mill');
  return [
    ...people.map((row, i) => ({id: row.id, kind: 'person', row, source: {...personSources[i],
      authoredDetails: '外貌、性格、说话习惯和当前烦恼为本批创作；不增加生日、亲历成功、职业能力、库存、同意或权利。'},
      boundary: '零现金、空库存、空技能/服务为新人物的保守初始值，不是题面历史财产。不新增出生日期、户籍、已获同意或任职。'})),
    ...itemRows(world).map((row, i) => ({id: row.id, kind: 'item', row,
      source: source([200, 203, 203, 202][i], '本卡 W5 明确要求该目录物；不将净麦粒确认作可播麦种，不用谷粒冒充蚯蚓。'),
      reference: structuredClone(world.items.find(x => x.id === ['item_wheat_grain', 'item_fishing_bait', 'item_staff', 'item_hoe'][i])),
      boundary: '仅新增目录定义；数量、资源账户、田地、种群和单位换算归 S5。目录参数沿 reference，价格不是本次报价。'})),
    {id: 'a3_w_mill_ownership', kind: 'location-owner', subject: mill.id,
      before: null, row: {owner: 'loc_hw'},
      source: {path: 'tools/world-content.mjs', entries: ['旧磨坊', '公共财产'],
        detail: '旧磨坊集体所有，属于村民共同体；陈柏保管钥匙。这里只补共同体所有权，不给阿砚产权，也不固化签署人。'},
      boundary: '管理签署人由 currentControllers → settlementGovernment 派生；原有工位、开放时间和共有人保持原样。'},
  ];
}

// 供 Q 卡对原 setup 别名做正式世界引用登记；这里不修改语料或 expected。
export const bindings = {
  'A3V2-148': {people: {a3v2_148_child: 'npc_a3_repair_apprentice'}},
  'A3V2-215': {people: {a3v2_215_patient: 'npc_a3_herb_apprentice',
    a3v2_215_father: 'npc_a3_apprentice_father', a3v2_215_uncle: 'npc_a3_apprentice_uncle'}},
  'A3V2-217': {people: {a3v2_217_buyer: 'npc_a3_zhaosan'}},
  'A3V2-220': {people: {a3v2_220_tenant: 'npc_a3_laozhou'}},
  'A3V2-200': {items: {a3v2_200_seeds: 'item_wheat_seed', a3v2_200_hoe: 'item_hoe'}},
  'A3V2-202': {items: {a3v2_202_hoe: 'item_herb_hoe'}},
  'A3V2-203': {items: {a3v2_203_bait: 'item_earthworm_bait', a3v2_203_rod: 'item_bamboo_fishing_rod'}},
  'A3V2-216': {collectives: {a3v2_216_council: 'faction_forestcouncil'}},
};

// 没有原文支持的数值、日期和管理人不猜。以下保留为待接入事实，绝非已发布内容。
export const pending = [
  {row: 'A3V2-218', point: 'W3', person: {id: 'npc_a3_bank_owner', name: '钱庄东家'},
    privatePremise: {alive: true, location: 'loc_bs', trappedAway: true}, bank: 'bank_hw_post',
    missing: ['原生人物要求年龄，题面未给；不以 keeper 沈渡冒充东家。', '钱庄所有权原生接点及异地受困来源由 Q/G 接入；停兑归 S5，未核实死亡传闻归 S6。'],
    source: source(218, '原文只确认东家活着、受困异地；玩家不知道后台真相。')},
  {row: 'A3V2-211', point: 'W4', collective: {id: 'faction_a3_hunters', name: '猎户会',
    kind: '行会', leader: 'npc_hw_yanzhe', entryFee: 50},
    missing: ['正式组织文件 world/lore/factions.json 不在 W 独占写入范围；交 Q/G 通过组织原生接口加载。',
      '本题合法会长和本人同意只取该题历史与 holds_office，不改严辙已发布档案；公库不等于会长钱袋。'],
    source: source(211, '题面给定猎户会、五十铜入会费及严辙本次合法会长身份；初始公库余额未给，不补余额。')},
  {row: 'A3V2-219', point: 'W4', collective: {id: 'faction_a3_cihang', name: '慈航寺', kind: '教会'},
    person: {id: 'npc_a3_cihang_abbot', name: '慈航寺住持', occupation: '住持'},
    missing: ['住持年龄未给，未虚构人物日期或新任职来源。', '正式组织文件超出 W 写入范围；不得把河边小屋改成正式寺院或借用另一宗派。'],
    source: source(219, '题面确认寺塔毁坏、住持募捐，寺院不是发行股份商号；没有同意按入股收木料。')},
  {row: 'A3V2-216', point: 'W4', collective: 'faction_forestcouncil',
    missing: ['复用 world/lore/factions.json 已发布的林地共同议会及领袖，不新建另一议会。',
      '题面 council 别名需 Q 原生绑定；林界/法域归 S4，古树/采伐资源账户归 S5，不加 owns 伪装法域。'],
    source: {path: 'world/lore/factions.json', id: 'faction_forestcouncil'}},
  {row: 'A3V2-231', point: 'W6',
    missing: ['loc_hw 是整座河湾村，不是唯一集会场地实体；题面没有给场地或管理权来源。',
      '不得据“陈柏管理会议/保管钥匙”赋予全村场所所有权，或让在场吴朔签许可；交 Q/G 保留原生有限许可缺口。'],
    source: source(231, '题面仅给村中集会处获准歌唱，没有给合法管理人或精确场地。')},
];

export const laterStages = [
  {row: 'A3V2-200', stage: 'S5', point: '两亩播种、麦种四斤 same_stock 与单位换算'},
  {row: 'A3V2-202', stage: 'S5', point: '二十株草药资源点、采集结算及 same_stock'},
  {row: 'A3V2-203', stage: 'S5', point: '二十条鲫鱼种群、蚯蚓饵次数/停止条件及 same_stock'},
  {row: 'A3V2-216', stage: 'S4', point: '林地共同议会真实林界和法域'},
  {row: 'A3V2-216', stage: 'S5', point: '古树与采伐资源账户'},
  {row: 'A3V2-218', stage: 'S5', point: '准备金归零和暂停兑付的原生状态'},
  {row: 'A3V2-218', stage: 'S6', point: '未核实溺亡传闻；后台存活/受困事实不泄漏'},
];
