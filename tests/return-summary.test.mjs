import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {returnChanges,returnPlace,RETURN_LIMIT} from '../server-plugin/return-summary.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,village='loc_bs_yupo',hall='bld_yp_hall';
const a='npc_yp_zhaofeng',b='npc_yp_qiaoduan',c='npc_yp_wenxu',e='npc_yp_jiangmi',kid='npc_born_test';

function fixture(){
 const world=structuredClone(source);
 // 健康随机关掉，等待期间只有测试放进去的变化。
 world.rules.npcLife.health={...world.rules.npcLife.health,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};
 // 本夹具只注入返场事实；T155自动告示另有专项，不能混入唯一丧事的断言。
 world.rules.questSources.wildlife=[];
 const engine=new WorldEngine(world),doc=engine.createCharacter(seed,{name:'试'},'return-summary');
 doc.state.location=hall;
 return {engine,doc};
}
async function run(s,tool,args,id){const out=await s.engine.reduce(s.doc,{tool,args,eventId:id});s.doc=applyPatches(s.doc,out.patches);return out;}
const from=10*DAY,to=15*DAY,mid=12*DAY;
function stateWith(engine,doc,fill){const state=structuredClone(doc.state);state.minute=to;state.family??={};state.records??={};fill(state);return state;}
const event=(id,row)=>[`world_event:${id}`,{category:'world_event',id,minute:mid,location:hall,witnesses:[],tags:[],...row}];

test('返场地点按聚落、聚居地、据点归属',()=>{
 const {engine}=fixture();
 assert.equal(returnPlace(engine,hall),village);
 assert.equal(returnPlace(engine,village),village);
 assert.equal(returnPlace(engine,'loc_bs_weiting'),'loc_bs_weiting');
});

