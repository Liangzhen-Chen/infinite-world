import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateNpcLifeRules,marriageBlocker,npcHousehold,householdMembers,npcIsMinor} from '../server-plugin/npc-life.mjs';
import {relationView,recordNpcRelationEvidence,recordFestivalRelations} from '../server-plugin/npc-relations.mjs';
import {npcAvailability} from '../server-plugin/npc-schedule.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import {history} from '../server-plugin/ui-history.mjs';
import {buildChronicle,collectChronicleFacts} from '../server-plugin/chronicle.mjs';
import {renderHistoryPanel} from '../extension/people-history.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,start=10*DAY+600;
const man='npc_hw_anhuai',woman='npc_hw_jiaoyou',sister='npc_hw_baihui',coupleHome='bld_hw_home_20';
const day=(location,activity='闲坐')=>({default:[{start:0,end:1440,location,activity,services:[]}]});
const quiet={bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};

// A cloned world with selected npcLife rules; nothing in the catalog changes.
function setup({life={},prep=()=>{},world:edit=()=>{}}={}){
 const world=structuredClone(source),find=id=>world.npcs.find(n=>n.id===id),r=world.rules.npcLife;
 world.rules.npcLife={...r,...life,health:{...r.health,...quiet,...life.health},birth:{...r.birth,conceptionChancePerDay:0,...life.birth},
  migration:{...r.migration,...life.migration},kindness:{...r.kindness,...life.kindness}};
 edit(world,find);
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'npc-life-t164');
 doc.state.minute=start;doc.state.location='loc_bs_liquan';
 for(const row of Object.values(doc.state.records))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(start/DAY)-1;
 for(const row of Object.values(doc.state.settlements))row.starvation=-100;
 const s={world,engine,doc};prep(s,find);return s;
}
async function wait(s,minutes,tag='w'){const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`${tag}-${s.doc.state.minute}-${minutes}`});s.doc=applyPatches(s.doc,out.patches);return out;}
const family=s=>s.doc.state.family??{};
const npc=(s,id)=>s.doc.state.npcs[id];
const knows=(s,id,root)=>(npc(s,id)?.memoryStream??[]).find(m=>(m.rootMemoryId??m.id)===root);
const meet=(id,minute,location)=>({id:`fact-${id}-${minute}`,sourceEvent:`meet-${id}-${minute}`,sequence:1,minute,location,participants:['player',id],entities:['player',id],visibleTo:['player'],kind:'talk',salience:3,text:`旅人与${id}说过话。`});
const panel=(s,facts)=>history(s.engine,s.doc,buildChronicle(facts,{now:s.doc.state.minute,viewer:'omniscient'}));
const lifeOf=(view,id)=>view.people.items.find(row=>row.id===id)?.life??null;

// The couple from the family tests, quickly married with a child.
const wedding=extra=>setup({life:{courtship:{...source.rules.npcLife.courtship,days:2,marriageChancePerDay:1},birth:{conceptionChancePerDay:1,gestationDays:3},...extra},
 world:(w,find)=>{for(const id of [man,woman,sister])find(id).schedule=day(coupleHome);},
 prep:s=>{for(const id of [man,woman,sister])Object.assign(npc(s,id),{location:coupleHome,activity:'闲坐'});
  for(const [a,b] of [[man,woman],[woman,man]])npc(s,a).relationships[b]={trust:70,affection:70};}});
const ours=rows=>Object.values(rows??{}).filter(r=>r.mother===woman);

test('参数登记有效：成婚门槛仍为双方信任与好感≥50，日常往来与外乡收留参数受校验',()=>{
 assert.deepEqual(validateNpcLifeRules(source),[]);
 assert.equal(source.rules.npcLife.courtship.minimumTrust,50);assert.equal(source.rules.npcLife.courtship.minimumAffection,50);
 const bad=structuredClone(source);bad.rules.npcLife.kindness.cowork.cap=90;bad.rules.npcLife.kindness.help={affection:30};bad.rules.npcLife.migration.stranger.chancePerDay=3;
 assert.equal(validateNpcLifeRules(bad).length,3);
});

