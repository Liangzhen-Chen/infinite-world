// 卡 Q：手艺档位与品质链（再生勇士建议 1+2）。三个材料族（木、金属、皮）× 三档技能（没掌握 / 熟练度不到门槛 / 熟练）
// × 工具与工位条件（标准、工位降级、精良工具）；外加品质沿链传递、按实例报价、一条新配方的通用性与账本守恒。
// 真实制作（world_craft）验证落档、拒绝理由、回收、守恒与链；分布与期望按引擎同一组函数对 d20 全部点数精确枚举。
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {auditLedger}from'../server-plugin/ledger.mjs';
import {marketQuote}from'../server-plugin/market.mjs';
import {stateReader}from'../server-plugin/valuation.mjs';
import {checkDegree,toolBonuses}from'../server-plugin/checks.mjs';
import {useTool,physicalItem}from'../server-plugin/items.mjs';
import {actionReader}from'../server-plugin/action-capacity.mjs';
import {craftOutcome,craftFailure}from'../server-plugin/manufacturing.mjs';
import {instanceClasses,useClasses,craftingParam,workmanshipTier,lostUses}from'../server-plugin/item-class.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const FAMILIES=[
 {family:'木',recipe:'recipe_w3b_wall_shelf',location:'bld_hw_mill'},
 {family:'金属',recipe:'recipe_w3b_drawer_pull',location:'bld_hw_forge'},
 {family:'皮',recipe:'recipe_w3b_leather_thimble',location:'bld_hw_weaving'},
];
const STANDINGS={noSkill:null,underProficient:50,skilled:280};
const RUNS=6;
const TIERS=world=>world.rules.equipment.workmanship.map(r=>r.name);
const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);

const shared=(async()=>{const world=await loadWorld();const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'kq-quality');document.state.player.coins=100000;return {world,engine,document};})();
async function fresh(mutate){const world=await loadWorld();mutate(world);const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'kq-quality');document.state.player.coins=100000;return {world,engine,document};}
function give(engine,c,item,quantity){const def=engine.byId.get(item);c.state.inventory[item]={quantity,quality:def.quality,durability:def.durability,weight:def.weight};}
// 一件指定手艺档与品质的实例（工具或材料）。
function giveUnit(engine,c,item,id,{workmanship,grade}){
 const def=engine.byId.get(item);give(engine,c,item,(c.state.inventory[item]?.quantity??0)+1);
 c.state.itemInstances[id]={id,item,owner:'player',status:'持有',maker:'player',source:'kq-fixture',minute:0,quality:def.quality,durability:def.durability,maxDurability:def.durability,
  ...(workmanship?{workmanship}:{}),...(grade!==undefined?{grade}:{})};
 c.state.inventory[item].instances=[...c.state.inventory[item].instances??[],id];
}
function prepare(engine,doc,recipeId,location,proficiency,condition='standard'){
 const c=structuredClone(doc),r=engine.byId.get(recipeId);
 c.state.location=location;c.state.recipes[recipeId]={source:{type:'teacher',id:r.teachers?.[0]??'npc_hw_ayan'}};
 delete c.state.skills[r.skill];if(proficiency!==null)c.state.skills[r.skill]={proficiency,daily:{},breakthroughs:[]};
 for(const m of r.materials)give(engine,c,m.item,m.amount);
 for(const t of r.tools??[]){if(condition==='fineTools')giveUnit(engine,c,t,`unit_kq_${t}`,{workmanship:'精良'});else give(engine,c,t,1);}
 if(condition==='degraded')c.state.buildings[location]={...c.state.buildings[location],condition:50};
 return c;
}
async function runs(engine,c,recipe,n,tag){
 const out=[];
 for(let i=0;i<n;i++){const r=await engine.reduce(c,{tool:'world_craft',args:{recipe},eventId:`kq_${tag}_${i}`});out.push({result:r.result,document:applyPatches(c,r.patches)});}
 return out;
}
// 按引擎的检定档规则与本次真实检定的修正值，对 d20 全部 20 个点数精确枚举一批制作结果。
function enumerate(engine,recipe,{standing,modifier,proficiency,tools=1,station=1,floor=1}){
 const def=engine.byId.get(recipe.output.item);
 return Array.from({length:20},(_,i)=>{
  const die=i+1,{degree,success}=checkDegree(die,die+modifier,recipe.difficulty);
  const out=craftOutcome(engine,{standing,degree,success,proficiency,floor,tools,station,recoverFraction:recipe.failure?.recoverFraction??0,seed:'kq',key:`enum:${die}`});
  const tier=success?out.tier:null,unit=success?{item:def.id,workmanship:tier,lostUses:lostUses(engine,def.id,tier)}:null;
  return {success,tier,grade:success?out.grade:0,durability:success?def.durability*workmanshipTier(engine,tier).multiplier*out.grade:0,uses:unit?instanceClasses(engine,unit).length:0};
 });
}

