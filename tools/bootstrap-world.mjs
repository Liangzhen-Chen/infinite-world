import fs from 'node:fs/promises';
const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
const slugs = ['linsui','ayan','chenbai','xuling','duanyan','duanhe','wushuo','taozhi','zhengshuisheng','luowei','sulan','gucen','meiling','yanzhe','luqing','hezhou','anhuai','shendu'];
const locations = [
    ['loc_hw', '河湾村', [0, 0]], ['bld_hw_qingdeng', '青灯酒馆', [0, 0]],
    ['bld_hw_mill','旧磨坊',[0.2,0]], ['bld_hw_council','村务屋',[0.1,0.1]], ['bld_hw_riverhome','河边小屋',[0.1,-0.1]],
    ['bld_hw_forge','铁匠铺',[0.3,0]], ['loc_hw_northwood','北林边',[2,0]], ['bld_hw_herbs','药草院',[0.2,0.2]],
    ['loc_hw_dock','旧渡口',[0,-0.2]], ['loc_hw_fields','南田',[0,-1]], ['bld_hw_weaving','织坊',[0.4,0]],
    ['loc_hw_gate','村口',[0.5,0]], ['loc_hw_orchard','公用果园',[0.4,0.4]], ['loc_bs','白石镇',[24,0]],
    ['bld_hw_school','小学堂',[0.4,0.1]], ['loc_hw_apiary','南坡蜂场',[0,-2]], ['bld_hw_post','小驿站',[0.6,0]],
    ['site_beilin_tower','北林废观测塔',[6,0]], ['loc_yandu','雁渡',[0,-32]], ['loc_capital','王都',[440,0]],
];
const geo = locations.map(([id, name, coordinates]) => ({ id, name, coordinates, parent: id === 'loc_hw' ? null : id === 'loc_bs' ? null : 'loc_hw',
    scope: 'loc_hw', aliases: id === 'bld_hw_qingdeng' ? ['河湾村·青灯酒馆','青灯酒馆前厅'] : id === 'site_beilin_tower' ? ['废观测塔'] : [],
    terrain: '平地', openHours: id.startsWith('bld_') ? [420, 1350] : [0, 1440] }));
const npcs = Object.entries(seed.state.npcs).map(([name, npc], i) => ({ id: `npc_hw_${slugs[i]}`, name, aliases: name === '林穗' ? ['林穗姐','林老板','老板娘','穗姐','青灯的老板'] : [],
    scope: name === '严辙' ? 'loc_bs' : 'loc_hw', ...npc, location: geo.find(place => place.name === npc.location)?.id,
    age: name === '段禾' ? 16 : name === '林穗' ? 34 : 30, flags: { minor: name === '段禾', romanceable: name !== '段禾' },
    coins: name === '林穗' ? 450 : 200, inventory: {}, skills: name === '许苓' ? ['skill_light'] : [],
    services: name === '许苓' ? ['spell_light','profession_mage'] : [],
    traits: [name === '林穗' ? '务实' : '原档待扩充'], intelligence: { level: 2, growth: 0 },
}));
const items = [
    ['item_ration','干粮',3,0.2,['口粮']], ['item_staff','旧木杖',4,1,['木杖']], ['item_bag','行囊',10,0.5,[]], ['item_clothes','普通衣服',8,0.5,[]],
    ['item_bread','面包',2,0.15,['热面包']], ['item_wood','木料',4,2,[]], ['item_stone','石料',3,3,[]], ['item_iron','铁料',12,2,[]],
    ['item_herb','药草',3,0.1,[]], ['item_resin','树脂',2,0.1,[]],
].map(([id,name,basePrice,weight,aliases]) => ({id,name,basePrice,weight,aliases,quality:'木',durability:100,scope:null}));
const combat = ['战士','骑士','魔武士','侠客','刺客','弓箭手','法师','祭司','僧侣','巫师','道士','元素召唤师'];
const professionSlugs = ['warrior','knight','spellblade','swordsman','assassin','archer','mage','priest','monk','witch','taoist','summoner'];
const life = ['农夫','猎人','渔夫','厨师','裁缝','铁匠','木匠','建筑师','炼金师','园艺师','鉴定师','地理师','商人','音乐家','雕刻师','驯兽师','画师','挖掘者','首饰工匠','医师','制皮匠','酿酒师','抄写员'];
const professions = [...combat.map((name,i) => ({id:`profession_${professionSlugs[i]}`,name,kind:'combat',aliases: name === '侠客' ? ['游侠'] : name === '弓箭手' ? ['弓手'] : [],fee:30,minimumLevel:10})),
    ...life.map((name,i) => ({id:`profession_life_${i}`,name,kind:'life',aliases:name==='音乐家'?['吟游诗人']:[],fee:20,minimumLevel:1}))];
const skill = {id:'skill_light',name:'照明术',attribute:'精神',profession:'profession_mage',aliases:[],scope:null};
const spell = {id:'spell_light',name:'照明术',skill:'skill_light',mp:1,materials:[],duration:60,minutes:1,difficulty:10,stage:0,
    effect:'近处一个物体发出柔光一小时，不造成伤害。',learnFee:12,learnMinutes:120,teachers:['npc_hw_xuling'],scope:null,aliases:[]};
const routes = geo.filter(place => place.id !== 'loc_hw' && !['loc_bs','loc_yandu','loc_capital'].includes(place.id)).map(place => ({
    id:`route_${place.id}`,from:'loc_hw',to:place.id,lengthKm:Math.hypot(...place.coordinates),terrainMultiplier:1,modes:['walk','horse'],closedSeasons:[],toll:0,risk:0,
}));
routes.push({id:'route_hw_bs',from:'loc_hw',to:'loc_bs',lengthKm:24,terrainMultiplier:1,modes:['walk','horse','cart'],closedSeasons:[],toll:0,risk:1});
routes.push({id:'route_hw_yandu',from:'loc_hw',to:'loc_yandu',lengthKm:32,speedKmh:8,modes:['boat'],closedSeasons:[],toll:10,risk:1});
routes.push({id:'route_bs_capital',from:'loc_bs',to:'loc_capital',lengthKm:416,terrainMultiplier:1,modes:['walk','horse','cart'],closedSeasons:[],toll:0,risk:2});
const datasets = { 'world/people/baseline.json':npcs, 'world/geo/locations.json':geo, 'world/geo/routes.json':routes,
    'world/meta/items.json':items,'world/meta/professions.json':professions,'world/meta/skills.json':[skill],'world/meta/spells.json':[spell] };
for (const [file,data] of Object.entries(datasets)) await fs.writeFile(file,JSON.stringify(data,null,2));
console.log(JSON.stringify({npcs:npcs.length,locations:geo.length,items:items.length,professions:professions.length,scope:'阶段1兼容性种子，未达到内容数量验收'}));
