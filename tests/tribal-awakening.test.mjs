import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {advanceRegistry} from '../server-plugin/advance-registry.mjs';
import {advanceQuestSources,questGenerators} from '../server-plugin/quest-sources.mjs';
import {sapient,awakeningView} from '../server-plugin/wildlife-awakening.mjs';
import {organization} from '../server-plugin/organizations.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {validateTribalAwakening,advanceTribalAwakening,tribalKey,tribalOrgId,tribalWars,tribalSettlementSkeleton,TRIBAL_OUTCOMES} from '../server-plugin/tribal-awakening.mjs';

const source=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440,Q=90*DAY;
const badger='badger_northwood',troll='troll_adit';
const dynOf=(engine,id)=>engine.rules.tribalAwakening.dynamics.find(x=>x.id===id);
function setup(seed='tribal-test',legacyResources=false){
 const world=structuredClone(source);for(const n of world.npcs){delete n.tier;delete n.schedule;}
 if(legacyResources)delete world.rules.forestWater;
 const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},seed);
 return{world,engine,doc};
}
// A draft with the reducer's get/set/remove/say surface, applying patches as it goes.
function draft(doc){
 return{document:doc,patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push(path);},
  remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(m){this.messages.push(m);}};
}
let serial=0;
function creature(engine,doc,dynId){
 const dyn=dynOf(engine,dynId),h=engine.rules.wildlife.habitats.find(x=>x.id===dyn.habitat),id=`monster_instance_t${++serial}`;
 (doc.state.creatures??={})[id]={name:`测试${serial}`,species:dyn.species,ecology:dyn.habitat,location:h.location,level:3,hp:20,maxHp:20,status:'正常',owner:null,since:doc.state.minute};
 return id;
}
const quarter=(engine,d,at)=>{advanceTribalAwakening(d,engine,{before:at-1,after:at});return d.get('state','records',tribalKey(badger));};
const event=(d,id,row)=>d.set(['state','records',`world_event:${id}`],{category:'world_event',id,witnesses:[],tags:[],location:'loc_hw_northwood',...row});
// Bring one dynamic straight to the split (立意 + 三派) at the given quarter.
function splitAt(engine,doc,dynId,at,members=2){
 const ids=Array.from({length:members},()=>creature(engine,doc,dynId)),d=draft(doc),th=engine.rules.tribalAwakening.thresholds;
 d.set(['state','records',tribalKey(dynId)],{category:'tribal_awakening',id:dynId,status:'听息',progress:th.liyi-1,totals:{magic:0,teach:0,injustice:0},taught:0,
  choiceTotals:{teach:0,trade:0,mediate:0,suppress:0},seen:{displaced:0},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null,lastTick:at-Q});
 advanceTribalAwakening(d,engine,{before:at-1,after:at});
 return{d,ids};
}

test('正式数据通过校验；三条初始动态挂靠聚居地；坏数据被拒；推进与委托生成器已登记',()=>{
 assert.deepEqual(validateTribalAwakening(source),[]);
 const t=source.rules.tribalAwakening;assert.ok(t.dynamics.length>=3);
 for(const dyn of t.dynamics)assert.ok(source.locations.find(l=>l.id===dyn.anchor.society).monsterSociety,dyn.id);
 for(const change of [w=>w.rules.tribalAwakening.dynamics[0].factions.pop(),w=>w.rules.tribalAwakening.dynamics[0].anchor.faction='faction_missing',
  w=>w.rules.tribalAwakening.thresholds.liyi=1,w=>w.rules.tribalAwakening.dynamics[0].demands[0].quest.reward=999999,w=>w.rules.tribalAwakening.dynamics[1].species='monster_missing']){
  const bad=structuredClone(source);change(bad);assert.ok(validateTribalAwakening(bad).length);
 }
 assert.ok(advanceRegistry.some(s=>s.id==='tribal_awakening'));
 assert.ok(questGenerators().some(g=>g.id==='tribal_awakening'));
});