test('外行与熟练度不足照做：同一物品 id、落仿制或粗陋、耐久与用途打折；失败分档回收、账本守恒；物理上做不了才拒绝（三族）',async()=>{
 const {world,engine,document}=await shared;
 for(const {family,recipe,location} of FAMILIES){
  const r=engine.byId.get(recipe),def=engine.byId.get(r.output.item);
  for(const [standing,prof] of Object.entries(STANDINGS)){
   const c=prepare(engine,document,recipe,location,prof),before=auditLedger(c.ledger);
   for(const x of await runs(engine,c,recipe,RUNS,`${family}${standing}`)){
    assert.deepEqual(auditLedger(x.document.ledger),before,`${family}/${standing} 账本审计`);
    if(standing!=='skilled')assert.equal(x.result.standing,standing);else assert.equal(x.result.standing,undefined);
    if(x.result.success){
     const unit=x.document.state.itemInstances[x.result.instances[0]];
     assert.equal(unit.item,r.output.item,'产物仍是同一物品 id');
     if(standing==='noSkill')assert.equal(unit.workmanship,'仿制');
     if(standing==='underProficient')assert.ok(['仿制','粗陋'].includes(unit.workmanship));
     if(standing!=='skilled')assert.ok(unit.maxDurability<def.durability,`${family}/${standing} 耐久 ${unit.maxDurability} 低于真货 ${def.durability}`);
     continue;
    }
    // 失败：按类别回收，账本守恒（上面审计）。
    if(!x.result.failure)continue;
    const back=Object.fromEntries(x.result.salvage.map(s=>[s.item,s.amount]));
    for(const m of r.materials){
     const want=x.result.failure==='intact'?m.amount:x.result.failure==='wear'?Math.floor(m.amount*(r.failure?.recoverFraction??0)):0;
     assert.equal(back[m.item]??0,want,`${family}/${x.result.failure} 回收 ${m.item}`);assert.equal(x.document.state.inventory[m.item]?.quantity??0,want);
    }
    if(x.result.failure==='partial'){assert.equal(x.result.workmanship,TIERS(world)[0]);assert.equal(x.document.state.itemInstances[x.result.instances[0]].item,r.output.item);}
   }
  }
  // 物理理由：缺材料、缺工具、不在工位照样拒绝，且理由是物理的。
  for(const [label,alter,reason] of [['缺材料',c=>delete c.state.inventory[r.materials[0].item],/缺少|不足/],['缺工具',c=>delete c.state.inventory[r.tools[0]],/工具|缺少/],['不在工位',c=>c.state.location='loc_hw',/工作台|工坊/]]){
   const c=prepare(engine,document,recipe,location,null);alter(c);
   await assert.rejects(engine.reduce(c,{tool:'world_craft',args:{recipe},eventId:`kq_phys_${family}`}),reason,`${family}${label}`);
  }
 }
 // 用途缺失：仿制的刃具不再具备 cut 用途（镰刀标着 cut），普通的仍具备；制成时缺掉的用途记在实例上。
 assert.ok(useClasses(engine,'item_sickle').includes('cut'));
 assert.deepEqual(lostUses(engine,'item_sickle','仿制'),['cut']);
 assert.ok(!instanceClasses(engine,{item:'item_sickle',workmanship:'仿制'}).includes('cut'));
 assert.ok(instanceClasses(engine,{item:'item_sickle',workmanship:'普通'}).includes('cut'));
});

