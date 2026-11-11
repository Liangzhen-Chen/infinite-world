// 物品正文 L1（tools/w3-item-check.mjs）：storage 越界、骨架外器具/包装/收纳、制作痕迹与配方不符。
// 全部用内嵌的最小目录、配方与物品骨架（夹具），不读真实数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import {itemTextIssues, storageIssues} from '../tools/w3-item-check.mjs';

const CATALOG = [
  {id: 'pot', name: '厚底煮锅', tags: ['container']},
  {id: 'hammer', name: '锻工手锤', tags: ['tool']},
  {id: 'tongs', name: '长柄铁钳', tags: ['tool']},
  {id: 'iron', name: '铁料', tags: []},
  {id: 'charcoal', name: '木炭小袋', tags: ['fuel']},
  {id: 'chain', name: '连扣铁短链', tags: [], shelfLifeDays: null},
  {id: 'wheat', name: '净麦粒', tags: [], shelfLifeDays: 180},
  {id: 'jar', name: '陶罐', tags: ['container', 'ceramic']},
  {id: 'box', name: '分格木箱', tags: [], shelfLifeDays: null},
  {id: 'cork1', name: '软木塞甲', tags: [], use: '塞紧瓶口的软木塞'},
  {id: 'cork2', name: '软木塞乙', tags: []},
  {id: 'cork3', name: '软木塞丙', tags: []},
  {id: 'bottle', name: '小口瓶', tags: ['container']},
];
const RECIPES = [{id: 'recipe_chain', name: '制作连扣铁短链', workstation: 'smithing', tools: ['hammer', 'tongs'], materials: [{item: 'iron', amount: 1}, {item: 'charcoal', amount: 2}], output: {item: 'chain'}, processFacts: '铁料入炉烧红后锻打成环，穿接收拢。'},
  {id: 'recipe_bottle', name: '制作小口瓶', workstation: 'pottery', tools: [], materials: [{item: 'cork3', amount: 1}], output: {item: 'bottle'}, processFacts: '软木塞按入瓶口。'}];
const CTX = {catalog: CATALOG, catalogRecipes: RECIPES};
const entry = id => CATALOG.find(item => item.id === id);
const check = (id, draft) => itemTextIssues(draft, entry(id), CTX);
const join = (id, draft) => check(id, draft).join(' ');

test('storage：一般存放建议放行', () => {
  assert.deepEqual(check('wheat', {storage: '避潮、避晒，放阴凉处，勿重压，避霜冻。'}), []);
});

test('storage：具体处置做法、后果说法判错', () => {
  assert.match(join('wheat', {storage: '受潮后摊开阴干。'}), /storage：storage 出现具体处置做法「受潮后」/);
  assert.match(join('wheat', {storage: '放冷水里镇着。'}), /具体处置做法「冷水」/);
  assert.match(join('wheat', {storage: '每隔数日翻晾。'}), /具体处置做法/);
  assert.match(join('wheat', {storage: '置阴凉处，否则会发霉。'}), /后果说法「否则」/);
  assert.match(join('wheat', {storage: '勿压折，以免变形。'}), /后果说法「以免」/);
  assert.match(join('wheat', {storage: '受潮后易发霉。'}), /具体处置做法|后果说法/);
});

test('storage：期限须与 shelfLifeDays 一致；骨架为空不写期限也不写无期限', () => {
  assert.match(join('wheat', {storage: '可存放三十天。'}), /期限「三十天」，与骨架保存期 180 天不符/);
  assert.deepEqual(check('wheat', {storage: '置阴凉处，可存放一百八十天。'}), []);
  assert.match(join('chain', {storage: '可存放三十天。'}), /骨架没有保存期/);
  assert.match(join('chain', {storage: '无期限，可久存。'}), /期限类说法/);
  assert.match(join('wheat', {storage: '耐存半年。'}), /期限类说法/);
  assert.deepEqual(check('chain', {storage: '避潮，防压。'}), []);
});

