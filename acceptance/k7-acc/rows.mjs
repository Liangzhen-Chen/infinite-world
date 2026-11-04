// 矩阵的行：先由本体推出"能被持有的实体模板"，再按模板的 kinds 与世界里实际存在的实体细分。
// 每行带一个"真实取得"过程：只用游戏动作让玩家拥有一件该类东西；取不到就如实记下每次尝试的拒绝。
import {world,act,propose,trackOne,holdingsOf,acct,readJson,REPO} from './lib.mjs';
const ON=`${REPO}/world/ontology/`;
export const ontology={
  templates:(await readJson(ON+'entity-templates.json')).entries,
  holdings:(await readJson(ON+'holdings.json')).entries,
  obligations:(await readJson(ON+'obligations.json')).entries,
  primitives:(await readJson(ON+'primitives.json')).entries,
};
// 与"持有物"相关的持有种类：标的含 物/群/契，或可转让，或持有人消失时转入遗产（即它是财产）。
export const propertyHoldingKinds=ontology.holdings.filter(h=>h.subjectKinds.some(k=>['thing','population','instrument'].includes(k))||h.transferable||h.handover?.gone==='estate');
// 能作这些持有种类标的、且模板本身可作主语（subject:true）的实体模板。
const subjectTemplates=new Set(propertyHoldingKinds.flatMap(h=>h.subjectKinds));
export const ownableTemplates=ontology.templates.filter(t=>t.subject&&subjectTemplates.has(t.id));
export const excludedTemplates=ontology.templates.filter(t=>!ownableTemplates.includes(t)).map(t=>({id:t.id,label:t.label,why:!t.subject?'模板 subject:false（不能作主语/标的）':'不是任何财产类持有种类的标的'}));
const monsters=world.monsters,items=world.items;
const hasTag=(i,re)=>(i.tags??[]).some(t=>re.test(t));
// 世界里实际存在的实体计数（细分依据）。
export function census(doc){
  const s=doc.state;
  return {
    species:monsters.length,
    itemTemplates:items.length,
    paperItems:items.filter(i=>hasTag(i,/^(paper|book)$/)).length,
    vehicleItems:items.filter(i=>hasTag(i,/vehicle|cart|boat|mount|carriage/)).length,
    coinItems:items.filter(i=>hasTag(i,/^coin$/)).length,
    buildings:world.locations.filter(l=>l.id.startsWith('bld_')).length,
    places:world.locations.length,
    fields:Object.values(s.records).filter(r=>r.category==='agriculture').length,
    herds:Object.values(s.records).filter(r=>r.category==='husbandry').length,
    ecologyPopulations:Object.values(s.records).filter(r=>r.category==='ecology').reduce((n,r)=>n+Object.keys(r.populations??{}).length,0),
    lairs:Object.values(s.records).filter(r=>r.category==='lair').length,
  };
}
const at=async(c,dest)=>(c.doc.state.location===dest?null:act(c,'core:move',{destination:dest}));
const fail=attempts=>({subject:null,attempts});
const say=(res,label)=>`${label}：${res.status==='committed'?'成功':res.reason}`;
const wildRef=async c=>{await at(c,'loc_hw_fields');const g=await trackOne(c,'monster_bent_horn_goat',8);return g?{entity:g,kind:'creature',owner:null,living:true,hp:c.doc.state.creatures[g].hp,species:'monster_bent_horn_goat'}:null;};
// 细分表：(模板, kind) → 行。living：是否有生命；acquire：真实取得；ref：取不到自有实例时拿来对照试的现成实例（无主或他人所有）。
export const ROWS=[
 {id:'stock',label:'计量存货',template:'thing',kind:'item',living:false,portable:true,from:'item 模板，按数量记账（resources item:*）',
  async acquire(c){await at(c,'bld_hw_forge');return {subject:{entity:'item_ration',resource:'item_ration',account:acct('player','item_ration'),kind:'item'},attempts:['开局行囊自带干粮（createCharacter）']};}},
 {id:'instance',label:'物品个体',template:'thing',kind:'item',living:false,portable:true,from:'item 模板的单件（itemInstances）',
  async acquire(c){await at(c,'bld_hw_forge');const b=await act(c,'core:trade.buy',{seller:'npc_hw_duanyan',item:'item_kitchen_knife',quantity:1});
   const u=Object.values(c.doc.state.itemInstances??{}).find(x=>x.owner==='player'&&x.item==='item_kitchen_knife');
   return u?{subject:{entity:u.id,resource:'item_kitchen_knife',account:acct('player','item_kitchen_knife'),kind:'item'},attempts:[say(b,'core:trade.buy 向段岩买切刀')]}:fail([say(b,'core:trade.buy')]);}},
 {id:'coin',label:'钱币',template:'thing',kind:'item',living:false,portable:true,from:'resources coin_river 与 coin 性状物品',
  async acquire(c){await at(c,'bld_hw_forge');return {subject:{entity:'coin_river',resource:'coin_river',account:acct('player','coin_river'),kind:'item'},attempts:['开局随身铜钱']};}},
 {id:'document',label:'文书或凭证',template:'thing',kind:'item',living:false,portable:true,from:'文书原件（documents:*）、paper/book 性状物品',
  async acquire(c){await at(c,'bld_hw_school');const b=await act(c,'core:trade.buy',{seller:'npc_hw_luqing',item:'item_literacy_primer',quantity:1});
   const i=await act(c,'documents:issue',{kind:'receipt',source:b.input.eventId,text:'买书收据'});
   const list=await act(c,'documents:list',{},{commit:false});const docs=list.result?.documents??[];
   if(docs.length)return {subject:{entity:docs[0].id??docs[0],kind:'item',document:true},attempts:[say(i,'documents:issue')]};
   return fail([say(b,'core:trade.buy 买识字课本'),say(i,'documents:issue 开收据原件'),`documents:list：名下原件 ${docs.length} 件`]);}},
 {id:'vehicle',label:'载具',template:'thing',kind:'item',living:false,portable:false,from:'item 性状 vehicle/cart/boat；core:move 的 mode',
  async acquire(){const n=items.filter(i=>hasTag(i,/vehicle|cart|boat|mount|carriage/)).length;return fail([`世界物品表里带载具性状的物品 ${n} 种；core:move 的 horse/cart/boat 只是出行方式，不产生可持有的实体`]);}},
 {id:'building',label:'建筑或房间',template:'thing',kind:'building',living:false,from:'building 实体与 owns(property:bld_*)',
  async acquire(c){await at(c,'bld_hw_mill');const l=await act(c,'core:trade.lease',{seller:'npc_hw_ayan',business:'bld_hw_mill',days:1});
   await at(c,'bld_hw_qingdeng');const v=await act(c,'core:trade.invest',{seller:'npc_hw_linsui',business:'bld_hw_qingdeng',coins:10});
   const own=holdingsOf(c.doc,{holder:'player',kind:'owns'}).find(h=>String(h.subject).startsWith('bld_'));
   return own?{subject:{entity:own.subject,kind:'building'},attempts:[]}:fail([say(l,'core:trade.lease 向阿砚租磨坊'),say(v,'core:trade.invest 入股青灯酒馆'),'动作目录里没有买房或接手房屋的登记动作']);},
  ref:c=>({entity:'bld_hw_qingdeng',kind:'building',owner:'npc_hw_linsui',moveTo:'bld_hw_qingdeng'})},
 {id:'land',label:'土地或田块',template:'place',kind:'loc',living:false,from:'agriculture 田块（records agriculture:*）',
  async acquire(c){await at(c,'bld_hw_council');const a=await act(c,'core:farm.adopt',{settlement:'loc_hw',quantity:1});
   await at(c,'loc_hw_fields');const s=await act(c,'core:farm.private_sow',{settlement:'loc_hw',areaMu:1},{commit:false});
   return s.status==='committed'?{subject:{entity:'loc_hw_fields',kind:'loc'},attempts:[]}:fail([say(a,'core:farm.adopt 在村务屋认领田地'),say(s,'core:farm.private_sow 试种自家田')]);},
  ref:c=>({entity:'loc_hw_fields',kind:'loc',owner:'loc_hw',moveTo:'loc_hw_fields'})},
 {id:'crop',label:'田里作物',template:'place',kind:'loc',living:true,from:'agriculture 田块的作物批（field.cohorts）',
  async acquire(c){await at(c,'loc_hw_fields');const s=await act(c,'core:farm.private_sow',{settlement:'loc_hw',areaMu:1});
   return s.status==='committed'?{subject:{entity:'loc_hw_fields',kind:'loc',crop:true},attempts:[]}:fail([say(s,'core:farm.private_sow 播种自家田地')]);},
  ref:c=>({entity:'farm_hw_oats',kind:'loc',owner:'loc_hw',moveTo:'loc_hw_fields'})},
 {id:'tree',label:'树或林木',template:'thing',kind:'node',living:true,from:'node 资源点（林木、果树）',
  async acquire(c){await at(c,'loc_hw_orchard');const w=await act(c,'core:site.woodcut',{target:'loc_hw_orchard'},{commit:false});
   return fail([say(w,'core:site.woodcut 在公用果园伐木（试探资源点归属）'),'动作目录里没有取得自有林木或果树的登记动作']);},
  ref:c=>({entity:'loc_hw_orchard',kind:'node',owner:'loc_hw',moveTo:'loc_hw_orchard'})},
 {id:'mark',label:'痕迹',template:'thing',kind:'mark',living:false,from:'create(kind:mark) 兜底痕迹实体',
  async acquire(c){await at(c,'bld_hw_forge');const m=await act(c,'open:leave_mark',{intent:'在铺子门框上刻个记号',form:'刻痕'});
   const e=Object.values(c.doc.holdings?.entities??{}).find(x=>x.kind==='mark');
   return e?{subject:{entity:e.id,kind:'mark'},attempts:[say(m,'open:leave_mark'),`归属：${holdingsOf(c.doc,{subject:e.id}).map(h=>h.kind+'>'+h.holder).join(',')||'无 owns 持有（作者即玩家）'}`]}:fail([say(m,'open:leave_mark')]);}},
 {id:'wreck',label:'残骸',template:'thing',kind:'wreck',living:false,from:'destroy 后 transition(gone) 的 wreck 实体',
  async acquire(c){await at(c,'bld_hw_forge');await act(c,'core:trade.buy',{seller:'npc_hw_duanyan',item:'item_kitchen_knife',quantity:1});
   const u=Object.values(c.doc.state.itemInstances??{}).find(x=>x.owner==='player');
   const d=await propose(c,'把我自己的切刀砸碎',[{op:'destroy',entity:u?.id}]);
   const e=Object.values(c.doc.holdings?.entities??{}).find(x=>x.kind==='wreck');
   return e?{subject:{entity:e.id,kind:'wreck'},attempts:[say(d,'destroy 自有切刀')]}:fail([say(d,'world_propose destroy 自有切刀以得残骸')]);}},
 {id:'corpse',label:'尸体或猎获',template:'agent',kind:'creature',living:false,from:'creature 死亡后的 corpse',
  async acquire(c){await at(c,'loc_hw_fields');const log=[];
   for(const sp of ['monster_oat_pheasant','monster_mottled_field_mouse','monster_grey_field_pipit']){
    const g=await trackOne(c,sp,6);log.push(`追踪 ${sp}：${g?'找到':'未找到'}`);if(!g)continue;
    for(let i=0;i<12;i++){const x=await act(c,'core:combat',{target:g,intent:'attack'});const cr=c.doc.state.creatures[g];if(x.status==='rejected'){log.push(say(x,'core:combat'));break;}if(cr?.corpse)break;}
    if(c.doc.state.creatures[g]?.corpse)return {subject:{entity:g,kind:'creature',dead:true,species:sp},attempts:[...log,'core:combat 猎杀成功，尸体 killedBy=player']};
   }
   return fail(log);}},
 {id:'creature',label:'自有活体个体（牲畜）',template:'agent',kind:'creature',living:true,from:'creature 个体（物种 ownable）',
  acquire:c=>acquireLiving(c,'owns'),ref:wildRef},
 {id:'pet',label:'驯兽或宠物',template:'agent',kind:'creature',living:true,from:'tamed_by 持有、state.pets',
  acquire:c=>acquireLiving(c,'tamed_by'),ref:wildRef},
 {id:'herd',label:'种群或畜群',template:'population',kind:'population',living:true,from:'population 模板：husbandry 畜群、ecology 野生种群',
  async acquire(c){const k=census(c.doc),log=[`世界里畜群 ${k.herds} 个（records category=husbandry），野生种群 ${k.ecologyPopulations} 个（无主）`];
   const mine=Object.values(c.doc.state.records).find(x=>x.category==='husbandry'&&x.owner==='player');
   if(mine)return {subject:{entity:mine.id,kind:'population',species:mine.species,herd:true},attempts:[...log,'开局名下有畜群']};
   for(const h of Object.values(c.doc.state.records).filter(x=>x.category==='husbandry').slice(0,2)){
    const loc=c.doc.state.npcs[h.owner]?.location;if(loc)await at(c,loc);
    for(const item of [h.species,h.id]){const b=await act(c,'core:trade.buy',{seller:h.owner,item,quantity:1});log.push(say(b,`core:trade.buy 向畜群主 ${h.owner} 买 ${item}`));}
    const got=Object.values(c.doc.state.records).find(x=>x.category==='husbandry'&&x.owner==='player');if(got)return {subject:{entity:got.id,kind:'population',species:got.species,herd:true},attempts:log};}
   log.push('缺：取得路径（动作目录没有买卖、分户或开立畜群的登记动作；属 K2/K1）');return fail(log);},
  ref:c=>{const h=Object.values(c.doc.state.records).find(x=>x.category==='husbandry');return h?{entity:h.id,species:h.species,kind:'population',owner:h.owner,moveTo:h.location,living:true,herd:true}:null;}},
 {id:'claim',label:'债权',template:'instrument',kind:'claim',living:false,from:'instrument obligation/claim；钱庄存款',
  async acquire(c){await at(c,'bld_hw_post');const d=await act(c,'core:trade.deposit',{seller:'npc_hw_shendu',coins:20});
   const ob=(d.receipt?.applied??[]).find(a=>a.op==='obligation.create');const id=ob?.result?.id??ob?.id??ob?.result?.obligation?.id??null;
   return d.status==='committed'?{subject:{entity:id??'deposit',kind:'claim',obligation:id,obligationKind:'deposit',debtor:'bank_hw_post'},attempts:[say(d,'core:trade.deposit 在小驿站存 20 文'),`义务编号：${id??'回执未给出'}`]}:fail([say(d,'core:trade.deposit')]);}},
 {id:'share',label:'份额或股权',template:'collective',kind:'org',living:false,from:'share 持有（标的为群体/商号）',
  async acquire(c){await at(c,'bld_hw_qingdeng');const v=await act(c,'core:trade.invest',{seller:'npc_hw_linsui',business:'bld_hw_qingdeng',coins:10});
   const h=holdingsOf(c.doc,{holder:'player',kind:'share'})[0];
   return h?{subject:{entity:h.subject,kind:'org',holding:h.id},attempts:[say(v,'core:trade.invest')]}:fail([say(v,'core:trade.invest 入股青灯酒馆')]);}},
 {id:'permit',label:'许可或执照',template:'instrument',kind:'permit',living:false,from:'instrument permit；permit 持有',
  async acquire(c){const h=holdingsOf(c.doc,{holder:'player',kind:'permit'});
   return fail([`玩家名下许可 ${h.length} 件；发证属签发机构同意（设计稿审定第 4 条判为真实限制），本卡不取得`]);}},
];
// 自有活体的取得阶梯：①向世界里任何持有该类活物的人买；②开局即有；③驯服野生个体。都只用真实动作。
export async function acquireLiving(c,via,speciesFilter=()=>true){
  const attempts=[];
  const sellers=Object.entries(c.doc.state.npcs).filter(([,n])=>Object.keys(n.inventory??{}).some(k=>monsters.some(m=>m.id===k&&speciesFilter(m))));
  attempts.push(`①买：NPC 库存里有活物物种的卖家 ${sellers.length} 个`);
  for(const [id,n] of sellers.slice(0,3)){await at(c,n.location);const sp=Object.keys(n.inventory).find(k=>monsters.some(m=>m.id===k&&speciesFilter(m)));
    const b=await act(c,'core:trade.buy',{seller:id,item:sp,quantity:1});attempts.push(say(b,`core:trade.buy 向 ${id} 买 ${sp}`));
    const own=Object.entries(c.doc.state.creatures??{}).find(([,x])=>x.owner==='player'&&x.species===sp&&x.hp>0);if(own)return {subject:{entity:own[0],kind:'creature',species:sp,via:'buy',hp:own[1].hp},attempts};}
  for(const h of Object.values(c.doc.state.records).filter(x=>x.category==='husbandry'&&speciesFilter(monsters.find(m=>m.id===x.species)??{})).slice(0,2)){
    const loc=c.doc.state.npcs[h.owner]?.location;if(loc)await at(c,loc);const b=await act(c,'core:trade.buy',{seller:h.owner,item:h.species,quantity:1});attempts.push(say(b,`core:trade.buy 向畜群主 ${h.owner} 买一只 ${h.species}`));
    const own=Object.entries(c.doc.state.creatures??{}).find(([,x])=>x.owner==='player'&&x.species===h.species&&x.hp>0);if(own)return {subject:{entity:own[0],kind:'creature',species:h.species,via:'buy',hp:own[1].hp},attempts};}
  const start=Object.entries(c.doc.state.creatures??{}).filter(([,x])=>x.owner==='player'&&x.hp>0&&speciesFilter(monsters.find(m=>m.id===x.species)??{}));
  attempts.push(`②开局：自有生灵 ${start.length} 只，宠物 ${Object.keys(c.doc.state.pets??{}).length} 只`);
  if(start.length)return {subject:{entity:start[0][0],kind:'creature',species:start[0][1].species,via:'start',hp:start[0][1].hp},attempts};
  const sp=monsters.find(m=>m.tamingRule&&speciesFilter(m)&&world.rules.wildlife?.habitats?.some(h=>h.id===m.wildlife?.habitat&&String(h.location).startsWith('loc_hw')));
  if(sp){const h=world.rules.wildlife.habitats.find(x=>x.id===sp.wildlife.habitat);await at(c,h.location);const g=await trackOne(c,sp.id,8);
    if(g){const ct=await act(c,'core:pet.contact',{target:g});const tm=await act(c,'core:pet.tame',{target:g});attempts.push(say(ct,`③驯：core:pet.contact ${sp.name}`),say(tm,`core:pet.tame ${sp.name}`));
      const pet=Object.keys(c.doc.state.pets??{})[0]??holdingsOf(c.doc,{holder:'player',kind:'tamed_by'})[0]?.subject;
      if(pet)return {subject:{entity:pet,kind:'creature',species:sp.id,via:'tame',hp:c.doc.state.creatures?.[pet]?.hp},attempts};}
    else attempts.push(`③驯：追踪 ${sp.name} 未遇到个体`);}
  else attempts.push('③驯：本地栖地没有符合条件的可驯物种');
  attempts.push('缺：取得路径（属 K2/K1）');return fail(attempts);
}