test('档位分层与工具工位：没掌握 < 不到门槛 < 熟练，手艺档、耐久、保留用途逐档不减；精良工具 > 标准 > 工位降级（三族 × 三条件，d20 精确枚举）',async()=>{
 const {world,engine,document}=await shared,rank=n=>TIERS(world).indexOf(n);
 for(const {family,recipe,location} of FAMILIES){
  const r=engine.byId.get(recipe),stats={};
  for(const [standing,prof] of Object.entries(STANDINGS)){
   // 修正值取自一次真实检定（属性 + 技能），之后按检定规则对全部点数枚举。
   const [one]=await runs(engine,prepare(engine,document,recipe,location,prof),recipe,1,`mod${family}${standing}`);
   for(const [condition,tools,station] of [['standard',1,1],['degraded',1,0.5],['fineTools',workmanshipTier(engine,'精良').multiplier,1]]){
    const rows=enumerate(engine,r,{standing,modifier:one.result.modifier,proficiency:prof??0,tools,station}),made=rows.filter(x=>x.success);
    assert.ok(made.length>0,`${family}/${standing} 有成功点数`);
    stats[`${condition}:${standing}`]={tier:mean(made.map(x=>rank(x.tier))),durability:mean(made.map(x=>x.durability)),uses:mean(made.map(x=>x.uses)),grade:mean(made.map(x=>x.grade))};
   }
  }
  for(const condition of ['standard','degraded','fineTools']){
   const [a,b,s]=['noSkill','underProficient','skilled'].map(k=>stats[`${condition}:${k}`]);
   // 坏工位会把不到门槛者也拉到最低档，所以档位只要求单调不减、熟练严格高于外行；品质分严格分层（下一条）。
   assert.ok(a.tier<=b.tier&&b.tier<=s.tier&&a.tier<s.tier,`${family}/${condition} 手艺档 ${a.tier} ≤ ${b.tier} ≤ ${s.tier}`);
   if(condition!=='degraded')assert.ok(a.tier<b.tier,`${family}/${condition} 不到门槛者高于外行`);
   assert.ok(a.durability<b.durability&&b.durability<s.durability,`${family}/${condition} 耐久 ${a.durability} < ${b.durability} < ${s.durability}`);
   assert.ok(a.uses<=b.uses&&b.uses<=s.uses,`${family}/${condition} 用途不减`);
   assert.ok(a.grade<b.grade&&b.grade<s.grade,`${family}/${condition} 成品品质 ${a.grade} < ${b.grade} < ${s.grade}`);
  }
  for(const standing of Object.keys(STANDINGS)){
   const g=k=>stats[`${k}:${standing}`].grade;
   assert.ok(g('fineTools')>g('standard')&&g('standard')>g('degraded'),`${family}/${standing} 工具工位乘子：${g('fineTools')} > ${g('standard')} > ${g('degraded')}`);
  }
  // 对高手递减：精良工具带来的品质提升，熟练者小于外行。
  const gain=k=>stats[`fineTools:${k}`].grade-stats[`standard:${k}`].grade;assert.ok(gain('skilled')<gain('noSkill'));
 }
});

test('真实制作里工具与工位进入品质：同一点数（同一事件编号），精良工具 > 标准 > 工位降级',async()=>{
 const {engine,document}=await shared,{recipe,location}=FAMILIES[0];
 const grades={};
 for(const condition of ['standard','degraded','fineTools'])
  grades[condition]=(await runs(engine,prepare(engine,document,recipe,location,null,condition),recipe,RUNS,'cond')).map(x=>x.result.success?x.result.grade:null);
 let compared=0;
 for(let i=0;i<RUNS;i++){if(grades.standard[i]===null||grades.degraded[i]===null||grades.fineTools[i]===null)continue;compared++;
  assert.ok(grades.fineTools[i]>grades.standard[i]&&grades.standard[i]>grades.degraded[i],`第 ${i} 次：${grades.fineTools[i]} > ${grades.standard[i]} > ${grades.degraded[i]}`);}
 assert.ok(compared>0,'需要至少一个三条件都成功的点数');
});

test('失败有结构：四类按参数分布出现，频率与数据表相符',()=>shared.then(({engine})=>{
 const table=craftingParam(engine,'failure.outcomes'),N=4000;
 for(const [degree,rows] of Object.entries(table))for(const [standing,weights] of Object.entries(rows)){
  const seen={};for(let i=0;i<N;i++){const k=craftFailure(engine,{standing,degree,seed:'kq',key:`f:${i}`});seen[k]=(seen[k]??0)+1;}
  for(const [k,w] of Object.entries(weights))assert.ok(Math.abs((seen[k]??0)/N-w)<0.03,`${degree}/${standing}/${k} 实际 ${(seen[k]??0)/N} 参数 ${w}`);
 }
 const any=Object.values(table).flatMap(rows=>Object.values(rows));
 for(const k of ['intact','wear','ruin','partial'])assert.ok(any.some(w=>w[k]>0),`${k} 在参数里有概率`);
 // 不在表里的失败（烧制裂损、工坊停用）由调用方按物理原因处理。
 assert.equal(craftFailure(engine,{standing:'skilled',degree:'烧制裂损',seed:'kq',key:'x'}),null);
}));