test('离开期间各类变化都被汇总：生死婚迁、病、事件、组织、立场、粮价公仓、时钟、传闻',()=>{
 const {engine,doc}=fixture();
 const state=stateWith(engine,doc,s=>{
  s.family.deaths={d:{id:'d',person:a,minute:mid,cause:'病故',settlement:village}};
  s.family.people={[kid]:{id:kid,name:'乔小',sex:'女',flags:{minor:true}}};
  s.family.births={x:{id:'x',child:kid,mother:b,father:c,minute:mid,settlement:village}};
  s.family.marriages={m:{id:'m',partners:[c,e],since:mid,settlement:village}};
  s.family.migrations={g:{id:'g',person:e,from:{settlement:village},to:{settlement:'loc_bs_weiting'},status:'已抵达',departedAt:mid,arrivedAt:mid+60}};
  s.family.illnesses={i:{id:'i',patient:b,severity:'重',since:mid,status:'患病中',household:'house_yp_02'}};
  Object.assign(s.records,Object.fromEntries([
   event('h',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile'],witnesses:[e]}),
   event('o',{verb:'organize',actor:'org_test',target:null,tags:['organization','org:decide','motion:charter','passed']}),
   event('far',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile'],witnesses:[e],location:'loc_bs_weiting'})]));
  s.records['organization:org_test']={category:'organization',id:'org_test',source:'created',name:'坡口互助会',kind:'会社',seat:hall,members:{player:{position:'成员',joinedAt:0,arrears:0}}};
  s.records[`standing:${village}:player`]={category:'standing',holder:village,target:'player',value:-40,history:[]};
  s.records['quote:a']={category:'regional_quote',day:9,settlement:village,item:'item_oats',price:10};
  s.records['quote:b']={category:'regional_quote',day:14,settlement:village,item:'item_oats',price:16};
  s.records[`grain-review:${village}`]={category:'world_clock',id:`grain-review:${village}`,history:[{minute:mid,phase:2,name:'交割已核对'}]};
  s.npcs[b].memoryStream=[...s.npcs[b].memoryStream??[],{id:'heard',rumor:'rumor_event:far',eventRumor:true,kind:'rumor',minute:mid,content:'听说苇汀有人动了手'}];
  s.npcs[b].location=hall;
 });
 const all=returnChanges(engine,state,village,{from,to,before:{regard:{[village]:0},grain:1000}});
 assert.equal(all.length,RETURN_LIMIT,'限量');
 assert.equal(all[0],'赵枫已经病故','最重的在前');
 // 逐类单独确认都能进入汇总（去掉更重的项后可见）。
 const only=(fill,before={})=>returnChanges(engine,stateWith(engine,doc,fill),village,{from,to,before});
 assert.deepEqual(only(s=>{s.family.people={[kid]:{sex:'女',flags:{minor:true}}};s.family.births={x:{child:kid,mother:b,minute:mid,settlement:village}};}),['乔端家添了女儿']);
 assert.deepEqual(only(s=>{s.family.marriages={m:{partners:[c,e],since:mid,settlement:village}};}),['温绪与蒋弥成了亲']);
 assert.deepEqual(only(s=>{s.family.migrations={g:{person:e,from:{settlement:village},to:{settlement:'loc_bs_weiting'},status:'已抵达',departedAt:mid,arrivedAt:mid+60}};}),['蒋弥已搬去苇汀村']);
 assert.deepEqual(only(s=>{s.family.illnesses={i:{patient:b,severity:'重',since:mid,status:'痊愈',household:'house_yp_02'}};}),['乔端大病一场，已好转']);
 assert.deepEqual(only(s=>Object.assign(s.records,Object.fromEntries([event('h',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile'],witnesses:[e]})]))),['温绪伤了乔端']);
 assert.deepEqual(only(s=>{Object.assign(s.records,Object.fromEntries([event('o',{verb:'organize',actor:'org_test',tags:['org:decide','motion:charter','passed']})]));
  s.records['organization:org_test']={category:'organization',id:'org_test',source:'created',name:'坡口互助会',kind:'会社',seat:hall,members:{player:{position:'成员'}}};}),['坡口互助会议定修订章程，已通过']);
 assert.deepEqual(only(s=>{s.records[`standing:${village}:player`]={category:'standing',holder:village,target:'player',value:-40,history:[]};},{regard:{[village]:0}}),['当地人如今对你怀有敌意，你走时对你平常']);
 assert.deepEqual(only(s=>{s.records['quote:a']={category:'regional_quote',day:9,settlement:village,item:'item_oats',price:10};s.records['quote:b']={category:'regional_quote',day:14,settlement:village,item:'item_oats',price:16};}),[`${engine.byId.get('item_oats').name}价比你走时涨了不少`]);
 assert.deepEqual(only(s=>{s.records[`agriculture:${village}`]={...s.records[`agriculture:${village}`],mode:'managed',batches:[{kind:'grain',amount:400,expiresDay:999}]};},{grain:1000}),['公仓存粮比你走时少了许多']);
 assert.deepEqual(only(s=>{s.records[`grain-review:${village}`]={category:'world_clock',history:[{minute:mid,name:'交割已核对'}]};}),['公共粮约阶段核对：交割已核对']);
 assert.deepEqual(only(s=>{Object.assign(s.records,Object.fromEntries([event('far',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile'],witnesses:[e],location:'loc_bs_weiting'})]));
  s.npcs[b].location=hall;s.npcs[b].memoryStream=[{id:'heard',rumor:'rumor_event:far',eventRumor:true,kind:'rumor',minute:mid,content:'听说苇汀有人动了手'}];}),['有人在传：听说苇汀有人动了手（未核实）']);
 for(const line of all)assert.doesNotMatch(line,/\d/,'不显示数字');
});

test('认知边界与私密过滤：孕事、轻病、未成年人名、无人目击、私密事件、家务与非成员议决、非公开势力阶段、窗口外与外地',()=>{
 const {engine,doc}=fixture();
 const state=stateWith(engine,doc,s=>{
  s.family.people={[kid]:{id:kid,name:'乔小',sex:'女',flags:{minor:true}}};
  s.family.pregnancies={p:{id:'p',mother:b,conceivedAt:mid,status:'怀孕'}};
  s.family.illnesses={i:{id:'i',patient:b,severity:'轻',since:mid,status:'患病中',household:'house_yp_02'}};
  s.family.deaths={old:{id:'old',person:c,minute:from-10,cause:'病故',settlement:village},kid:{id:'kid',person:kid,minute:mid,cause:'病故',settlement:village},
   away:{id:'away',person:e,minute:mid,cause:'病故',settlement:'loc_bs_weiting'}};
  s.family.migrations={g:{id:'g',person:kid,from:{settlement:village},to:{settlement:'loc_bs_weiting'},status:'在途',departedAt:mid}};
  Object.assign(s.records,Object.fromEntries([
   event('unseen',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile'],witnesses:[]}),
   event('secret',{verb:'harm',actor:c,target:b,harm:10,tags:['hostile','private'],witnesses:[e]}),
   event('mine',{verb:'harm',actor:'player',target:b,harm:10,tags:['hostile'],witnesses:[e]}),
   event('minor',{verb:'steal',actor:c,target:kid,value:5,tags:['theft'],witnesses:[e]}),
   event('house',{verb:'organize',actor:'house_yp_02',tags:['org:decide','motion:charter','passed']}),
   event('closed',{verb:'organize',actor:'org_closed',tags:['org:decide','motion:withdraw','passed']}),
   event('debt',{verb:'breach',actor:c,target:b,value:50,tags:['debt']})]));
  s.records['organization:org_closed']={category:'organization',id:'org_closed',source:'created',name:'暗会',kind:'帮派',seat:hall,members:{[c]:{position:'帮主'}}};
  s.records['faction-clock:x']={category:'faction_event',faction:'faction_saltboat',settlement:village,minute:mid,name:'暗中囤粮'};
  s.npcs[b].location=hall;s.npcs[b].memoryStream=[{id:'p',rumor:'rumor_event:secret',eventRumor:true,kind:'rumor',minute:mid,content:'私下的事',private:true}];
 });
 const lines=returnChanges(engine,state,village,{from,to,before:{regard:{[village]:0}}});
 assert.deepEqual(lines,['有户人家没了孩子'],'只剩可公开且不点名的丧事');
 assert.ok(!lines.join().includes('乔小'));
});

test('短暂离开不触发；久别回来进状态提示和场景卡，并记下各地离开与到达时间',async()=>{
 const s=fixture();
 await run(s,'world_move',{destination:'loc_bs_weiting'},'away-1');
 assert.equal(s.doc.state.visits.places[village].leftAt,540);
 const quick=await run(s,'world_move',{destination:hall},'back-1');
 assert.ok(!quick.result.notices.some(n=>n.type==='return'));
 assert.equal(s.doc.state.visits.lastReturn,undefined);
 assert.equal(s.doc.state.visits.places[village].arrivedAt,s.doc.state.minute);
 await run(s,'world_move',{destination:'loc_bs_weiting'},'away-2');
 const left=s.doc.state.visits.places[village].leftAt;
 await run(s,'world_time',{minutes:4*DAY},'wait');
 s.doc.state.family??={};s.doc.state.family.deaths={d:{id:'d',person:a,minute:s.doc.state.minute-30,cause:'病故',settlement:village}};
 const back=await run(s,'world_move',{destination:hall},'back-2');
 assert.deepEqual(back.result.notices.filter(n=>n.type==='return').map(n=>n.text),['回到榆坡村，离开期间：赵枫已经病故']);
 assert.deepEqual(s.doc.state.visits.lastReturn,{place:village,leftAt:left,arrivedAt:s.doc.state.minute,lines:['赵枫已经病故'],sourceEvent:'back-2'});
 assert.ok(s.engine.scene(s.doc,'').includes('【离开期间此地变化，回来可听说，未必亲见】赵枫已经病故'));
 const later=await run(s,'world_time',{minutes:60},'stay');
 assert.ok(!later.result.notices.some(n=>n.type==='return'),'提示只出一次');
 await run(s,'world_time',{minutes:2*DAY},'stay-long');
 assert.ok(!s.engine.scene(s.doc,'').includes('离开期间此地变化'),'过一日后不再进场景卡');
});