test('三类来源按季累积：灵地与首领领地、玩家与导师的教导、伤害与灾害的不公',()=>{
 const {engine,doc}=setup(),id=creature(engine,doc,badger),d=draft(doc),at=Q;
 // 玩家传授记录、对族群个体的伤害、本地灾害阶段，都落在本季之内。
 d.set(['state','creatures',id,'cultivation'],{skills:{},recipes:{},sessions:[{kind:'teach',entity:'skill_x',gained:10,by:'player',event:'t1',minute:at-5*DAY}]});
 event(d,'hit1',{verb:'harm',actor:'npc_hw_wushuo',target:id,harm:4,tags:['combat','hostile'],minute:at-3*DAY});
 d.set(['state','records','hazard-clock:test'],{category:'hazard_clock',id:'test',settlement:'loc_hw',history:[{minute:at-10*DAY,applied:true},{minute:at-200*DAY,applied:true}]});
 const rec=quarter(engine,d,at),row=rec.quarters.at(-1),w=engine.rules.tribalAwakening.sources;
 assert.ok(row.magic>0&&row.detail.lairs>0,'北林有首领领地与灵性同栖物种');
 assert.equal(row.detail.taught,1);assert.deepEqual(row.detail.tutors,['npc_ms_td_qingzhi']);
 assert.equal(row.teach,Math.min(w.teach.cap,w.teach.player+w.teach.npc));
 assert.equal(row.detail.harmed,1);assert.equal(row.detail.hazards,1);
 assert.equal(row.injustice,w.injustice.harm+w.injustice.hazard);
 assert.equal(rec.progress,dynOf(engine,badger).initialProgress+row.magic+row.teach+row.injustice);
 // 导师的教导写成世界事件，不重复写。
 assert.equal(Object.values(d.document.state.records).filter(r=>r.category==='world_event'&&r.verb==='learn'&&r.tribe===badger).length,1);
 assert.equal(row.choices.teach,1);
 // 同一季重复推进不重复计数。
 const again=quarter(engine,d,at);assert.equal(again.progress,rec.progress);assert.equal(again.quarters.length,1);
});

test('越过听息与立意阈值时，已现身的同族个体按开灵阶段批量开灵；后来现身者下季跟上',()=>{
 const {engine,doc}=setup(),a=creature(engine,doc,badger),b=creature(engine,doc,badger),other=creature(engine,doc,troll),d=draft(doc);
 const th=engine.rules.tribalAwakening.thresholds;
 d.set(['state','records',tribalKey(badger)],{category:'tribal_awakening',id:badger,status:'萌动',progress:th.tingxi-1,totals:{magic:0,teach:0,injustice:0},taught:0,
  choiceTotals:{teach:0,trade:0,mediate:0,suppress:0},seen:{displaced:0},quarters:[],awakened:[],factions:[],demands:[],population:0,outcome:null,lastTick:0});
 let rec=quarter(engine,d,Q);
 assert.equal(rec.status,'听息');assert.equal(rec.intelligence,'守常');
 for(const id of [a,b])assert.equal(awakeningView(engine,d.document.randomSeed,id,d.get('state','creatures',id),Q).stage,'听息');
 assert.ok(!sapient(d.get('state','creatures',a)));
 // 推到立意：两只同时立意，别族个体不受影响。
 d.set(['state','records',tribalKey(badger),'progress'],th.liyi-1);
 rec=quarter(engine,d,2*Q);
 assert.equal(rec.status,'分化');assert.deepEqual(rec.awakened,[a,b].sort());
 for(const id of [a,b]){const m=d.get('state','creatures',id).mind;assert.equal(m.awakened.stage,'立意');assert.equal(m.awakened.kind,'clock');}
 assert.ok(!sapient(d.get('state','creatures',other)));
 assert.ok(rec.population>=2);assert.equal(rec.intelligence,'自主');
 const c=creature(engine,doc,badger);d.document.state.creatures[c]=doc.state.creatures[c];
 rec=quarter(engine,d,3*Q);
 assert.ok(sapient(d.get('state','creatures',c)));assert.ok(rec.awakened.includes(c));
 assert.ok(rec.factions.some(org=>d.get('state','records',`organization:${org}`).members[c]));
});

