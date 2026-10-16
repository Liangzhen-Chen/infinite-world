import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {ensureArmies,createArmy,armyKey,armyStrength,partyCoins,releaseLevy,raiseLevy} from '../server-plugin/military.mjs';
import {validateWarDiplomacy,startWar,campaignRound,endWar,advanceWarDiplomacy,warAction,wars} from '../server-plugin/war-diplomacy.mjs';
import {advanceTribalAwakening,tribalWars,tribalOrgId} from '../server-plugin/tribal-awakening.mjs';
import {advanceQuestSources} from '../server-plugin/quest-sources.mjs';
import {advanceNpcLife} from '../server-plugin/npc-life.mjs';
import {standing,adjustStanding} from '../server-plugin/standing.mjs';
import {hazardPriceFactor,warRouteClosed} from '../server-plugin/hazard-calendar.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
function setup(seed='war-test'){
 const world=structuredClone(source);for(const n of world.npcs){delete n.tier;delete n.schedule;}
 const e=new WorldEngine(world),doc=e.createCharacter(legacy,{},seed);
 const d={document:doc,patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(){}};
 e.airDraft=d;ensureArmies(d,e,0);return {world,e,d};
}
const getArmy=(d,id)=>structuredClone(d.get('state','records',armyKey(id)));
const getWar=(d,id)=>structuredClone(d.get('state','records',`war:${id}`));
const border=(e,d)=>startWar(d,e,e.rules.warDiplomacy.sources[0],28*DAY,'border-test');

test('战争数据、注册表和现有工具入口可用，坏来源被拒',()=>{
 assert.deepEqual(validateWarDiplomacy(source),[]);
 for(const change of [r=>r.intervalDays=1,r=>r.sources[0].front='loc_missing',r=>r.sources[0].armies=['army_missing'],r=>r.sources[0].territory='county_missing',r=>r.quest.reward=1]){
  const w=structuredClone(source);change(w.rules.warDiplomacy);assert.ok(validateWarDiplomacy(w).length);
 }
 assert.ok(advanceRegistry.some(s=>s.id==='war_diplomacy'));
 const t=toolDefinitions();assert.equal(t.length,27);
 for(const op of ['war_inspect','war_join','diplomacy'])assert.ok(t.find(t=>t.function.name==='world_settlement').function.parameters.properties.operation.enum.includes(op));
});

test('T142 非人郡边境来源经 standing 宣战，按周结算并可重放；旧事件不补新战争',()=>{
 const run=()=>{const {e,d}=setup();advanceWarDiplomacy(d,e,{before:27*DAY,after:43*DAY});return {e,d,w:getWar(d,'zheya_border')};};
 const {e,d,w}=run();assert.deepEqual(run().w,w);assert.equal(w.source,'T142 非人郡边境');assert.equal(w.rounds,2);
 assert.ok(standing(e,d.get('state'),w.aggressor,w.defender)<=-50);assert.equal(getArmy(d,'army_heilu_band').war,w.id);
 assert.ok(w.history[0].right.terrain>1);assert.ok(Object.values(w.history[0].losses).some(n=>n>0));
 const old=setup();old.e.replaying=true;old.e.replayResult={};advanceWarDiplomacy(old.d,old.e,{before:0,after:50*DAY});assert.equal(wars(old.d.get('state')).length,0);
 const calm=setup(),s=calm.e.rules.warDiplomacy.sources[0];
 for(const [holder,target] of [[s.aggressor,s.defender],[s.defender,s.aggressor]])adjustStanding(calm.d,calm.e,holder,target,30,{sourceEvent:'prior-peace',reason:'边境交涉'});
 advanceWarDiplomacy(calm.d,calm.e,{before:27*DAY,after:29*DAY});assert.equal(wars(calm.d.get('state')).length,0,'既有交涉改善立场可以阻止来源宣战');
});

test('U11 真实季度推进产生 tribal_war，U12 接管砾泉苔背巨魔对裂炉营',()=>{
 const {e,d}=setup('ignore-seed');let t;
 for(let q=1;q<=12&&!t;q++){advanceTribalAwakening(d,e,{before:q*90*DAY-1,after:q*90*DAY});t=tribalWars(d.get('state')).find(t=>t.dynamic==='troll_adit');}
 assert.ok(t,'U11 自行走到战争');assert.equal(t.aggressor,tribalOrgId('troll_adit','radical'));
 advanceWarDiplomacy(d,e,{before:t.since,after:t.since+DAY});const w=wars(d.get('state')).find(w=>w.source==='tribal_war');
 assert.ok(w);assert.equal(w.defender,'faction_ms_lielu');assert.ok(w.armyIds.includes('army_lielu_guard'));assert.equal(d.get('state','records','tribal_war:troll_adit').status,'交战');
 campaignRound(d,e,w,w.nextAt);assert.equal(w.rounds,1);
});

