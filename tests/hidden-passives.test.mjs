import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {personView,personCareer} from '../server-plugin/entity-view.mjs';
import {hiddenPassives,hiddenCheckBonus,hiddenCombat,petTrustGain} from '../server-plugin/hidden-passives.mjs';
const world=await loadWorld(),draft=JSON.parse(await fs.readFile('world/drafts/m4r/hidden-passives.json','utf8'));
// Candidate rules are tested before publication. Production data is installed
// only after the required L2/L4 gates; tests do not mark that gate passed.
for(const row of draft)world.professions.find(p=>p.id===row.id).passive=row.passive;
const engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const role=n=>`profession_hidden_${String(n).padStart(2,'0')}`;
const learned=p=>({proficiency:p,breakthroughs:[],daily:{}});
function fresh(...roles){
 const c=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'hidden-passives');
 c.state.professions.hidden=roles.map(role);c.state.careers??={};c.state.creatures??={};c.state.pets??={};c.state.minute=100;c.state.player.coins=1000;c.state.player.hp=100;c.state.player.maxHp=100;
 for(const r of c.state.professions.hidden)c.state.careers[r]={certification:{minute:10,source:'initiation'}};
 c.state.skills.skill_life_11_core=learned(200);c.state.skills.skill_life_17_core=learned(200);c.state.skills.skill_life_1_core=learned(200);
 return c;
}
const run=async(c,tool,args,eventId='test')=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
function map(c){c.state.inventory.item_work_map={quantity:1,instances:['unit_map']};c.state.itemInstances??={};c.state.itemInstances.unit_map={id:'unit_map',item:'item_work_map',owner:'player',status:'持有',durability:100,map:{locations:[c.state.location],routes:['route_test']}};}
function escort(c){c.state.obligations.escort={id:'escort',type:'带路',promisor:'npc_hw_luqing',promisee:'player',destination:'loc_hw',content:'护送玩家到河湾村',status:'进行中',deadline:10000};}

test('全部30种隐藏职业只从当前持有身份派生；无关检定不吃统一加一，读取不落盘',async()=>{
 assert.equal(draft.length,30);
 for(let i=1;i<=30;i++){
  const c=fresh(i),before=structuredClone(c),rows=personView(engine,c.state,'player').hiddenPassives.value;
  assert.equal(rows.length,1);assert.equal(rows[0].domain,draft[i-1].passive.domain);assert.deepEqual(c,before);
  const out=await run(c,'world_check',{attribute:'智力',difficulty:10},`unrelated_${i}`);assert.equal(out.result.hiddenPassive,undefined,role(i));
  c.state.professions.hidden=[];assert.deepEqual(hiddenPassives(engine,c.state),[]);
 }
 assert.equal(draft[2].passive.defenseBonus,2);assert.equal(draft[10].passive.trustMultiplier,.1);
});

test('测绘资料随实际单件归属与完好程度即时停用、恢复；野外测绘实际检定受益',async()=>{
 const c=fresh(2);c.state.location='loc_hw_northwood';map(c);
 const args={attribute:'智力',skill:'skill_life_11_core',difficulty:15,contextReason:'野外测绘'};
 const active=await run(c,'world_check',args,'survey');assert.equal(active.result.hiddenPassive.bonus,1);
 const lost=structuredClone(c);lost.state.itemInstances.unit_map.owner='npc_hw_luqing';
 const inactive=await run(lost,'world_check',args,'survey');assert.equal(active.result.modifier-inactive.result.modifier,1);
 lost.state.itemInstances.unit_map.owner='player';assert.equal(hiddenCheckBonus(engine,lost.state,'player','survey').bonus,1);
 lost.state.itemInstances.unit_map.durability=0;assert.equal(hiddenCheckBonus(engine,lost.state,'player','survey').bonus,0);
});