test('立意后提出诉求、分成三派组织并各带派别时钟；诉求与冲突经U17出委托',()=>{
 const {engine,doc}=setup(),{d,ids}=splitAt(engine,doc,badger,Q);
 const rec=d.get('state','records',tribalKey(badger)),dyn=dynOf(engine,badger);
 assert.deepEqual(rec.demands.map(x=>x.name),dyn.demands.map(x=>x.name));
 assert.deepEqual(rec.factions,['radical','accord','recluse'].map(s=>tribalOrgId(badger,s)));
 const placed=[];
 for(const id of rec.factions){
  const org=organization(engine,d.document.state,id);
  assert.equal(org.source,'created');assert.equal(org.kind,'会社');assert.ok(org.charter.rules[0]);
  assert.equal(d.get('state','records',`tribal_clock:${id}`).filled,0);
  placed.push(...Object.keys(org.members));
 }
 assert.deepEqual(placed.sort(),[...ids].sort());
 // 诉求传闻由K6 rumor效果交给携带者。
 assert.ok(d.get('state','npcs','npc_hw_wushuo').memoryStream.some(m=>m.content.includes('开了灵智')));
 // 午夜：诉求委托挂到河湾村告示处，由公账托管报酬。
 const treasury=d.get('state','settlements','loc_hw','treasury'),beforeQuests=new Set(Object.keys(d.document.state.quests));
 advanceQuestSources(d,engine,{before:Q,after:Q+DAY});
 const quests=Object.values(d.document.state.quests).filter(q=>q.source?.generator==='tribal_awakening');
 assert.equal(quests.length,dyn.demands.filter(x=>x.quest).length);
 assert.ok(quests.every(q=>q.location==='loc_hw'&&q.publisher==='npc_hw_chenbai'&&q.fundedBy?.treasury==='loc_hw'&&q.escrow===q.reward));
 // T155 also posts a local commission; reconcile every new hold against this public account.
 const funded=Object.values(d.document.state.quests).filter(q=>!beforeQuests.has(q.id)&&q.fundedBy?.treasury==='loc_hw');
 assert.equal(d.get('state','settlements','loc_hw','treasury'),treasury-funded.reduce((n,q)=>n+q.escrow,0));
 advanceQuestSources(d,engine,{before:Q+DAY,after:Q+2*DAY});
 assert.equal(Object.values(d.document.state.quests).filter(q=>q.source?.generator==='tribal_awakening').length,quests.length,'同一诉求不重复出委托');
 // 激进派时钟过半时出冲突委托，以族群结局为完成条件。
 const rc=`tribal_clock:${tribalOrgId(badger,'radical')}`;d.set(['state','records',rc,'filled'],3);d.set(['state','settlements','loc_hw','treasury'],2000);
 advanceQuestSources(d,engine,{before:Q+2*DAY,after:Q+3*DAY});
 const conflict=Object.values(d.document.state.quests).find(q=>q.source?.key===`tribal:${badger}:conflict`);
 assert.deepEqual(conflict.objective,{type:'record',record:tribalKey(badger),field:'status',equals:['结盟','自治','潜伏']});
 // 完成的诉求委托算作玩家的选择，诉求标为已回应。
 const mediate=quests.find(q=>q.source.cause===`${badger}:mediate`);
 d.set(['state','quests',mediate.id],{...mediate,status:'已完成',taker:'player',resolvedAt:Q+10*DAY});
 const next=quarter(engine,d,2*Q);
 assert.equal(next.quarters.at(-1).choices.mediate,1);
 assert.equal(next.demands.find(x=>x.id==='territory').status,'已回应');
});

