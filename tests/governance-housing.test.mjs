import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const village=world.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),g=village.details.governance,head=g.head,hall=g.meetingPlace;
const authority=world.rules.governance.authority,charter=authority.superiors.auth_bs_office_charter,plot=authority.plots.plot_yp_north;
const clerk=world.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)).id;
const [steward,neighbour]=g.coordinators.filter(id=>id!==head),outsider='npc_wt_zhengxi';

async function setup(office='村长'){
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'housing-test');
 doc.state.location=charter.seat;doc.state.minute=540;doc.state.player.coins=500;
 Object.assign(doc.state.npcs[clerk],{location:charter.seat,activity:'公署递件'});
 const r=doc.state.records;
 r[`civic_citizen:${village.id}:player`]={category:'civic_citizen',subject:'player',settlement:village.id,status:'已登记'};
 r[`civic_resident:${village.id}:player`]={category:'civic_resident',subject:'player',settlement:village.id,status:'已登记'};
 r['civic_source:seed']={category:'civic_contribution',sourceEvent:'seed',settlement:village.id,subject:'player',kind:'donation',points:120,minute:0};
 r[`standing:${head}:player`]={category:'standing',holder:head,target:'player',value:30,history:[]};
 const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,out.patches),result:out.result};};
 doc=(await run(doc,'world_settlement',{operation:'governance_apply',settlement:village.id,name:office},'apply')).document;
 doc=(await run(doc,'world_time',{minutes:3*DAY},'decide')).document;
 doc=(await run(doc,'world_time',{minutes:DAY-60},'next-morning')).document;
 doc.state.location=hall;
 for(const id of [steward,neighbour,outsider])Object.assign(doc.state.npcs[id],{location:hall,activity:'议事',status:'正常',coins:200});
 const settle=(c,args,event)=>run(c,'world_settlement',{settlement:village.id,...args},event);
 const grant=(c,extra={},event='steward')=>settle(c,{operation:'governance_grant',authority:'player',action:'housing',steward,consent:true,plot:plot.id,proposedFee:30,...extra},event);
 const file=(c,extra={},event='file')=>settle(c,{operation:'governance_queue',action:'housing',plot:plot.id,...extra},event);
 // The steward works offscreen: the player leaves for the town before 10:00.
 const away=async(c,minutes=DAY,event='away')=>{c=structuredClone(c);c.state.location='loc_bs';return (await run(c,'world_time',{minutes},event)).document;};
 return {engine,doc,run,settle,grant,file,away};
}
const treasury=c=>c.state.settlements[village.id].treasury;

test('只有在任村长能派管事写建房规矩；费率不超过公布宅基费两倍，管事须在场同意',async()=>{
 const deputy=await setup('工役协理');
 await assert.rejects(deputy.grant(deputy.doc),/村长/);
 const s=await setup();
 await assert.rejects(s.grant(s.doc,{proposedFee:plot.feeCopper*2+1}),/宅基费/);
 await assert.rejects(s.grant(s.doc,{consent:false}),/同意/);
 await assert.rejects(s.grant(s.doc,{steward:outsider}),/本村成年住户/);
 const ok=await s.grant(s.doc);assert.deepEqual(ok.result.steward.rules,{plots:[plot.id],fees:{[plot.id]:30},eligibility:'resident'});
});

test('管事离屏按规矩办：合规者交宅基费进公账得批文，非本村居民与交不起费的退回且不收钱',async()=>{
 const s=await setup();let c=(await s.grant(s.doc)).document;const auth=c.state.records['housing_steward:steward'].id;
 c=(await s.file(c,{authorization:auth},'mine')).document;
 c=(await s.file(c,{authorization:auth,speaker:neighbour,consent:true},'neighbour')).document;
 c=(await s.file(c,{authorization:auth,speaker:outsider,consent:true},'outsider')).document;
 c.state.npcs[neighbour].coins=10;
 await assert.rejects(s.file(c,{authorization:auth,plot:'plot_wt_dry'},'other-plot'),/本村登记的宅基/);
 const before=treasury(c),coins=c.state.player.coins,outsiderCoins=c.state.npcs[outsider].coins;
 assert.equal(affairs(s.engine,c).settlements.find(x=>x.id===village.id).pending.filter(p=>p.name==='建房申请').length,3);
 c=await s.away(c);
 const rec=c.state.records;
 assert.equal(rec['housing_application:mine'].status,'已批准');assert.equal(rec['housing_permit:mine'].slot,1);assert.equal(rec['housing_permit:mine'].holder,'player');
 assert.equal(c.state.player.coins,coins-30);assert.equal(treasury(c)>=before+30,true);
 assert.match(rec['housing_application:neighbour'].reason,/宅基费/);assert.equal(c.state.npcs[neighbour].coins,10);
 assert.match(rec['housing_application:outsider'].reason,/居民/);assert.equal(c.state.npcs[outsider].coins,outsiderCoins);
 assert.equal(rec['housing_fee:housing_application:mine'].copper,30);
});