test('杀生及投降者死亡由实际交锋记录，保护期重计；不误把旧死亡作为新代价',async()=>{
 const c=fresh(1,19),target='monster_test_surrender';
 c.state.created[target]={id:target,name:'试验野兽',template:0,levelRange:[1,1],aliases:[]};
 c.state.creatures[target]={name:'试验野兽',location:c.state.location,hp:1,maxHp:1,level:1,status:'正常',surrendered:true};
 c.state.player.level=50;c.state.player.attributes.力量=100;
 let killed;
 for(let i=0;i<40;i++){const out=await run(c,'world_combat',{target},`kill_${i}`);if(out.result.targetHp===0){killed=out;break;}}
 assert.ok(killed);assert.equal(hiddenCheckBonus(engine,killed.document.state,'player','wildlife_observe').bonus,0);
 assert.equal(hiddenCheckBonus(engine,killed.document.state,'player','disarm').bonus,0);
 const count=killed.document.state.careerMetrics.surrenderKills.length;
 assert.equal(count,1);assert.equal(killed.document.state.careerMetrics.kills,1);
 killed.document.state.minute+=engine.byId.get(role(1)).trigger.minimum*1440;
 assert.equal(hiddenCheckBonus(engine,killed.document.state,'player','wildlife_observe').bonus,1);
 assert.equal(hiddenCheckBonus(engine,killed.document.state,'player','disarm').bonus,0);
});

test('护送防御加二进入实际交锋；违约停用，真实付款补偿后恢复，不能重复用付款',async()=>{
 const c=fresh(3);escort(c);assert.equal(hiddenCombat(engine,c.state).defense,2);
 const foe='monster_hidden_guard';c.state.created[foe]={id:foe,name:'交锋夹具',aliases:[],template:2,levelRange:[1,1]};
 c.state.creatures[foe]={name:'交锋夹具',location:c.state.location,hp:1000,maxHp:1000,level:10,status:'正常'};
 const plain=structuredClone(c);plain.state.professions.hidden=[];let guarded=false;
 for(let i=0;i<20;i++){
  const a=await run(c,'world_combat',{target:foe},`guard_${i}`),b=await run(plain,'world_combat',{target:foe},`guard_${i}`);
  if(a.result.received<b.result.received){assert.equal(b.result.received-a.result.received,2);guarded=true;break;}
 }
 assert.ok(guarded,'当前护送防御必须实际减少交锋伤害');
 c.state.obligations.broken={id:'broken',type:'付款',promisor:'player',promisee:'npc_hw_luqing',coins:20,status:'违约',resolvedAt:50,breachedBy:['player']};
 assert.equal(hiddenCombat(engine,c.state).defense,0);
 c.state.minute=600;c.state.location='bld_hw_school';Object.assign(c.state.npcs.npc_hw_luqing,{location:c.state.location,status:'正常',activity:'清醒研习'});
 const promised=await run(c,'world_promise',{type:'付款',promisor:'player',promisee:'npc_hw_luqing',coins:20,content:'补偿违约',deadline:c.state.minute+1},'comp');
 const payment=promised.result.obligation.id,paid=await run(promised.document,'world_time',{minutes:1},'pay');
 assert.equal(paid.document.state.obligations[payment].status,'已完成');assert.equal(paid.document.state.player.coins,c.state.player.coins-20);
 const restored=await run(paid.document,'world_profession',{profession:role(3),choice:payment},'restore');
 assert.equal(hiddenCombat(engine,restored.document.state).defense,2);
 await assert.rejects(run(restored.document,'world_profession',{profession:role(3),choice:payment},'again'),/已经使用/);
 const noEscort=structuredClone(restored.document);noEscort.state.obligations.escort.status='已完成';assert.equal(hiddenCombat(engine,noEscort.state).defense,0);
});