test('骨架外包装与收纳：布袋、木架、陶罐、木盒', () => {
  assert.match(join('wheat', {storage: '装入布袋，另放木架。'}), /骨架外包装、收纳或容器「布袋」/);
  assert.match(join('wheat', {storage: '装入布袋，另放木架。'}), /「木架」/);
  assert.match(join('wheat', {description: '成色匀净，倒入陶罐保存。'}), /陶罐/);
  assert.match(join('wheat', {inspection: '置木盒内检查。'}), /木盒/);
  assert.match(join('chain', {description: '用布包裹。'}), /泛称器具「布」/);
  // 依据：物品自己的名字（分格木箱）、声明另备。
  assert.deepEqual(check('box', {description: '木箱内分有数格，木箱外壁平整。'}), []);
  assert.deepEqual(check('wheat', {storage: '容器须使用者另备，不随货提供。'}), []);
  assert.deepEqual(check('wheat', {storage: '不用布袋，直接摊放。'}).filter(m => /布袋/.test(m)), [], '否定不算引入');
});

test('制作痕迹：没有配方的物品不写；有配方须与配方一致', () => {
  assert.match(join('wheat', {description: '颗粒经锻打回火，质地坚韧。'}), /制作痕迹「锻打」，但这件物品没有以它为产出的配方/);
  assert.match(join('wheat', {inspection: '粒面有刨面痕迹。'}), /制作痕迹「刨面」/);
  assert.deepEqual(check('chain', {description: '环口经锻打收拢，锤痕清晰。'}), [], '配方 processFacts 与工具里有锻、锤');
  assert.match(join('chain', {description: '链面刨面平整。'}), /制作痕迹「刨面」，配方骨架.*没有对应的「刨」/);
  assert.match(join('chain', {inspection: '环口留有针脚。'}), /制作痕迹「针脚」/);
  assert.deepEqual(check('chain', {description: '两刃并拢看缝，缝线应均匀。'}), [], '缝线在用途与检查里是名词，不是制作痕迹');
  assert.deepEqual(check('wheat', {description: '颗粒饱满，不经锻打。'}), [], '否定不算');
});

test('骨架外器具（全名与两字以上词形）；单字器具词在物品正文里不判', () => {
  assert.match(join('wheat', {description: '常用煮锅盛放。'}), /骨架外器具「煮锅」/);
  assert.deepEqual(check('wheat', {description: '可剪作垫片，穿针引线。'}), [], '剪、针单字是动词或部位，交 L4');
  assert.deepEqual(check('chain', {description: '厚底煮锅旁放着一条长柄铁钳。'}).filter(m => /铁钳/.test(m)), [], '配方工具里有铁钳');
});

test('catalog 缺失抛错；storageIssues 可单独使用', () => {
  assert.throws(() => itemTextIssues({storage: '避潮。'}, entry('wheat'), {}), /catalog/);
  assert.deepEqual(storageIssues('避潮。', {shelfLifeDays: null}), []);
});

test('用途表述：别的器物在物品自己的事实字段或它作为材料、工具的配方里有出处，才不判', () => {
  // 出处一：物品自己的 use 字段写了瓶口。
  assert.deepEqual(check('cork1', {description: '便于按入瓶口。'}), []);
  // 出处二：物品作为 materials 出现在制作小口瓶的配方里，产出物名含瓶。
  assert.deepEqual(check('cork3', {description: '便于按入瓶口。'}), []);
  // 没有出处：照判，“用于……”句式不是整类豁免。
  assert.match(join('cork2', {description: '便于按入瓶口。'}), /泛称器具「瓶」/);
  assert.match(join('cork2', {description: '用于塞紧陶罐。'}), /陶罐/);
  assert.match(join('cork1', {description: '用于塞紧陶罐。'}), /陶罐/, 'use 里写的是瓶，不是陶罐');
});

