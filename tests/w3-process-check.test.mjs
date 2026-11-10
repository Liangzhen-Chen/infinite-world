// w3-journey 配方工序的 L1 确定性检查：骨架外器具、用火须交代火源（tools/w3-process-check.mjs）。
// 正文取自 L4 前后真实草稿（world/drafts/w3/journey/recipes），骨架由 economyW3Journey 生成；不联网、不调模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {economyW3Journey} from '../world/design/economy-w3-journey.mjs';
import {journeyContext} from '../tools/w3-journey.mjs';
import {validateTradesDraft} from '../tools/w3-trades.mjs';
import {processIssues,buildVocabulary,utensilHeads,WORKSTATION_FACILITIES} from '../tools/w3-process-check.mjs';

// 漏判样例：L2 放过、L1 应拦下的真实正文。
const MISSED = {
  caraway_oat_crust: "取香芹籽置于案板，以切刀刀背逐粒压裂，令香气散出。将燕麦粉与粗盐倒入厚底煮锅，加入清水，用长柄搅糊板顺同一方向搅成稠糊，再拌入压裂的香芹籽至分布均匀。干木刨屑作燃料引火，小灶上置厚底煮锅，以文火加热，用搅糊板不断翻动，使糊中水分收去、渐成团块。将团块按薄片摊在锅底，逐片烘至两面干硬、边缘微翘，取出后所有成片合为一份交付。余下碎屑弃置，工具保留。全程80分钟。",
  pear_vinegar_slice: "取脆肉梨一份，用案上切刀剖开、剔去果核，再切成薄片。将滤蜜小罐份与两瓶酸果醋倒入厚底煮锅，持偏柄木匙搅至蜜散匀，随即下梨片短浸，使片片沾匀蜜醋。浸好后以木匙沿锅缘舀取梨片，装入使用者另备的容器；锅内余汁弃置，不随货交付。切刀与木匙用后拭去残汁收存。全程90分钟。",
  bottle_divider_crate: "取两块风干松木短板，用窄框木锯按格位宽度锯成箱壁与隔条短料，锯口贴齐板边推进。以直口木凿配枣木敲凿槌在箱壁内侧凿出接槽，槽深与隔条厚度相当，凿刃朝离手方向下切。将隔条逐根嵌入接槽试合，轻敲校正至格间匀齐。把小铁钉分点钉在箱壁与隔条交接处，每处先立稳再钉入，避免钉裂板边。软木薄片剪成与格底相合的垫片，逐格铺入垫平。空箱交付，不附瓶。全程260分钟。",
  broadbean_garlic_mash: "干蚕豆瓣置于厚底煮锅，注入规定清水浸泡至软，连水煮透。晒皮蒜头剥瓣去皮，以案上切刀切成细粒，投入锅中同煮。粗盐以刀背压碎后撒入，搅匀。煮至豆瓣轻压即散，用偏柄木匙沿锅缘翻压成泥，挑出残皮弃置；锅底焦屑刮下弃去，不混入泥中。木匙柄偏，便于贴锅壁舀取翻动。全程100分钟。",
  redwood_dye: "取厚底煮锅置于小灶，以干木刨屑引火，将规定份清水注入锅中，投入红染木碎片，以温火煎出颜色。煎毕，把宽口滤布搭在自备承接容器上，将染液滤过布面，去净碎屑。随后把工艺明矾粒溶入滤出的染液，用偏柄木匙沿锅缘搅匀，使明矾与染液充分混合。所得染液非食用、非药品，盛装容器须使用者另备，不随货提供。滤布上残渣与余下刨屑弃置，煮锅、木匙、滤布保留。全程100分钟。",
  seal_thread_bundle: "将麻线团退绕，按封结所需剪成短段，逐段薄拉过蜂蜡块表面，使蜡层附于线身。以平脊骨压片的圆端沿线束反复压顺，令蜡入捻隙、线体平伏。再用短锋修羽刀齐平各段线端，抖去碎屑，将线束与剩余蜡块一并收拢。全程五十五分钟，得卷札封结线一份；剩余蜡随线束交付，线束不具官方印章效力。",
  forged_chain_short: "将两公斤铁料按环数分作等长短条，逐条入炉烧至可锻，用长柄铁钳夹出置于砧面，以锻工手锤把每根条卷成环并趁热穿接上一环，接口叠合后锤击收拢，使相邻环相扣闭合。全部环穿接完毕，持圆身孔锉沿孔轴推拉，冷锉各环接缝与孔缘，去除毛刺并校圆。总耗时三百三十分钟，仅得一段短链，不承诺吊人负载；炉内炭屑不混入产品，余料弃置，三件工具保留。",
  mutton_turnip_stew: "取去骨羊肉与带皮芜菁，各在案上用切刀切成入口大小的块，芜菁的根须与坏斑先削去。切完生肉后，以干布面把刀面擦净，生熟分开。厚底煮锅置于小灶上，倾入配额清水，下羊肉与芜菁，投粗盐，取干木刨屑引火，慢煨至肉熟根软。其间用偏柄木匙沿锅缘翻动，拨去浮沫。锅壁破裂或内锈脱落时需维修。成煨一份，余料弃置，工具保留。全程120分钟。",
};
// 已严格 L4 通过的正文：不得误报。
const CLEAN = {
  mustard_relish: "取黄芥籽置于厚底煮锅干燥锅底，以案上切刀刀背分次压裂，每压一轮拨拢再压，使多数籽粒裂开而仍存粗粒。将酸果醋与粗盐倒入锅中，以偏柄木匙翻拌，令盐粒散开、醋液浸没籽粒。拌好后留在锅内静置吸润，中途再用木匙翻两次，使上下籽粒吸润均匀。全程不研成细粉，不另加染料或药材，保留颗粒感。完成后以木匙舀入待装容器，容器须使用者另备，不随货提供；锅内余料弃置，木匙与切刀保留。全程40分钟。",
  poppy_rye_crisp: "将细筛黑麦粉倒入厚底煮锅，加入清水，用长柄搅糊板顺同一方向搅成无干粉的稠糊，再拌入全部食用罂粟籽至分布均匀。取菜籽油薄薄润过锅底，以干木刨屑引火，小灶上分批摊薄稠糊，每批摊平后烘至饼身硬挺、内部干爽再起出。全程不加酵种。余油与散落籽粒弃置，煮锅与搅糊板留用。全程95分钟。",
  beet_barley_pot: "取红根甜菜就案上切刀削去外皮，切成小丁，根皮弃置不用。脱壳大麦倒入厚底煮锅，注入配额清水，以干木刨屑引火，火源只取这份刨屑，煮至麦粒软透。用偏柄木匙把甜菜丁拌入锅中，继续煨至菜丁熟软、红汁浸入麦粒，中途不另添水。撒入粗盐调味，以木匙沿锅缘搅匀，使红汁与麦饭相合。停火后仍用木匙将麦饭盛出，即得一份红根麦饭；余下刨屑与根皮弃置，锅、刀、匙留用。全程90分钟。",
  ledger_cover: "将薄鞣山羊革平铺，以短刃裁革剪逐段合剪，修去边角使对折后两页齐平。革料对折，用缝革扁锥沿折口两侧刺出扁缝孔，粗眼缝针穿细捻麻线依次缝边，针脚收紧。黄铜窄带以弯柄金属剪短行程分次合剪，分出四枚角片，各片对折夹住封皮四角，压合贴边。成品只是一副封皮，账页另备。全程180分钟。",
  small_bell_frame: "在铁匠铺砧台上，用弯柄金属剪把黄铜窄带短行程分次合剪，剪出一段作弯框、一段作悬片。框料以锻工手锤在砧上轻敲弯成弧形，两端对齐。悬片边缘用金属剪修齐，再用短身冲子配锻工手锤在砧台承托下于悬片与框端各冲小孔，孔位对齐。取退火铁线，用窄嘴饰线钳绕成挂环，穿入悬片与框端小孔，把悬片悬在框内，钳嘴夹合环口。晃动时悬片相碰发声，不警示远处敌情。剪下的铜屑与铁线余头弃置，工具保留。全程240分钟。",
  steel_gouge_tip: "用长柄铁钳夹住钢条置于炉上，以木炭为火源加热至可锻，移上砧台，用锻工手锤反复锤打，把刃端锻成卷曲的圆口，柄舌一并留出成形。锻毕趁热将圆口浸入清水淬口，再回火使刃口略带韧性。冷却后用圆身孔锉沿孔轴推拉，修整内弧至圆顺，换细面刃磨石磨利刃口。最后把柄舌插入小工具木柄装牢，检查刃口与柄接合。锻打与淬火中掉落的氧化皮、锉屑与磨浆均弃置，工具保留。全程320分钟。",
};