test('战役兵力、士气与补给参与力量计算，traits 地形和季节有实际系数',()=>{
 const {e,d}=setup(),w=border(e,d),snapshot=structuredClone(d.document);
 const normal=campaignRound(d,e,w,35*DAY);
 d.document=structuredClone(snapshot);const a=getArmy(d,'army_heilu_band');a.hungry=true;a.morale=10;d.set(['state','records',armyKey(a.id)],a);
 const hungry=campaignRound(d,e,getWar(d,w.id),35*DAY);assert.ok(hungry.left.power<normal.left.power);assert.equal(hungry.right.terrain,normal.right.terrain);
 d.document=structuredClone(snapshot);const winter=campaignRound(d,e,getWar(d,w.id),280*DAY);assert.equal(winter.season,3);assert.ok(winter.left.power<normal.left.power);
 d.document=structuredClone(snapshot);for(const id of w.armyIds){const a=getArmy(d,id);a.regular=1;d.set(['state','records',armyKey(id)],a);}
 campaignRound(d,e,getWar(d,w.id),35*DAY);assert.equal(getWar(d,w.id).winner,null,'双方全军覆没时不产生占领者');assert.ok(!d.get('state','records',`territory:${w.territory}`));
});

test('战役封路供贸易与人物寻路读取，掠粮守恒并涨价，战争记忆进入迁居与传闻路径',()=>{
 const {e,d}=setup(),w=border(e,d);w.front='loc_hw';w.villages=['loc_hw'];w.routes=['route_bs_yp'];
 d.set(['state','npcs','npc_hw_xuling','location'],'loc_hw');
 const from=d.get('state','settlements','loc_hw','food'),out=d.get('state','records','agriculture:loc_hw','ledger','sold');
 campaignRound(d,e,w,35*DAY);
 assert.ok(warRouteClosed(d.get('state'),'route_bs_yp',35*DAY));
 assert.throws(()=>e.route('loc_bs','loc_bs_yupo','walk',35*DAY,d.document.randomSeed),/没有当前季节/);
 assert.equal(hazardPriceFactor(e,d.get('state'),'item_oats','loc_hw',35*DAY),1.25);
 assert.equal(from-d.get('state','settlements','loc_hw','food'),40);
 assert.equal(d.get('state','records','agriculture:loc_hw','ledger','sold')-out,40);
 assert.ok(regionalTradePrice(d,e,'item_oats','loc_hw',35*DAY)>0);
 const mover='npc_hw_xuling',host='npc_yp_fengya';
 // The existing migration policy retains consent, capacity and a traversable route.
 e.rules.npcLife.migration.refuge.chancePerDay=1;
 for(const [a,b] of [[mover,host],[host,mover]]){e.byId.get(a).relationships.push({with:b,type:'旧友',trust:60,affection:50});e.byId.get(a).schedule=structuredClone(source.npcs.find(n=>n.id===a).schedule);}
 d.set(['state','npcs',mover,'life'],{source:'test'});d.set(['state','npcs',host,'life'],{source:'test'});
 d.set(['state','records',`war-disruption:${w.id}`,'routes'],[]);
 advanceNpcLife(d,e,35*DAY,36*DAY);
 assert.ok(Object.values(d.get('state','family','migrations')).some(m=>m.person===mover&&m.reason==='避祸'));
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='world_event'&&r.tags?.includes('rumor')&&r.claim?.includes('战报')));
});

test('战事经 U17 托管真实军需任务；玩家交付扣实物并补入参战军粮',async()=>{
 const {e,d}=setup(),w=border(e,d),q=e.rules.warDiplomacy.quest,publisher=q.publisher;
 d.set(['state','minute'],29*DAY);advanceWarDiplomacy(d,e,{before:28*DAY,after:29*DAY});advanceQuestSources(d,e,{before:28*DAY,after:29*DAY});
 const quest=Object.values(d.get('state','quests')).find(q=>q.source?.generator==='effect_table'&&q.source.cause===`war:${w.id}`);assert.ok(quest);assert.equal(quest.escrow,q.reward);assert.equal(quest.source.cause,`war:${w.id}`);
 const row=getArmy(d,w.armyIds.find(id=>getArmy(d,id).party===w.defender)),food=row.food;d.set(['state','location'],q.board);d.set(['state','npcs',publisher,'location'],q.board);e.itemDelta(d,'player',q.item,q.quantity);
 async function call(operation,id){const r=await e.reduce(d.document,{tool:'world_quest',args:{operation,quest:quest.id},eventId:id});d.document=applyPatches(d.document,r.patches);return r;}
 await call('accept','war-quest-accept');const before=e.quantity(d,'player',q.item);await call('complete','war-quest-complete');
 assert.equal(e.quantity(d,'player',q.item),before-q.quantity);assert.equal(getArmy(d,row.id).food,food+q.quantity);assert.equal(d.get('state','records',`${quest.id}:outcome`,'supplied'),q.quantity);
});