test('宅基满额、撤回管事、村长去职后越权申请一律退回；地租按年到期从持有人收进公账',async()=>{
 const s=await setup();let c=(await s.grant(s.doc)).document;const auth='housing_steward:steward';
 c=structuredClone(c);for(let i=0;i<plot.slots;i++)c.state.records[`housing_permit:seed${i}`]={category:'housing_permit',id:`housing_permit:seed${i}`,plot:plot.id,settlement:village.id,holder:'npc_yp_shile',status:'已建成',rentDue:1e9,annualRentCopper:12,arrears:0};
 c=(await s.file(c,{authorization:auth},'full')).document;
 let done=await s.away(c);assert.match(done.state.records['housing_application:full'].reason,/空余/);
 // A revoked steward and a removed head both stop approvals.
 let r=(await s.grant(s.doc)).document;r=(await s.file(r,{authorization:auth},'late')).document;
 r=(await s.settle(r,{operation:'governance_revoke',authorization:auth},'revoke')).document;
 r=await s.away(r);assert.match(r.state.records['housing_application:late'].reason,/撤回/);
 let h=(await s.grant(s.doc)).document;h=structuredClone((await s.file(h,{authorization:auth},'removed')).document);
 for(const x of Object.values(h.state.records))if(x.category==='governance_office')x.status='已免职';
 h=await s.away(h);assert.match(h.state.records['housing_application:removed'].reason,/不在任/);
 // Rent: the permit's yearly due date is collected on the steward's round.
 let p=(await s.grant(s.doc)).document;p=(await s.file(p,{authorization:auth},'rent')).document;p=await s.away(p);
 p=structuredClone(p);const permit=p.state.records['housing_permit:rent'];p.state.records['housing_permit:rent']={...permit,rentDue:p.state.minute+60};
 const coins=p.state.player.coins;p=await s.away(p,DAY,'year');
 assert.equal(p.state.player.coins,coins-plot.annualRentCopper); assert.ok(p.state.records['housing_permit:rent'].rentDue>p.state.minute+300*DAY);
 assert.ok(Object.values(p.state.records).some(x=>x.category==='housing_fee'&&x.kind==='地租'&&x.copper===plot.annualRentCopper));
});

test('批准与施工分开：持批文者自备材料到宅基开工，工期满后成为本人产权并可进入',async()=>{
 const s=await setup();let c=(await s.grant(s.doc)).document;
 c=(await s.file(c,{authorization:'housing_steward:steward'},'mine')).document;c=await s.away(c);
 assert.equal(Object.values(c.state.records).some(x=>x.category==='housing_permit'&&x.status==='施工中'),false);
 c.state.location=plot.location;
 await assert.rejects(s.settle(c,{operation:'start_project',authorization:'housing_permit:mine',name:'北坡小屋'},'build'),/材料/);
 c.state.inventory={...c.state.inventory,item_wood:plot.materials.wood};
 const started=await s.settle(c,{operation:'start_project',authorization:'housing_permit:mine',name:'北坡小屋'},'build');c=started.document;
 assert.equal(c.state.inventory.item_wood??0,0);assert.equal(c.state.records['housing_permit:mine'].status,'施工中');
 await assert.rejects(s.settle(c,{operation:'start_project',authorization:'housing_permit:mine',name:'再盖'},'again'),/已开工/);
 c=(await s.run(c,'world_time',{minutes:plot.buildDays*DAY},'wait')).document;
 const permit=c.state.records['housing_permit:mine'];assert.equal(permit.status,'已建成');
 assert.equal(c.state.buildings[permit.building].owner,'player');
 assert.ok(affairs(s.engine,c).holdings.some(x=>x.id===permit.building));
 const moved=await s.run(c,'move',{destination:permit.building},'home');assert.equal(moved.document.state.location,permit.building);
});