const world = await loadWorld();
const bones = economyW3Journey(world);
const recipe = id => bones.recipes.find(row => row.id === 'recipe_w3c_' + id);
const issues = id => processIssues((MISSED[id] ?? CLEAN[id]), recipe(id), journeyContext(world, bones, recipe(id)));

test('词表从目录派生：器具、燃料不写死条目', () => {
  const catalog = [...world.items, ...bones.items];
  const vocab = buildVocabulary(catalog, [...world.recipes, ...bones.recipes]);
  assert.ok(vocab.heads.has('厚底煮锅') && vocab.heads.has('煮锅'), '器具全名与两字中心词来自目录');
  assert.ok(vocab.heads.has('剪') && vocab.heads.has('锯'), '手工具的单字中心词来自目录');
  assert.ok(!vocab.heads.has('规') && !vocab.heads.has('尺'), '日常常用字不单独当器具词');
  const fuelIds = catalog.filter(item => item.tags?.includes('fuel')).map(item => item.id);
  assert.deepEqual([...vocab.fuels.keys()].sort(), fuelIds.sort());
  assert.deepEqual(utensilHeads('平脊骨压片'), ['压片'], '量词尾字不单独当中心词');
  assert.ok(['cooking', 'smithing', 'woodworking', 'weaving'].every(kind => WORKSTATION_FACILITIES[kind]?.length));
  for (const kind of new Set(bones.recipes.map(row => row.workstation))) assert.ok(WORKSTATION_FACILITIES[kind], '每种工作台都有设施表：' + kind);
});