test('宠物信任仅自有且照护合格时提高一成；饥病即时停用，治疗恢复后重启',()=>{
 const c=fresh(11);c.state.pets.pet={status:'活跃'};c.state.creatures.pet={owner:'player',status:'正常',care:{hunger:20,sickness:false}};
 assert.equal(petTrustGain(engine,c.state,'pet',5),5.5);
 c.state.creatures.pet.care.sickness=true;assert.equal(petTrustGain(engine,c.state,'pet',5),5);
 c.state.creatures.pet.care.sickness=false;c.state.creatures.pet.care.hunger=engine.rules.petCare.hungryThreshold;assert.equal(petTrustGain(engine,c.state,'pet',5),5);
 c.state.creatures.pet.care.hunger=0;assert.equal(petTrustGain(engine,c.state,'pet',5),5.5);
 c.state.creatures.pet.owner=null;assert.equal(petTrustGain(engine,c.state,'pet',5),5);
});

test('听石密集噪声下观察耗时加倍；无隐藏职业时保持旧检定行为',async()=>{
 const c=fresh(5),args={attribute:'智力',skill:'skill_life_17_core',difficulty:10,contextReason:'岩层勘查'};
 const quiet=await run(c,'world_check',args,'listen');assert.equal(quiet.result.hiddenPassive.bonus,1);
 c.state.records.noise={category:'heard_sound',subject:'player',minute:c.state.minute,volume:80};
 const loud=await run(c,'world_check',args,'listen');assert.equal(loud.result.observationMinutes,quiet.result.observationMinutes*2);
 assert.equal(loud.document.state.minute-c.state.minute,loud.result.observationMinutes);
});

test('风向、契约见证、已知锚点、役灵与施工来源缺失时，不凭理由文字取得加成',()=>{
 const c=fresh(9,10,15,16,17,22,24,30);
 for(const domain of ['sailing','contract','anchor','summon','dyke','rune_copy','public_pact','escort'])assert.equal(hiddenCheckBonus(engine,c.state,'player',domain).bonus,0,domain);
 c.state.records.wind={category:'air_weather',location:c.state.location,expires:101,windVector:[1,0]};assert.equal(hiddenCheckBonus(engine,c.state,'player','sailing').bonus,1);
 c.state.minute=101;assert.equal(hiddenCheckBonus(engine,c.state,'player','sailing').bonus,0);
});

test('NPC当前隐藏职业覆盖目录身份，实体视图不把旧加成复制进人物数据',()=>{
 const c=fresh(),npc='npc_hw_luqing';c.state.npcs[npc].hiddenProfessions=[role(4)];
 assert.ok(personCareer(engine,c.state,npc).value.roles.includes(role(4)));
 assert.equal(hiddenCheckBonus(engine,c.state,npc,'metalwork').bonus,1);
 c.state.npcs[npc].hiddenProfessions=[];assert.equal(hiddenCheckBonus(engine,c.state,npc,'metalwork').bonus,0);
});

test('自有宠物实际喂食按一成结算信任，食物照常扣除',async()=>{
 const c=fresh(11),pet='monster_m4r_pet';
 c.state.created[pet]={id:pet,name:'夹具岸犬',aliases:[],template:0,levelRange:[1,1],tamingRule:{category:'support',minimumSkill:100,minimumPlayerLevel:1,trustThreshold:20,minutes:60,difficulty:10,food:[{item:'item_ration',hungerRelief:50,trustGain:5}],skills:[],rideable:false}};
 c.state.creatures[pet]={name:'夹具岸犬',location:c.state.location,hp:30,maxHp:30,level:1,status:'正常',owner:'player',care:{version:1,hunger:20,fatigue:0,mood:60,loyalty:50,sickness:false,sickHours:0,neglectHours:0,nextTick:c.state.minute+60,bond:30,feedDay:-1,skills:{},experience:0}};
 c.state.pets[pet]={petFormat:1,creature:pet,category:'support',status:'活跃'};
 c.state.inventory.item_ration={quantity:5,quality:'木',durability:100,weight:0.2};
 const fed=await run(c,'world_pet',{operation:'feed',target:pet,item:'item_ration'},'feed');
 assert.equal(fed.result.care.bond,35.5);assert.equal(fed.document.state.inventory.item_ration.quantity,4);
});