test('看得见：在场人物的婚姻、子女当面可知；人物面板只给玩家应知的部分，目击或面见亲历者后才更新',async()=>{
 const s=wedding();
 s.doc.state.location=coupleHome;await wait(s,30,'saw');s.doc.state.location='loc_bs_liquan';
 const metAt=s.doc.state.minute,facts=[meet(man,metAt,coupleHome)];
 await wait(s,8*DAY,'life');
 const [b]=ours(family(s).births),[m]=Object.values(family(s).marriages).filter(x=>!x.static&&x.partners.includes(man));
 assert.ok(b&&m);
 // Away from the village the panel knows nothing new about 安槐.
 let view=panel(s,facts);
 assert.deepEqual(lifeOf(view,man),[],JSON.stringify(lifeOf(view,man)));
 assert.equal(family(s).seenByPlayer?.[m.id],undefined,'玩家不在场，不算目击');
 // Back in the house the people in front of the player show their household.
 s.doc.state.location=coupleHome;
 const card=sceneCard(s.engine,s.doc,'');
 const name=id=>npc(s,id).name,child=npc(s,b.child);
 assert.ok(child&&child.life.kind==='born');
 assert.match(card,new RegExp(`${name(man)}（${man}）[^\\n]*\\n(?:.*\\n)*?  家况，当面可知：配偶：${name(woman)}`));
 assert.match(card,new RegExp(`子女：${child.name}`));
 assert.match(card,new RegExp(`${child.name}（${b.child}）｜幼童，0岁`),'孩子作为在场的人出现');
 // Meeting the sister, who saw the wedding and the birth herself, tells the player.
 view=panel(s,[...facts,meet(sister,s.doc.state.minute,coupleHome)]);
 assert.equal(knows(s,sister,m.id)?.sourceType,'目击');
 const lines=lifeOf(view,man);
 assert.ok(lines.some(l=>l.startsWith(`配偶：${name(woman)}`))&&lines.some(l=>l.includes(child.name)),JSON.stringify(lines));
 // The rendered card lists it under a household heading.
 class El{constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.classList={add(){}};this.isConnected=true;this.text='';}
  append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;this.text='';}
  set textContent(t){this.text=String(t);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ');}setAttribute(k,v){this[k]=v;}}
 const doc={createElement:t=>new El(t,doc),createDocumentFragment:()=>new El('fragment',doc)},root=new El('div',doc);
 renderHistoryPanel(root,{...view,reference:{campaignId:'t164'}},'people',{});
 assert.match(root.textContent,/家况（截至你最后获知）/);assert.match(root.textContent,new RegExp(child.name));
});

test('看得见：病痛、照护、离世与搬迁按玩家知情显示；亲眼所见写入编年史',async()=>{
 const elder='npc_hw_miaozhen',home='bld_hw_home_15';
 const s=setup({life:{health:{bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:66,illnessPerYear:360,graveShare:1,suddenDeathPerYear:0}],graveFatality:{cared:1,alone:1}}},
  world:(w,find)=>{find(elder).schedule=day(home);},prep:s=>{Object.assign(npc(s,elder),{location:home});s.doc.state.location=home;}});
 const before=structuredClone(s.doc);
 await wait(s,DAY,'ill');
 const ill=Object.values(family(s).illnesses).find(r=>r.patient===elder);
 assert.equal(ill.severity,'重');assert.ok(family(s).seenByPlayer[ill.id],'玩家当晚就在屋里');
 const facts=collectChronicleFacts(s.engine,before,s.doc,{eventId:'ill-x'});
 assert.ok(facts.some(f=>f.visibleTo.includes('player')&&f.text.includes('病重卧床')),JSON.stringify(facts.map(f=>f.text)));
 let card=sceneCard(s.engine,s.doc,'');
 assert.match(card,/家况，当面可知：[^\n]*病重卧床/);
 const carer=ill.caregivers[0];assert.ok(carer);
 assert.match(card,new RegExp(`在家照护${npc(s,elder).name}`));
 // She dies the next night; the player away hears only from a first-hand witness met later.
 s.doc.state.location='loc_bs_liquan';
 await wait(s,DAY,'die');
 const death=Object.values(family(s).deaths).find(r=>r.person===elder);assert.ok(death);
 let view=panel(s,[meet(elder,start,home)]);
 assert.ok(!lifeOf(view,elder).some(l=>l.includes('病故')),'没见过知情人就不知道死讯');
 view=panel(s,[meet(elder,start,home),meet(carer,s.doc.state.minute,home)]);
 assert.ok(lifeOf(view,elder).some(l=>/^已于.*病故$/.test(l)),JSON.stringify(lifeOf(view,elder)));
});