test('未启用RW04的旧归档世界保留自治公账形状与原目录时序',async()=>{
 const {engine,d,rec}=await play('mediate',badger,true),id=rec.outcome.settlement;
 assert.equal(d.get('state','settlements',id,'granary'),undefined);
 assert.equal(engine.byId.has(`${id}_wild`),false);
 assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='ecology'&&r.habitat.includes(`${id}_wild`)));
});

// 每季注入一次玩家的同一种作为，直到出结局。
async function play(choice,dynId=badger,legacyResources=false){
 const {engine,doc}=setup(`tribal-${choice}-${dynId}`,legacyResources),{d,ids}=splitAt(engine,doc,dynId,Q,3),dyn=dynOf(engine,dynId);
 const orgs=d.get('state','records',tribalKey(dynId)).factions;
 for(let q=2;q<=12;q++){
  const at=q*Q,m=at-20*DAY;
  if(choice==='teach')d.set(['state','creatures',ids[0],'cultivation'],{skills:{},recipes:{},sessions:[...d.get('state','creatures',ids[0],'cultivation')?.sessions??[],{kind:'teach',by:'player',minute:m,event:`t${q}`}]});
  if(choice==='trade')event(d,`trade${q}`,{verb:'trade',actor:'player',target:dyn.brokers[0],value:20,tags:['trade','cash'],minute:m});
  if(choice==='mediate')event(d,`org${q}`,{verb:'organize',actor:'player',target:orgs[1],tags:['organization','org:deposit'],minute:m});
  if(choice==='suppress')for(let i=0;i<3;i++)event(d,`hit${q}_${i}`,{verb:'harm',actor:'player',target:ids[i],harm:2,tags:['combat','hostile','violence'],minute:m+i});
  advanceTribalAwakening(d,engine,{before:at-1,after:at});
  const rec=d.get('state','records',tribalKey(dynId));if(rec.outcome)return{engine,d,rec,orgs,dyn,quarters:q};
 }
 assert.fail(`${choice}十一季内没有结局`);
}
test('五种玩家选择各自改变走向：教导与贸易结盟、调停自治、镇压潜伏、无视按族群本性',async()=>{
 const teach=await play('teach');
 assert.equal(teach.rec.status,'结盟');assert.equal(teach.rec.outcome.stance,'accord');
 assert.ok(standing(teach.engine,teach.d.document.state,teach.orgs[1],'player')>0,'受教的和解派对玩家友善');
 assert.equal(teach.d.get('state','records',`world_event:${teach.rec.outcome.sourceEvent}`).verb,'pact');
 assert.ok(teach.d.get('state','records',`organization:${teach.orgs[1]}`).tribal.affiliation==='loc_hw');
 const trade=await play('trade');assert.equal(trade.rec.status,'结盟');
 const mediate=await play('mediate');
 assert.equal(mediate.rec.status,'自治');
 const settlement=mediate.d.get('state','records',`tribal_settlement:${badger}`);
 assert.equal(settlement.skeleton.id,mediate.rec.outcome.settlement);assert.equal(settlement.skeleton.council,mediate.orgs[1]);
 assert.ok(mediate.dyn.settlementNames.includes(settlement.skeleton.name));
 const wild=mediate.engine.rules.wildlife.habitats.find(h=>h.location===`${settlement.skeleton.id}_wild`);
 assert.ok(wild,'新栖地在同一次推进中立即进入目录');assert.ok(mediate.engine.byId.has(wild.location));
 assert.equal(mediate.d.get('state','records',`ecology:${wild.id}`).lastDay,Math.floor(settlement.minute/DAY)-1);
 assert.equal(mediate.d.get('state','settlements',settlement.skeleton.id,'granary'),false,'自治建立不凭空生成公共粮仓');
 // 骨架是种子与数据的纯函数：同种子同结果。
 const again=tribalSettlementSkeleton(mediate.d.document.randomSeed,mediate.dyn,{population:settlement.skeleton.population,leader:settlement.skeleton.leader,council:mediate.orgs[1],minute:settlement.minute,home:mediate.engine.byId.get(mediate.dyn.home)});
 assert.deepEqual(again,settlement.skeleton);
 const suppress=await play('suppress');
 assert.equal(suppress.rec.status,'潜伏');assert.equal(suppress.rec.outcome.stance,'recluse');
 assert.ok(standing(suppress.engine,suppress.d.document.state,suppress.orgs[0],'player')<=-30,'激进派记恨镇压');
 assert.ok(suppress.rec.quarters.some(r=>r.detail.harmed===3),'镇压同时记为不公');
 const ignoreBadger=await play('ignore');
 assert.equal(ignoreBadger.rec.status,TRIBAL_OUTCOMES[ignoreBadger.dyn.accordOutcome]);
 const ignoreTroll=await play('ignore',troll);
 for(const result of [teach,trade,mediate,suppress,ignoreBadger,ignoreTroll]){
  const ids=result.engine.world.locations.map(l=>l.id);assert.equal(new Set(ids).size,ids.length,'自治刷新不会重复追加此前目录');
 }
 assert.equal(ignoreTroll.rec.status,'战争');
 const war=tribalWars(ignoreTroll.d.document.state)[0];
 assert.equal(war.aggressor,tribalOrgId(troll,'radical'));assert.equal(war.handler,'U12');assert.deepEqual(war.defenders,['loc_bs_liquan','faction_ms_lielu']);
 assert.ok(ignoreTroll.d.get('state','records',`wildlife:stir:${ignoreTroll.dyn.habitat}`),'战事让栖地躁动');
 // 走向不同，结局也不同。
 assert.ok(teach.quarters<=ignoreBadger.quarters);
});

