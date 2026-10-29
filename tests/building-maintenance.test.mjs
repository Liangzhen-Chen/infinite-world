import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,inn,post,DAY} from './helpers/finance.mjs';
import {advanceFacilities} from '../server-plugin/facilities.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {advanceNpcAutonomy,npcAutonomyBusy} from '../server-plugin/npc-autonomy.mjs';
import {withLedger} from '../server-plugin/ledger.mjs';
import {conservation,reconcile} from './helpers/ledger-audit.mjs';
import {npcAvailability} from '../server-plugin/npc-schedule.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {autonomyCandidates} from '../server-plugin/autonomy-candidates.mjs';

test('有钱的登记业主营业建筑经历一季仍可营业；损耗有手算锚点且分段一致',()=>{
 const f=fixture({at:inn});delete f.w.rules.weather;
 const a=f.draft(),b=f.draft();
 // Existing Lin Sui and Qingdeng, starting condition70, purse500, occupied.
 // Five-year dry base: floor(180*(wood3+occupant1)*100/5400)=13.
 assert.equal(a.get('state','npcs',host,'coins'),500);
 advanceFacilities(a,f.e,{before:0,after:180*DAY});
 for(let day=0;day<180;day+=30)advanceFacilities(b,f.e,{before:day*DAY,after:(day+30)*DAY});
 assert.equal(facilityView(f.e,a.get('state'),inn).condition,57);
 assert.ok(facilityView(f.e,a.get('state'),inn).factor>0);
 assert.deepEqual(a.get('state','buildings',inn),b.get('state','buildings',inn));
 assert.equal(a.get('state','npcs',host,'coins'),500,'wear itself does not spend money or grant repairs');
 // Old partial wear survives rescaling:9/10 condition plus one occupied day.
 const c=f.draft();c.set(['state','buildings',inn,'wearUnits'],9);
 advanceFacilities(c,f.e,{before:0,after:DAY});
 assert.equal(c.get('state','buildings',inn,'condition'),70);
 assert.equal(c.get('state','buildings',inn,'wearUnits'),5260);
});

function repairFixture({materials=true,redLine=false}={}){
 const f=fixture({at:inn});f.doc.state.location='loc_hw';
 f.doc.state.buildings[inn].condition=59;
 // Scenario preparation, not new world content: same registered owner/building.
 if(materials)Object.assign(f.doc.state.npcs[host].inventory,{item_wood:{quantity:4},item_stone:{quantity:2}});
 if(redLine)f.w.npcs.find(n=>n.id===host).redLines=['repair_building'];
 f.doc=withLedger(f.e,f.doc).document;return f;
}
function work(f,day){
 const d=f.draft(),at=day*DAY+600;d.set(['state','minute'],at);
 const selected=autonomyCandidates(f.e,subjectiveView(f.e,d.document,host),{document:d.document}).find(c=>c.kind==='repair_building');
 advanceNpcAutonomy(d,f.e,at,at,`choose:${day}`,{beforeState:d.get('state')});
 const task=npcAutonomyBusy(d.get('state'),host,at);
 if(task){assert.equal(task.action.kind,'repair_building');assert.equal(selected.decision.outcome,'agree');assert.deepEqual(npcAvailability(f.e,d.get('state'),host).services,[]);}
 d.set(['state','minute'],at+240);advanceNpcAutonomy(d,f.e,at,at+240,`finish:${day}`);d.done();return task;
}
test('业主经主观决策实际修缮：木4石2入工程，四个240分钟班次后恢复，不凭空生料',()=>{
 const f=repairFixture(),before=structuredClone(f.doc);
 // ceil((100-59)/25)=2 workdays => wood4,stone2,960 real minutes.
 for(let day=0;day<4;day++){
  const task=work(f,day);assert.ok(task,JSON.stringify(f.doc.state.npcAutonomy?.tasks));
  assert.equal(facilityView(f.e,f.doc.state,inn).condition,day===3?100:59);
 }
 const p=Object.values(f.doc.state.projects).find(p=>p.type==='业主修缮'&&p.creator===host);
 assert.equal(p.minutesDone,960);assert.equal(p.status,'已完成');
 assert.equal(f.e.quantity({get:(...path)=>path.reduce((v,k)=>v?.[k],f.doc)},host,'item_wood'),0);
 assert.equal(f.e.quantity({get:(...path)=>path.reduce((v,k)=>v?.[k],f.doc)},host,'item_stone'),0);
 assert.equal(f.doc.state.npcs[host].coins,before.state.npcs[host].coins,'self labor has no invented contractor fee');
 assert.deepEqual(conservation(f.e,before,f.doc),[]);
 assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
 assert.deepEqual(reconcile(f.e,f.doc).lots,[]);
});
test('缺料或本人底线拒绝时不自动修好，不把掌柜视为驿站业主',()=>{
 for(const options of [{materials:false},{redLine:true}]){
  const f=repairFixture(options);work(f,0);
  assert.equal(facilityView(f.e,f.doc.state,inn).condition,59);
  assert.equal(Object.values(f.doc.state.projects).some(p=>p.type==='业主修缮'&&p.creator===host),false);
 }
 const f=fixture({at:post});f.doc.state.location='loc_hw';f.doc.state.buildings[post]={condition:10};
 Object.assign(f.doc.state.npcs[host].inventory,{item_wood:{quantity:20},item_stone:{quantity:20}});
 work(f,0);assert.equal(facilityView(f.e,f.doc.state,post).condition,10);
});
test('缺料的业主只向同地真实卖家采购，钱从本人钱袋支付且库存守恒',()=>{
 const f=repairFixture({materials:false}),seller='npc_hw_ayan';
 f.doc.state.npcs[host].inventory.item_wood={quantity:4};
 f.doc.state.npcs[seller].inventory.item_stone={quantity:2};
 delete f.doc.ledger;f.doc=withLedger(f.e,f.doc).document;
 const before=structuredClone(f.doc),d=f.draft();d.set(['state','minute'],600);
 const projected=subjectiveView(f.e,d.document,host),candidate=autonomyCandidates(f.e,projected,{document:d.document}).find(c=>c.id.startsWith('repair_material:'));
 assert.ok(candidate,'the existing on-site trader really has the requested material');
 assert.equal(candidate.decision.outcome,'agree');
 const {item,quantity}=candidate.legacy;
 const quote=facilityRuntime().currentTradeQuote(f.e,d.document,{buyer:host,seller,item,quantity,location:inn});
 advanceNpcAutonomy(d,f.e,600,600,'buy-material',{beforeState:d.get('state')});
 const task=npcAutonomyBusy(d.get('state'),host,600);assert.equal(task.action.kind,'trade');
 assert.equal(task.action.seller,seller);
 d.set(['state','minute'],605);advanceNpcAutonomy(d,f.e,600,605,'paid-material');d.done();
 assert.equal(f.doc.state.npcs[host].coins,before.state.npcs[host].coins-quote.totalCoins);
 assert.equal(f.doc.state.npcs[seller].coins,before.state.npcs[seller].coins+quote.totalCoins);
 assert.equal(facilityView(f.e,f.doc.state,inn).condition,59,'buying materials is not completed construction');
 assert.deepEqual(conservation(f.e,before,f.doc),[]);assert.deepEqual(reconcile(f.e,f.doc).mismatches,[]);
});