test('发生得了：帮忙、送礼、共同干活、节日同席都实际提高好感；好感由此过线后才开始交往，门槛不降',async()=>{
 const a='npc_hw_taozhi',b='npc_hw_xuling',shop='bld_hw_herbs';
 const s=setup({life:{kindness:{...source.rules.npcLife.kindness,cowork:{...source.rules.npcLife.kindness.cowork,everyDays:1}}},
  world:(w,find)=>{for(const id of [a,b])find(id).schedule={default:[{start:0,end:480,location:'bld_hw_riverhome',activity:'睡眠',services:[]},{start:480,end:1080,location:shop,activity:'在药铺做活',services:[]},{start:1080,end:1440,location:'bld_hw_riverhome',activity:'歇息',services:[]}]};},
  prep:s=>{for(const id of [a,b])Object.assign(npc(s,id),{location:shop,activity:'在药铺做活'});}});
 const v0=relationView(s.engine,s.doc.state,a,b);assert.ok(v0.trust>=50&&v0.affection<50,JSON.stringify(v0));
 assert.match(marriageBlocker(s.engine,s.doc.state,a,b),/不愿意/,'起初好感不够，不交往');
 await wait(s,DAY,'c1');
 const v1=relationView(s.engine,s.doc.state,a,b);
 assert.equal(v1.affection,v0.affection+2);assert.equal(v1.routine.coworkTimes,1);
 await wait(s,3*DAY,'c2');
 assert.ok(relationView(s.engine,s.doc.state,a,b).affection>=50&&relationView(s.engine,s.doc.state,b,a).affection>=50);
 assert.ok(family(s).courtships?.[[a,b].sort().join('|')],'双方都过了原门槛才开始交往');
 await wait(s,20*DAY,'c3');await wait(s,20*DAY,'c4');
 assert.equal(relationView(s.engine,s.doc.state,a,b).affection,60,'日常同处干活只到上限为止');
 // Help, a gift and a shared festival each add regard through the evidence ledger.
 const t=setup(),x='npc_hw_chenbai',y='npc_hw_gucen';
 const before=structuredClone(t.doc.state),base=relationView(t.engine,before,x,y).affection,baseYX=relationView(t.engine,before,y,x).affection;
 before.obligations.h={id:'h',type:'协助',promisor:y,promisee:x,content:'帮着抄完旧账',status:'进行中',createdAt:start};
 before.obligations.g={id:'g',type:'送货',promisor:x,promisee:y,content:'送一篮新米',item:'item_rice',quantity:1,status:'进行中',createdAt:start};
 const d={document:{...t.doc,state:structuredClone(before)},get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);}};
 d.set(['state','obligations','h','status'],'已完成');d.set(['state','obligations','g','status'],'已完成');
 recordNpcRelationEvidence(d,t.engine,before,'time',{},{},'kind-1');
 assert.equal(relationView(t.engine,d.get('state'),x,y).affection,base+2,'帮忙');
 assert.equal(relationView(t.engine,d.get('state'),y,x).affection,baseYX+3,'送礼');
 d.set(['state','records','fest'],{resultEvent:'festival-result:fest'});
 recordFestivalRelations(d,t.engine,{id:'fest',status:'held',resultEvent:'festival-result:fest',participants:[x,y],resolvedAt:start});
 assert.equal(relationView(t.engine,d.get('state'),x,y).affection,base+4,'节日同席');
});

test('发生得了：缺粮时没有亲友也可去外乡肯收留的人家谋生；没有余粮的地方不收留，每户只收一位外人',async()=>{
 const hungry=s=>{s.doc.state.settlements.loc_hw.starvation=5;return s;};
 const mig={livelihood:{...source.rules.npcLife.migration.livelihood,chancePerDay:1},stranger:{...source.rules.npcLife.migration.stranger,chancePerDay:1}};
 const none=hungry(setup({life:{migration:{...mig,stranger:{...mig.stranger,foodDays:100000}}}}));
 await wait(none,3*DAY,'none');
 assert.deepEqual(Object.values(family(none).migrations??{}),[],'外乡都没有多一口人的余粮，不搬');
 const s=hungry(setup({life:{migration:mig}}));
 await wait(s,2*DAY,'go');
 const moves=Object.values(family(s).migrations??{});
 assert.ok(moves.length>0);
 const lead=moves.filter(m=>!m.with);
 for(const m of lead){assert.equal(m.reason,'谋生');assert.equal(m.stranger,true);assert.notEqual(m.to.settlement,'loc_hw');assert.ok(s.doc.state.settlements[m.to.settlement].starvation<3);}
 const perHouse=new Map();for(const m of lead)perHouse.set(m.to.household,(perHouse.get(m.to.household)??0)+1);
 assert.ok([...perHouse.values()].every(n=>n===1),'每户只收一位外来者');
 const plan=knows(s,lead[0].person,`${lead[0].id}:plan`);assert.match(plan.content,/外乡肯收留人的人家谋生/);
});