test('品质沿链传递：低品质原料做出的成品不超过原料品质下限（真实前道工序产出的仿制铁钉 → 木架）',async()=>{
 const {engine,document}=await shared;
 // 前道：没掌握锻造的人在铁匠铺打铁钉，得到仿制、低品质的铁钉。
 let c=structuredClone(document);c.state.location='bld_hw_forge';c.state.recipes.recipe_forge_nails={source:{type:'teacher',id:'npc_hw_ayan'}};
 delete c.state.skills.skill_life_5_core;give(engine,c,'item_smith_hammer',1);give(engine,c,'item_smith_tongs',1);
 const nailRecipe=engine.byId.get('recipe_forge_nails');
 let nails=null;
 for(let i=0;i<40&&!nails;i++){for(const m of nailRecipe.materials)give(engine,c,m.item,m.amount);const r=await engine.reduce(c,{tool:'world_craft',args:{recipe:'recipe_forge_nails'},eventId:`kq_nail_${i}`});const next=applyPatches(c,r.patches);if(r.result.success)nails={c:next,result:r.result};else c=next;}
 assert.ok(nails,'外行应能打出仿制铁钉');assert.equal(nails.result.workmanship,'仿制');
 const nailGrade=nails.result.grade;assert.ok(nailGrade<1);
 // 后道：熟练木匠用这些铁钉做木架，成品品质 ≤ 铁钉品质；对照用标准铁钉，同一点数下品质更高。
 const shelf=engine.byId.get('recipe_w3b_wall_shelf');
 const d=structuredClone(nails.c);d.state.location='bld_hw_mill';d.state.recipes[shelf.id]={source:{type:'teacher',id:'npc_hw_ayan'}};d.state.skills[shelf.skill]={proficiency:280,daily:{},breakthroughs:[]};
 for(const m of shelf.materials)if(m.item!=='item_iron_nail')give(engine,d,m.item,m.amount);
 assert.ok((d.state.inventory.item_iron_nail?.quantity??0)>=shelf.materials.find(m=>m.item==='item_iron_nail').amount);
 for(const t of shelf.tools)give(engine,d,t,1);
 const low=await runs(engine,d,shelf.id,RUNS,'chain'),std=await runs(engine,prepare(engine,document,shelf.id,'bld_hw_mill',280),shelf.id,RUNS,'chain');
 let made=0;
 for(let i=0;i<RUNS;i++){if(!low[i].result.success)continue;made++;
  assert.ok(low[i].result.grade<=nailGrade,`成品品质 ${low[i].result.grade} 不超过原料下限 ${nailGrade}`);
  if(std[i].result.success)assert.ok(std[i].result.grade>low[i].result.grade);}
 assert.ok(made>0);
});

test('按实例品质报价：同一物品真货高于粗陋高于仿制，卖给 NPC 的成交价随实例变化（三族）',async()=>{
 const {engine,document}=await shared;
 for(const {recipe,location} of FAMILIES){
  const item=engine.byId.get(recipe).output.item,c=structuredClone(document);c.state.location=location;
  giveUnit(engine,c,item,'unit_kq_true',{workmanship:'普通',grade:1});giveUnit(engine,c,item,'unit_kq_crude',{workmanship:'粗陋',grade:0.55});giveUnit(engine,c,item,'unit_kq_fake',{workmanship:'仿制',grade:0.35});
  const npc=Object.keys(c.state.npcs).sort()[0];
  const price=id=>marketQuote(stateReader(c.state),engine,{item,location,seller:'player',buyer:npc,instances:[id]}).exactTotal;
  assert.ok(price('unit_kq_true')>price('unit_kq_crude')&&price('unit_kq_crude')>price('unit_kq_fake'),`${item} 报价按实例：${price('unit_kq_true')} > ${price('unit_kq_crude')} > ${price('unit_kq_fake')}`);
 }
});

