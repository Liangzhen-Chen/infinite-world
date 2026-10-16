import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPatches} from '../server-plugin/storage.mjs';
import {createTransportAsset,transportAssetView,transportServices,quoteTransport,bookTransport,advanceTransport,nextTransportMinute,transportIncident,transportTrace,leaseTransportAsset,collectTransport} from '../server-plugin/transport.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {applyInteraction} from '../server-plugin/interactions.mjs';
import {toolDefinitions} from '../extension/tools.mjs';

import {fixture,asset,finish,DRIVER,SECOND,RECIPIENT} from './helpers/transport.mjs';
const cash=d=>d.get('state','player','coins')+Object.values(d.get('state','npcs')).reduce((n,p)=>n+(p.coins??0),0)+Object.values(d.get('state','settlements')).reduce((n,s)=>n+(s.treasury??0),0)+Object.values(d.get('state','quests')).reduce((n,q)=>n+(q.escrow??0),0);

test('车船制造消费实物，容量和班次随当前损耗、职业及租约派生，读取无写入',()=>{
 const {e,d,w}=fixture(),id=asset(d,e),before=structuredClone(d.document);
 assert.equal(d.get('state','npcs',DRIVER,'inventory','item_wood','quantity'),100);
 assert.equal(transportAssetView(e,d.get('state'),id).capacityKg,600);assert.equal(transportServices(e,d.get('state'),'loc_hw').length,1);assert.deepEqual(d.document,before);
 d.set(['state','records',id,'durability'],40);assert.equal(transportAssetView(e,d.get('state'),id).capacityKg,300);
 d.set(['state','records',id,'durability'],10);assert.equal(transportServices(e,d.get('state'),'loc_hw').length,0);
 d.set(['state','records',id,'durability'],100);w.npcs.find(n=>n.id===DRIVER).occupation='农人';assert.equal(transportServices(e,d.get('state'),'loc_hw').length,0);
 assert.ok(traitsOf(e,d.document,id).tags.includes('wood'));
 applyInteraction(d,e,{agent:'fire',target:id});assert.equal(d.get('state','records',id,'durability'),75);
 const total=cash(d);leaseTransportAsset(d,e,{asset:id,tenant:SECOND,minutes:1000,coins:20},'lease');assert.equal(cash(d),total);assert.equal(transportAssetView(e,d.get('state'),id).holder,SECOND);
 d.set(['state','minute'],1600);assert.equal(transportAssetView(e,d.get('state'),id).holder,DRIVER);
});
test('运费读取重量体积、路程风险；超载和缺货失败前不扣款，单件实物守恒交付',()=>{
 const {e,d,w}=fixture(),id=asset(d,e);d.set(['state','inventory','item_oats'],{quantity:30});
 const q=quoteTransport(d,e,{asset:id,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:10}]});
 w.routes[0].risk=2;assert.ok(quoteTransport(d,e,{asset:id,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:10}]}).total>q.total);
 const before=structuredClone(d.document);assert.throws(()=>bookTransport(d,e,{asset:id,to:'loc_bs',cargo:[{item:'item_oats',quantity:31}]},'bad'),/货物不足/);assert.deepEqual(d.document,before);
 assert.throws(()=>quoteTransport(d,e,{asset:id,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:2000}]}),/容量/);
 d.set(['state','npcs',RECIPIENT,'location'],'loc_bs');const total=cash(d),trip=bookTransport(d,e,{asset:id,to:'loc_bs',recipient:RECIPIENT,cargo:[{item:'item_oats',quantity:10}]},'cargo');
 assert.equal(cash(d),total);assert.equal(e.quantity(d,'player','item_oats'),20);assert.equal(e.quantity(d,RECIPIENT,'item_oats'),50);assert.equal(d.get('state','npcs',DRIVER,'location'),'loc_hw');
 const got=finish(d,e,trip.id);assert.equal(got.status,'delivered');assert.equal(e.quantity(d,RECIPIENT,'item_oats'),60);assert.equal(got.cargo.length,0);assert.equal(cash(d),total);assert.ok(d.get('state','records',id,'durability')<100);
 const final=structuredClone(d.document);advanceTransport(d,e,d.get('state','minute'));assert.deepEqual(d.document,final);
});
test('真实乘客受座位容量限制，逐节点定位；桥断、季节与战事封路使货物滞留，修复后继续',()=>{
 const {e,d,w}=fixture(),id=asset(d,e),trip=bookTransport(d,e,{asset:id,to:'loc_yp_path',passengers:['player']},'passage');
 w.routes[1].closedSeasons=[0,1,2,3];let row;
 for(let i=0;i<10;i++){const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);row=d.get('state','records',trip.id);if(row.status==='delayed')break;}
 assert.equal(row.status,'delayed');assert.equal(d.get('state','location'),'loc_bs');assert.equal(transportTrace(e,d.get('state'),trip.id).position.route,'transport-road-2');
 assert.throws(()=>transportTrace(e,d.get('state'),trip.id,SECOND),/身份/);
 w.routes[1].closedSeasons=[];assert.equal(finish(d,e,trip.id).status,'delivered');assert.equal(d.get('state','location'),'loc_yp_path');
});
test('护送使用现有委托托管，护送者存活时不能跳过守卫劫货，抵达只支付一次',()=>{
 const {e,d}=fixture(),id=asset(d,e),total=cash(d),trip=bookTransport(d,e,{asset:id,to:'loc_bs',escort:SECOND},'escort');
 assert.ok(trip.escortQuest);assert.equal(cash(d),total);assert.throws(()=>transportIncident(d,e,{shipment:trip.id},'raid'),/护送者/);
 finish(d,e,trip.id);const q=d.get('state','quests',trip.escortQuest);assert.equal(q.status,'已完成');assert.equal(q.escrow,0);assert.equal(cash(d),total);
});
test('现有工具可下承运单、推进并重放，不增加工具数',async()=>{
 const {e,d}=fixture(),id=asset(d,e);const before=structuredClone(d.document),event={tool:'world_trade',args:{operation:'transport',task:'book',seller:DRIVER,contract:id,location:'loc_bs',service:'passage'},eventId:'tool-book'};
 const result=await e.reduce(before,event);const got=applyPatches(before,result.patches);assert.ok(Object.values(got.state.records).some(r=>r.category==='transport'));
 assert.deepEqual((await e.reduce(before,event)).patches,result.patches);assert.equal(toolDefinitions().length,27);
 assert.match(e.scene(got),/乘车船/);assert.throws(()=>e.move({...d,document:got},{destination:'loc_bs'},'jump'),/承运班次/);
 const waited=await e.reduce(got,{tool:'world_time',args:{minutes:600},eventId:'travel'});assert.equal(applyPatches(got,waited.patches).state.location,'loc_bs');
});
test('货物到站保管须本人现场提取，单件耐久与归属往返不复制',()=>{
 const {e,d}=fixture(),id=asset(d,e),unit='unit:freight';d.set(['state','inventory','item_staff'],{quantity:1,instances:[unit]});d.set(['state','itemInstances',unit],{id:unit,item:'item_staff',owner:'player',status:'持有',durability:37});
 const trip=bookTransport(d,e,{asset:id,to:'loc_bs',cargo:[{item:'item_staff',quantity:1}]},'single');
 for(let i=0;i<10&&d.get('state','records',trip.id,'status')!=='arrived';i++){const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);}
 assert.equal(d.get('state','records',trip.id,'status'),'arrived');assert.equal(e.quantity(d,'player','item_staff'),0);assert.throws(()=>collectTransport(d,e,trip.id),/亲到/);
 d.set(['state','location'],'loc_bs');collectTransport(d,e,trip.id);assert.equal(e.quantity(d,'player','item_staff'),1);assert.equal(d.get('state','itemInstances',unit,'owner'),'player');assert.equal(d.get('state','itemInstances',unit,'durability'),37);assert.deepEqual(d.get('state','inventory','item_staff','instances'),[unit]);assert.throws(()=>collectTransport(d,e,trip.id));
});
test('桥路损毁与战事封锁消费现有状态；体积约束独立于重量',()=>{
 const {e,d,w}=fixture(),id=asset(d,e),t=bookTransport(d,e,{asset:id,to:'loc_yp_path'},'bridge');
 const bridge='bld_transport_bridge';e.byId.set(bridge,{id:bridge,type:'bld',facilityType:'bridge',route:'transport-road-2',parent:'loc_bs'});d.set(['state','buildings',bridge],{condition:0,route:'transport-road-2'});
 for(let i=0;i<5&&d.get('state','records',t.id,'status')!=='delayed';i++){const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);}assert.equal(d.get('state','records',t.id,'status'),'delayed');
 d.set(['state','buildings',bridge,'condition'],100);d.set(['state','records','war:test'],{category:'war_disruption',since:0,until:99999,routes:['transport-road-2']});const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);assert.equal(d.get('state','records',t.id,'status'),'delayed');d.remove(['state','records','war:test']);finish(d,e,t.id);
 d.set(['state','npcs',SECOND,'location'],'loc_hw');const other=asset(d,e,SECOND,'cart','volume');w.items.find(i=>i.id==='item_oats').volumeM3=4;assert.throws(()=>quoteTransport(d,e,{asset:other,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_oats',quantity:1}]}),/体积/);
});
test('驮队绑定真实动物，容量读物种，疲劳、失主和已骑乘会撤销运力',()=>{
 const {e,d}=fixture(),animal='animal:pack';d.set(['state','creatures',animal],{species:'monster_slate_horn_bull',owner:DRIVER,location:'loc_hw',hp:30,maxHp:30,status:'正常',care:{version:1,fatigue:0,hunger:0,loyalty:80}});
 const a=createTransportAsset(d,e,{owner:DRIVER,kind:'pack',animal},'pack');assert.equal(a.capacityKg,30);
 d.set(['state','creatures',animal,'care'],{version:1,fatigue:90,hunger:0});assert.equal(transportAssetView(e,d.get('state'),a.id).capacityKg,0);
 d.set(['state','creatures',animal,'care'],{version:1,fatigue:0,hunger:0});d.set(['state','player','mount'],animal);assert.equal(transportAssetView(e,d.get('state'),a.id).capacityKg,0);d.remove(['state','player','mount']);
 d.set(['state','creatures',animal,'owner'],SECOND);assert.equal(transportAssetView(e,d.get('state'),a.id).capacityKg,0);
});
test('运费商税、关税和过路费进入实际公账，报价与支付一致',()=>{
 const {e,d,w}=fixture(),id=asset(d,e);w.routes[0].toll=7;d.set(['state','inventory','item_wood'],{quantity:20});const q=quoteTransport(d,e,{asset:id,from:'loc_hw',to:'loc_bs',cargo:[{item:'item_wood',quantity:20}]}),before=cash(d),player=d.get('state','player','coins');
 const trip=bookTransport(d,e,{asset:id,to:'loc_bs',cargo:[{item:'item_wood',quantity:20}]},'tax');assert.equal(cash(d),before);assert.equal(player-d.get('state','player','coins'),q.total);assert.equal(trip.toll,7);assert.ok(Object.values(d.get('state','records')).some(r=>r.category==='trade_tax'&&r.kind==='tariff'));
});