test('名册配偶需要生育时才补成有状态的人物；孩子进入人口、作息和健康，不进入恋爱，也不干活',async()=>{
 const mother='npc_wt_heqin',spouse='npc_wt_haoyu';
 const s=setup({life:{birth:{conceptionChancePerDay:1,gestationDays:2}}});
 assert.equal(npc(s,spouse),undefined,'起初只是名册人物');
 const population=s.doc.state.settlements.loc_bs_weiting.population;
 await wait(s,DAY,'b1');
 const p=Object.values(family(s).pregnancies).find(x=>x.mother===mother);assert.ok(p);assert.equal(p.father,spouse);
 assert.equal(npc(s,spouse).life.kind,'roster');assert.equal(npc(s,spouse).life.reason,'生育');
 assert.equal(npc(s,spouse).coins,0);assert.deepEqual(npc(s,spouse).inventory,{});assert.equal(npc(s,spouse).name,s.world.residents.find(r=>r.id===spouse).name);
 assert.ok(relationView(s.engine,s.doc.state,spouse,mother).affection>=40,'名册一方对配偶的看法取对方登记的那条');
 await wait(s,3*DAY,'b2');
 const birth=Object.values(family(s).births).find(x=>x.mother===mother),child=birth.child;
 assert.equal(s.doc.state.settlements.loc_bs_weiting.population>=population+1,true);
 assert.equal(npcHousehold(s.engine,s.doc.state,child).id,'house_wt_07');
 assert.ok(householdMembers(s.engine,s.doc.state,'house_wt_07').includes(child));
 assert.equal(npc(s,child).life.kind,'born');assert.equal(s.doc.state.created[child].flags.romanceable,false);
 assert.ok(npcIsMinor(s.engine,s.doc.state,child));
 // Routine at home, no services, no work.
 await wait(s,Math.floor(s.doc.state.minute/DAY)*DAY+DAY+720-s.doc.state.minute,'noon');
 const at=npcAvailability(s.engine,s.doc.state,child);
 assert.deepEqual(at.services,[]);assert.match(at.activity,/由家人照看|在家中玩耍/);
 assert.match(marriageBlocker(s.engine,s.doc.state,child,mother),/有独立状态|未成年/);
 assert.equal(npc(s,child).location,'bld_wt_home_07','孩子随作息留在家');
});