test('caraway_oat_crust：案板不在骨架里', () => {
  const found = issues('caraway_oat_crust');
  assert.equal(found.length, 1);
  assert.match(found[0], /骨架外器具「板」.*案板/);
  assert.match(found[0], /修复/);
});

test('pear_vinegar_slice：拭去需要布，骨架没有', () => {
  const found = issues('pear_vinegar_slice');
  assert.equal(found.length, 1);
  assert.match(found[0], /动作「拭去」.*布巾/);
});

test('bottle_divider_crate：没有剪类工具却剪成垫片', () => {
  const found = issues('bottle_divider_crate');
  assert.equal(found.length, 1);
  assert.match(found[0], /骨架外器具「剪」/);
});

test('seal_thread_bundle：同类，另一条剪成短段也被拦', () => {
  assert.match(issues('seal_thread_bundle').join(' '), /骨架外器具「剪」/);
});

test('broadbean_garlic_mash：骨架有燃料但正文没交代火源', () => {
  const found = issues('broadbean_garlic_mash');
  assert.equal(found.length, 1);
  assert.match(found[0], /用火.*没有交代火源/);
});

test('forged_chain_short：锻打入炉，木炭在骨架但正文没说作火源', () => {
  assert.match(issues('forged_chain_short').join(' '), /没有交代火源/);
});