test('外交限授权与 standing；到前线获信任才能调停，停战到期恢复，议和清封路',()=>{
 const {e,d}=setup(),w=border(e,d);const args={operation:'diplomacy',org:w.aggressor,member:w.defender,clock:w.id,choice:'truce'};
 assert.throws(()=>warAction.call(e,d,args,'no-authority'),/权限/);
 d.set(['state','location'],w.front);for(const p of [w.aggressor,w.defender])adjustStanding(d,e,p,'player',20,{sourceEvent:`trust:${p}`,reason:'交涉'});
 const cash=d.get('state','player','coins');warAction.call(e,d,args,'truce');assert.equal(getWar(d,w.id).status,'停战');assert.equal(d.get('state','player','coins'),cash-40);
 const until=getWar(d,w.id).truceUntil;advanceWarDiplomacy(d,e,{before:until-1,after:until});assert.equal(getWar(d,w.id).status,'交战');
 warAction.call(e,d,{...args,choice:'peace'},'peace');assert.equal(getWar(d,w.id).status,'议和');assert.equal(getArmy(d,'army_heilu_band').war,null);assert.ok(!d.get('state','records',`war-disruption:${w.id}`));
});

test('玩家结盟可率私兵参战，敌对才能宣战，朝贡每月从败方公库实际转给胜方',()=>{
 const {e,d}=setup(),w=border(e,d),p=w.aggressor;d.set(['state','location'],w.front);
 assert.throws(()=>warAction.call(e,d,{operation:'diplomacy',org:'player',member:p,choice:'ally'},'low'),/立场/);
 adjustStanding(d,e,p,'player',60,{sourceEvent:'friend',reason:'援助'});
 warAction.call(e,d,{operation:'diplomacy',org:'player',member:p,choice:'ally'},'ally');
 createArmy(d,e,{id:'army_test_private',name:'随行私兵',party:'player',base:w.front,location:w.front,supply:'purchase',private:4,training:30,morale:60,payCopperMonth:60},0,'create');
 warAction.call(e,d,{operation:'war_join',clock:w.id,org:'army_test_private'},'join');assert.equal(getArmy(d,'army_test_private').warSide,p);
 const peace=endWar(d,e,getWar(d,w.id),{winner:w.aggressor,tribute:60,at:50*DAY,src:'victory'});
 assert.equal(catalogDefinition(e,d.document,{entity:w.territory,kind:'region'}).occupation.ruler,w.aggressor);
 const payer=w.defender,a=partyCoins(e,d.get('state'),payer),b=partyCoins(e,d.get('state'),w.aggressor);
 advanceWarDiplomacy(d,e,{before:80*DAY-1,after:80*DAY});assert.equal(partyCoins(e,d.get('state'),payer),a-60);assert.equal(partyCoins(e,d.get('state'),w.aggressor),b+60);assert.equal(peace.status,'议和');
 // A player's ungrounded declaration is rejected even with a real army.
 assert.throws(()=>warAction.call(e,d,{operation:'diplomacy',org:'player',member:p,choice:'declare'},'declare'),/立场/);
});

test('玩家用现有 world_combat 击溃参战人物后回写一次，普通伤害不能凭空赢战役',async()=>{
 const {e,d}=setup(),a=getArmy(d,'army_liquan_militia');raiseLevy(d,e,a,DAY,'levy');d.set(['state','records',armyKey(a.id)],a);
 const target=a.levy.people[0].id;const w=startWar(d,e,{id:'exchange',name:'交锋战场',aggressor:'county_xichui_longqu',defender:a.party,front:a.location,armies:['army_longqu_garrison',a.id]},DAY,'exchange-start');
 d.set(['state','location'],a.location);d.set(['state','npcs',target,'location'],a.location);d.set(['state','npcs',target,'hp'],1);d.set(['state','npcs',target,'maxHp'],100);
 d.set(['state','records','military_service:player'],{category:'military_service',army:'army_longqu_garrison',status:'在营'});
 d.set(['state','player','level'],90);d.set(['state','player','attributes','敏捷'],1000);
 const n=armyStrength(getArmy(d,a.id));let hit;
 for(let i=0;i<8&&!hit;i++){const r=await e.reduce(d.document,{tool:'world_combat',args:{target,intent:'attack'},eventId:`exchange-${i}`});d.document=applyPatches(d.document,r.patches);if(r.result.war)hit=r.result.war;}
 assert.ok(hit);assert.equal(armyStrength(getArmy(d,a.id)),n-1);assert.equal(getWar(d,w.id).score,1);assert.ok(d.get('state','npcs',target,'diedAt')!==undefined);
 assert.ok(!getArmy(d,a.id).levy.people.some(p=>p.id===target));
});