test('制作痕迹只在“被做成时留下的状态”框架里判；用途句、功能句、名词部件不判', () => {
  for (const text of ['去核后可鲜食，也可煮制。', '用于剥瓣捣碎调味。', '供小型装饰压纹。', '供染色，煎取染液。', '刃面平整，削出木面凹弧，配木槌使用。', '用于轻收毛刺，不把崩缺刀刃磨成新刃。', '果身饱满，缝合线清晰。', '钢制短喙与锤面对置。', '每张裁成窄长片使用。'])
    assert.deepEqual(check('wheat', {description: text}), [], text);
  // 真例子：描述被做成时留下的状态，配方里没有对应工序，照判。
  assert.match(join('chain', {description: '毡面保留压制时的细密纤维走向。'}), /制作痕迹「压制」，配方骨架.*没有对应的「压」/);
  assert.match(join('wheat', {description: '粉粒以白垩捣制而成。'}), /制作痕迹「捣制」/);
  assert.match(join('wheat', {description: '表面留有锻打后的细纹。'}), /制作痕迹「锻打」/);
  assert.match(join('wheat', {inspection: '边口留有锤痕。'}), /制作痕迹「锤痕」/);
});

test('storage：回避框架里的动作不是处置做法；真处置照判', () => {
  for (const text of ['置于干燥处，避免受潮、浸水与重压。', '置于干燥通风处，避免暴晒与浸水。', '勿暴晒，勿浸水。', '防压，防浸水。'])
    assert.deepEqual(check('wheat', {storage: text}), [], text);
  assert.match(join('wheat', {storage: '置于阴凉处，加盖遮尘。'}), /具体处置做法「加盖」/);
  assert.match(join('wheat', {storage: '逾时弃置。'}), /具体处置做法「弃置」/);
  assert.match(join('wheat', {storage: '置于阴凉处，盖好防尘防虫。'}), /具体处置做法「盖好」/);
  assert.match(join('wheat', {storage: '晾干后折叠，置干燥处避潮。'}), /具体处置做法「晾干」/);
});

test('如实说明容器不随货：不在范围内、不随货、另备、不含都不算引入；正面写骨架外容器照判', () => {
  for (const text of ['盛装容器不在本件范围内。', '容器不随货提供。', '盛装容器须使用者另备。', '不含容器，不附包装。'])
    assert.deepEqual(check('wheat', {description: text}), [], text);
  assert.match(join('wheat', {description: '装在陶罐里出售。'}), /陶罐/);
  assert.match(join('wheat', {description: '盛入容器后带走。'}), /容器/);
});

test('制作痕迹：痕迹词后紧跟成形状态谓词也判；部件名词、用途句不判', () => {
  for (const text of ['链面刨面平整。', '表面磨成光洁。', '边口削出齐整，棱角匀称。'])
    assert.ok(check('chain', {description: text}).some(message => /制作痕迹/.test(message)), text);
  assert.match(join('wheat', {description: '刨面平整，边口齐整。'}), /制作痕迹「刨面」，但这件物品没有以它为产出的配方/);
  for (const text of ['钢制短喙与锤面对置。', '去核后可鲜食，也可煮制。', '果身饱满，缝合线清晰。'])
    assert.deepEqual(check('wheat', {description: text}), [], text);
});

test('storage：回避词与处置词之间只能是被回避的并列对象', () => {
  for (const text of ['防尘加盖。', '避晒，盖好。', '防虫盖严。', '勿暴晒，晾干后折叠。'])
    assert.match(join('wheat', {storage: text}), /具体处置做法/, text);
  for (const text of ['置干燥处，避免受潮、浸水与重压。', '避免暴晒与浸水。', '勿浸水。', '防压及浸水。'])
    assert.deepEqual(check('wheat', {storage: text}), [], text);
});

test('storage：同句里前一个处置词在回避或否定框架里，不放过后面的真处置', () => {
  assert.match(join('wheat', {storage: '勿浸水，晾干后折叠。'}), /具体处置做法「晾干」/);
  assert.match(join('wheat', {storage: '不要泡水，受潮后摊开阴干。'}), /具体处置做法「(?:受潮后|摊开|阴干)」/);
  assert.match(join('wheat', {storage: '避免浸水，定期翻面。'}), /具体处置做法「(?:定期|翻面)」/);
  assert.deepEqual(check('wheat', {storage: '勿浸水，避免暴晒与泡水。'}), []);
});