test('无人干预时三条动态按季自行推进，结果由种子决定；两年内出现觉醒',()=>{
 const run=seed=>{
  const {engine,doc}=setup(seed),d=draft(doc),log=[];
  for(let q=1;q<=12;q++){advanceTribalAwakening(d,engine,{before:q*Q-1,after:q*Q});log.push(engine.rules.tribalAwakening.dynamics.map(x=>{const r=d.get('state','records',tribalKey(x.id));return `${r.status}:${r.progress}`;}));}
  return{engine,d,log};
 };
 const a=run('ignore-seed'),b=run('ignore-seed');
 assert.deepEqual(a.log,b.log);
 for(const dyn of a.engine.rules.tribalAwakening.dynamics){
  const rec=a.d.get('state','records',tribalKey(dyn.id));
  assert.equal(rec.quarters.length,12);
  assert.ok(rec.quarters.every((r,i)=>i===0||r.progress>=rec.quarters[i-1].progress),'进度只增不减');
  assert.notEqual(rec.status,'萌动',`${dyn.id}两年后仍未觉醒`);
 }
 assert.ok(a.engine.rules.tribalAwakening.dynamics.some(x=>Object.values(TRIBAL_OUTCOMES).includes(a.d.get('state','records',tribalKey(x.id)).status)),'三年内至少一条动态已有结局');
 // 新势力：分化后的派别组织登记在战役记录里。
 assert.ok(Object.values(a.d.document.state.records).some(r=>r.category==='organization'&&r.tribal));
});

test('真实推进：世界时钟跨过季度边界时结算，场景呈现族群变化',async()=>{
 const {engine,doc}=setup('tribal-real');let c=doc;
 let result;
 for(const n of [30,30,30,1]){const out=await engine.reduce(c,{tool:'world_time',args:{minutes:n*DAY},eventId:`w${n}${c.state.minute}`});c=applyPatches(c,out.patches);result=out.result;}
 assert.ok(c.state.minute>=Q);
 for(const dyn of engine.rules.tribalAwakening.dynamics)assert.equal(c.state.records[tribalKey(dyn.id)].lastTick,Q);
 // 场景卡：到了已分化族群的地方才提到它们。
 const s=setup('tribal-scene'),sp=splitAt(s.engine,s.doc,badger,Q);
 const view=structuredClone(sp.d.document);view.state.location='loc_hw_northwood';
 assert.match(sceneCard(s.engine,view),/【族群】.*北林穴脚林獾已立意.*掘界群/);
});