test('mutton_turnip_stew：干布与擦净，骨架没有布', () => {
  const found = issues('mutton_turnip_stew').join(' ');
  assert.match(found, /泛称器具「干布」/);
  assert.match(found, /动作「擦净」/);
});

test('redwood_dye：滤进另备容器后又沿锅缘搅匀', () => {
  const found = issues('redwood_dye');
  assert.equal(found.length, 1);
  assert.match(found[0], /另备容器只作交付终点/);
});

for (const id of Object.keys(CLEAN)) test('正例不误报：' + id, () => assert.deepEqual(issues(id), []));

test('另备容器如实说明不算引入：声明与装入在同一句', () => {
  const entry = recipe('mustard_relish');
  assert.ok(/另备/.test(CLEAN.mustard_relish) && /容器/.test(CLEAN.mustard_relish));
  assert.deepEqual(processIssues(CLEAN.mustard_relish, entry, journeyContext(world, bones, entry)), []);
  const bare = CLEAN.mustard_relish.replace('容器须使用者另备，不随货提供', '再盖好备用');
  assert.ok(processIssues(bare, entry, journeyContext(world, bones, entry)).some(message => /骨架外器具/.test(message)), '去掉另备声明后，容器与盖就是引入');
});

test('骨架无燃料却写用火：错误', () => {
  const entry = recipe('mustard_relish');
  const fuelless = recipe('beet_barley_pot');
  const stripped = {...fuelless, materials: fuelless.materials.filter(row => !world.items.concat(bones.items).find(item => item.id === row.item)?.tags?.includes('fuel'))};
  assert.ok(stripped.materials.length < fuelless.materials.length);
  const found = processIssues(CLEAN.beet_barley_pot, stripped, journeyContext(world, bones, fuelless));
  assert.ok(found.some(message => /materials 里没有燃料/.test(message)));
  assert.deepEqual(processIssues(CLEAN.mustard_relish, entry, journeyContext(world, bones, entry)), []);
});

test('否定的加热不算用火', () => {
  const entry = recipe('garlic_butter');
  const found = processIssues('蒜瓣切细，与软化黄油压拌，全程不加热，也不加酥油。', entry, journeyContext(world, bones, entry));
  assert.ok(!found.some(message => /用火/.test(message)));
});

test('接入 validateTradesDraft：命中进 errors，正例无新增错误', () => {
  const block = {names: [], realPeople: []};
  const entry = recipe('caraway_oat_crust'), context = journeyContext(world, bones, entry);
  const result = validateTradesDraft({id: entry.id, process: MISSED.caraway_oat_crust}, entry, block, context);
  assert.ok(result.errors.some(message => /骨架外器具「板」/.test(message)));
  const clean = recipe('steel_gouge_tip');
  const ok = validateTradesDraft({id: clean.id, process: CLEAN.steel_gouge_tip}, clean, block, journeyContext(world, bones, clean));
  assert.deepEqual(ok.errors, []);
});

test('context 的 catalog 不可枚举：不进指纹与审核请求', () => {
  const entry = recipe('steel_gouge_tip'), context = journeyContext(world, bones, entry);
  assert.ok(Array.isArray(context.catalog) && context.catalog.length > 0);
  assert.ok(!Object.keys(JSON.parse(JSON.stringify(context))).includes('catalog'));
});

test('误报回归：架子、吸拭、翻折盖住、成品名里的动作字', () => {
  const entry = recipe('redwood_dye'), context = journeyContext(world, bones, entry);
  const text = '干木刨屑两份引火，仅作灶下燃料与吸拭漏液之用。装好后把架子放平，包边翻折盖住毡边。';
  const found = processIssues(text, entry, context);
  assert.ok(!found.some(message => /吸拭|架子|盖住|子」/.test(message)), found.join(' '));
});