test('名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承，家人随迁，议事资格按当前户籍',async()=>{
 const elder='npc_hw_miaozhen',home='bld_hw_home_15',husband='npc_hw_shaohe';
 const s=setup({life:{health:{bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:67,illnessPerYear:360,graveShare:1,suddenDeathPerYear:0}],graveFatality:{cared:0.0001,alone:0.0001}}},
  world:(w,find)=>{find(elder).schedule=day(home);},prep:s=>{Object.assign(npc(s,elder),{location:home,coins:40});}});
 await wait(s,DAY,'care');
 const ill=Object.values(family(s).illnesses).find(r=>r.patient===elder);assert.equal(ill.severity,'重');
 assert.ok(npc(s,husband),'名册丈夫补成有状态的人物');
 assert.equal(npc(s,husband).life.reason,'照护家人');assert.equal(npc(s,husband).caring?.patient,elder);
 assert.deepEqual(ill.caregivers,[husband]);
 // A death brings the rest of the roster household in; the husband inherits.
 const d=setup({life:{health:{bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:67,illnessPerYear:0,graveShare:0,suddenDeathPerYear:1}]}},
  world:(w,find)=>{find(elder).schedule=day(home);},prep:s=>{Object.assign(npc(s,elder),{location:home,coins:40});}});
 await wait(d,DAY,'death');
 const death=Object.values(family(d).deaths).find(r=>r.person===elder);assert.ok(death);
 assert.equal(death.estate.heir,husband);assert.equal(npc(d,husband).coins,40);
 for(const id of ['npc_hw_shaoyun','npc_hw_shaoyu'])assert.equal(npc(d,id)?.life?.kind,'roster',id);
 // A mother leaving for a living takes her young child; the full adult spouse decides alone.
 const parent='npc_hw_shijin',kid='npc_hw_luoxing';
 const m=setup({life:{migration:{livelihood:{...source.rules.npcLife.migration.livelihood,chancePerDay:1},stranger:{...source.rules.npcLife.migration.stranger,chancePerDay:1}}}});
 m.doc.state.settlements.loc_hw.starvation=5;
 await wait(m,DAY,'plan');
 const lead=Object.values(family(m).migrations).find(x=>x.person===parent),follow=Object.values(family(m).migrations).find(x=>x.person===kid);
 assert.ok(lead&&follow,JSON.stringify(Object.values(family(m).migrations).map(x=>[x.person,x.with])));
 assert.equal(follow.with,parent);assert.equal(follow.to.household,lead.to.household);assert.equal(npc(m,kid).life.reason,'随家人迁居');
 assert.ok(!Object.values(family(m).migrations).some(x=>x.person==='npc_hw_luowei'&&x.with),'成年正式配偶不被代为决定');
 await wait(m,6*DAY,'arrive');
 const done=family(m).migrations[lead.id],kidDone=family(m).migrations[follow.id];
 assert.equal(done.status,'已抵达');assert.equal(kidDone.status,'已抵达');
 assert.equal(npcHousehold(m.engine,m.doc.state,kid).id,lead.to.household);
 // Governance: the person who moved away is no longer a resident of the old village and is one of the new.
 const village=source.settlementProfiles.find(p=>p.id===lead.to.settlement&&p.details?.governance);
 assert.ok(village);{
  m.doc.state.location=village.details.governance.meetingPlace;
  const out=await m.engine.reduce(m.doc,{tool:'world_settlement',args:{settlement:village.id,operation:'governance_inspect'},eventId:'gov-new'});
  assert.ok(out.result.eligible.includes(parent),'迁入者按当前户籍成为新村成年住户');
  assert.ok(!out.result.eligible.includes(kid),'未成年人不算');
 }
 const g=setup(),gv=source.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),leaver=gv.residentIds.find(id=>g.doc.state.npcs[id]&&npcHousehold(g.engine,g.doc.state,id)&&!npcIsMinor(g.engine,g.doc.state,id));
 const fromHouse=npcHousehold(g.engine,g.doc.state,leaver).id,toHouse=source.households.find(h=>h.settlement==='loc_bs_weiting').id;
 g.doc.state.location=gv.details.governance.meetingPlace;
 const inspect=async(settlement,tag)=>(await g.engine.reduce(g.doc,{tool:'world_settlement',args:{settlement,operation:'governance_inspect'},eventId:tag})).result.eligible;
 assert.ok((await inspect('loc_bs_yupo','g1')).includes(leaver));
 g.doc.state.family={households:{[fromHouse]:{members:[],left:[leaver]},[toHouse]:{members:[leaver]}}};
 assert.ok(!(await inspect('loc_bs_yupo','g2')).includes(leaver),'迁走的人不再算原地住户');
 g.doc.state.location=source.settlementProfiles.find(p=>p.id==='loc_bs_weiting').details.governance.meetingPlace;
 assert.ok((await inspect('loc_bs_weiting','g3')).includes(leaver));
});

test('跟在玩家身边的人也会生病，但猝死和重病致死不在玩家身边结算，分开后照常',async()=>{
 const elder='npc_hw_miaozhen';
 const s=setup({life:{health:{bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:60,illnessPerYear:0,graveShare:1,suddenDeathPerYear:1}]}},
  prep:s=>{s.doc.state.location='loc_hw_fields';npc(s,elder).location='loc_hw_fields';s.doc.state.player.companions=[elder];}});
 await wait(s,DAY,'with');
 assert.notEqual(npc(s,elder).status,'死亡','同行时不在眼前猝死');
 assert.ok(Object.values(family(s).deaths??{}).some(r=>r.person!==elder),'不同行的老人照常结算');
 const sick=setup({life:{health:{bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0},{fromAge:60,illnessPerYear:360,graveShare:1,suddenDeathPerYear:0}],graveFatality:{cared:1,alone:1}}},
  prep:s=>{s.doc.state.location='loc_hw_fields';npc(s,elder).location='loc_hw_fields';s.doc.state.player.companions=[elder];}});
 await wait(sick,DAY,'s1');
 const ill=Object.values(family(sick).illnesses).find(r=>r.patient===elder);
 assert.ok(ill,'同行者夜里也会发病');assert.equal(npc(sick,elder).status,'患病');
 assert.ok(npc(sick,elder).medical.symptoms.some(x=>x.kind==='fever'&&x.observable));
 assert.ok(!Object.values(sick.doc.state.npcs).some(n=>n.caring?.patient===elder),'人在玩家身边，不派家人在家照护');
 await wait(sick,2*DAY,'s2');
 assert.equal(npc(sick,elder).status,'患病','重病在玩家身边不致死');
 sick.doc.state.player.companions=[];
 await wait(sick,DAY,'s3');
 assert.equal(npc(sick,elder).status,'死亡','分开后照常结算');
});