test('通用性：副本里新加一条从未出现的材料与配方（只给属性，不改代码），外行照做落仿制、缺刃口用途，品质与报价照样成立',async()=>{
 const {engine,document}=await fresh(w=>{
  w.items.push({id:'item_kq_obsidian',name:'试验黑曜石',basePrice:6,weight:1,quality:'石',durability:40,tags:['stone'],aliases:[],scope:null,description:'试验材料'});
  w.items.push({id:'item_kq_blade',name:'试验石刃',basePrice:30,weight:0.3,quality:'石',durability:80,tags:['cut','tool'],aliases:[],scope:null,description:'试验成品'});
  w.recipes.push({id:'recipe_kq_blade',name:'打制试验石刃',skill:'skill_life_5_core',minimumProficiency:100,materials:[{item:'item_kq_obsidian',amount:2}],tools:['item_smith_hammer'],
   workstation:'smithing',difficulty:10,minutes:30,toolWear:1,failure:{recoverFraction:0.5,injury:0},output:{item:'item_kq_blade',quantity:1},byproducts:[],learningRequired:true,teachers:['npc_hw_ayan'],aliases:[],scope:null});
 });
 const r=engine.byId.get('recipe_kq_blade'),grades={};
 for(const [standing,prof] of Object.entries(STANDINGS)){
  const rows=await runs(engine,prepare(engine,document,r.id,'bld_hw_forge',prof),r.id,RUNS,`novel${standing}`);
  for(const x of rows){
   if(!x.result.success){if(x.result.failure)assert.ok(['intact','wear','ruin','partial'].includes(x.result.failure));continue;}
   const unit=x.document.state.itemInstances[x.result.instances[0]];assert.equal(unit.item,'item_kq_blade');
   if(standing==='noSkill'){assert.equal(unit.workmanship,'仿制');assert.deepEqual(unit.lostUses,['cut']);assert.ok(!instanceClasses(engine,unit).includes('cut'));assert.ok(unit.maxDurability<80);}
  }
  grades[standing]=mean(enumerate(engine,r,{standing,modifier:rows[0].result.modifier,proficiency:prof??0}).filter(x=>x.success).map(x=>x.grade));
 }
 assert.ok(grades.noSkill<grades.underProficient&&grades.underProficient<grades.skilled);
 const c=structuredClone(document);c.state.location='bld_hw_forge';
 giveUnit(engine,c,'item_kq_blade','unit_kq_nb_true',{workmanship:'普通',grade:1});giveUnit(engine,c,'item_kq_blade','unit_kq_nb_fake',{workmanship:'仿制',grade:0.35});
 const q=id=>marketQuote(stateReader(c.state),engine,{item:'item_kq_blade',location:'bld_hw_forge',seller:'player',buyer:Object.keys(c.state.npcs).sort()[0],instances:[id]}).exactTotal;
 assert.ok(q('unit_kq_nb_true')>q('unit_kq_nb_fake'));
});

test('缺掉的用途真的不具备：仿制镰刀不能当刃具、仿制陶轮不给检定加成；普通件照常（实例 lostUses 被用途判断读到）',async()=>{
 const {engine,document}=await shared;
 const holding=(item,workmanship)=>{const c=structuredClone(document);for(const t of Object.keys(c.state.inventory))if(t===item||engine.byId.get(t)?.tags?.includes('cut'))delete c.state.inventory[t];giveUnit(engine,c,item,`unit_kq_use_${item}`,{workmanship});
  const u=c.state.itemInstances[`unit_kq_use_${item}`];if(workmanship==='仿制')u.lostUses=lostUses(engine,item,workmanship);return actionReader(c);};
 assert.equal(useTool(holding('item_sickle','普通'),engine,'cut','item_sickle'),'item_sickle');
 assert.throws(()=>useTool(holding('item_sickle','仿制'),engine,'cut','item_sickle'),/cut/);
 assert.ok(!physicalItem(holding('item_sickle','仿制'),engine,'unit_kq_use_item_sickle').tags.includes('cut'));
 const wheel=engine.byId.get('item_pottery_wheel'),skill=wheel.checkBonus.skills[0],attr=wheel.checkBonus.attributes?.[0]??'敏捷';
 assert.equal(toolBonuses(holding('item_pottery_wheel','普通'),engine,['item_pottery_wheel'],attr,skill,'player',99).bonus,wheel.checkBonus.bonus);
 assert.equal(toolBonuses(holding('item_pottery_wheel','仿制'),engine,['item_pottery_wheel'],attr,skill,'player',99).bonus,0);
});
