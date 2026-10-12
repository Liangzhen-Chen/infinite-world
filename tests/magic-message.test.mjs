import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {validateMagicCatalog}from'../server-plugin/magic.mjs';
import {magicMessagePermission}from'../server-plugin/magic-message.mjs';
import {shareNpcMemory}from'../server-plugin/npc-cognition.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const target='npc_hw_linsui',third='npc_hw_hezhou';
function draft(document){return{document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};}
async function fixture(){
 const world=await loadWorld(),base=world.spells[0];
 for(const kind of ['message','consent_link']){
  const id=`spell_message_${kind}`,skill=`skill_message_${kind}`;
  world.skills.push({id:skill,name:skill,attribute:'精神',profession:null});
  world.spells.push({...base,id,name:id,skill,mp:2,minutes:1,materials:[],duration:kind==='consent_link'?8:0,effectSpec:{kind,power:1,maxChars:80,maxDistanceMeters:100000,delayMinutes:2,...(kind==='consent_link'?{upkeepMp:3,upkeepMinutes:2}:{})}});
 }
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'message-test');
 Object.assign(doc.state.player,{mp:100,maxMp:100,hp:10000,maxHp:10000,companions:[target,third]});
 for(const id of[target,third])Object.assign(doc.state.npcs[id],{hp:10000,maxHp:10000,location:doc.state.location,activity:'交谈'});
 for(const kind of ['message','consent_link']){doc.state.spells[`spell_message_${kind}`]={source:{type:'fixture'}};doc.state.skills[`skill_message_${kind}`]={proficiency:200,breakthroughs:[],daily:{}};}
 const run=async(d,tool,args,id)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return{doc:applyPatches(d,out.patches),result:out.result,id};};
 let serial=0;
 const contact=async d=>{for(let i=0;i<100;i++){const r=await run(d,'world_combat',{target,intent:'defend'},`contact-${serial++}`);if(r.doc.state.records[`local_actor_position:${target}`])return r.doc;}throw Error('未形成真实接触');};
 // The permission processor produces the ledger row; the public-tool hook is
 // separately verified when its file ownership is assigned to this card.
 const grant=async(d,kind='message',minutes=60)=>{const a=draft(d),result=magicMessagePermission(a,engine,{operation:'grant_access',promisor:target,location:kind==='message'?'mental_message':'consent_link',content:'本人愿意接收主动发送的私密文字或简单情绪',minutes},`grant-${serial++}`);return{doc:a.document,result};};
 const cast=async(d,kind='message',extra={})=>{for(let i=0;i<100;i++){const r=await run(d,'world_cast',{spell:`spell_message_${kind}`,target,...extra},`cast-${serial++}`);if(r.result.success)return r;}throw Error('未取得成功检定');};
 const ready=async(kind='message',minutes=60)=>grant(await contact(doc),kind,minutes);
 return{world,engine,doc,run,contact,grant,cast,ready};
}
const messages=d=>Object.values(d.state.npcCognition?.messages??{}).filter(m=>m.channel==='magic');
const heard=(d,id=target)=>(d.state.npcs[id].memoryStream??[]).filter(m=>m.kind==='magic_message');
async function denied(s,doc,args,pattern){const before=structuredClone(doc);await assert.rejects(s.engine.reduce(doc,{tool:'world_cast',args,eventId:'denied'}),pattern);assert.deepEqual(doc,before);}
test('限距文字经本人签发消费者与world_cast入队，到达才让真实收者单次获知',async()=>{
 const s=await fixture(),g=await s.ready(),text='明早我到酒馆询价。',r=await s.cast(g.doc,'message',{authorization:g.result.authorization,text});
 assert.equal(r.result.text,text);assert.equal(r.result.charCount,[...text].length);assert.equal(r.result.distanceMeters,0);assert.equal(r.doc.state.player.mp,g.doc.state.player.mp-2);
 const m=messages(r.doc)[0];assert.equal(m.sourceEvent,r.id);assert.equal(m.arrive,r.doc.state.minute+2);assert.deepEqual(m.knownBy,['player',target]);assert.equal(heard(r.doc).length,0);
 const early=await s.run(r.doc,'world_time',{minutes:1},'early');assert.equal(heard(early.doc).length,0);
 const arrived=await s.run(early.doc,'world_time',{minutes:1},'arrive');assert.equal(heard(arrived.doc).length,1);
 const h=heard(arrived.doc)[0];assert.equal(h.content,text);assert.equal(h.minute,m.arrive);assert.equal(h.sourceType,'听说');assert.equal(h.heardFrom,'player');assert.equal(h.sourceEvent,r.id);assert.equal(h.private,true);assert.equal(heard(arrived.doc,third).length,0);
 const later=await s.run(arrived.doc,'world_time',{minutes:1},'later');assert.equal(heard(later.doc).length,1);
 const a=draft(later.doc);assert.throws(()=>shareNpcMemory(a,s.engine,{from:target,to:third,memoryId:h.id,eventId:'leak'}),/私密|关系/);assert.equal(heard(a.document,third).length,0);
});
test('无同意、越距、超字数、自动秘密与未知位置在扣魔力前拒绝',async()=>{
 const s=await fixture(),g=await s.ready(),args={spell:'spell_message_message',target,authorization:g.result.authorization,text:'我在这里。'};
 await denied(s,g.doc,{...args,authorization:undefined},/本人.*同意/);
 await denied(s,g.doc,{...args,text:'字'.repeat(81)},/字数/);await denied(s,g.doc,{...args,text:undefined},/主动发送/);
 const unknown=structuredClone(g.doc);delete unknown.state.records[`local_actor_position:${target}`];await denied(s,unknown,args,/实际距离/);
 const far=structuredClone(g.doc);far.state.location='loc_bs';s.world.spells.find(x=>x.id===args.spell).effectSpec.maxDistanceMeters=.1;await denied(s,far,args,/距离上限/);
 const old=structuredClone(g.doc);old.state.records[g.result.authorization].expires=old.state.minute+3;await denied(s,old,args,/覆盖到达/);
 const wrong=structuredClone(g.doc);wrong.state.records[g.result.authorization].grantor=third;await denied(s,wrong,args,/本人.*同意/);
});
test('同意签发拒绝睡眠、精神干扰、他人代签及团体授权',async()=>{
 const s=await fixture(),g=await s.ready();
 for(const status of['睡眠','昏迷']){const d=structuredClone(g.doc);if(status==='睡眠')d.state.npcs[target].activity=status;else d.state.npcs[target].status=status;await assert.rejects(s.grant(d),/清醒/);}
 const d=structuredClone(g.doc);d.state.effects.forced={kind:'status',status:'compulsion',target,power:1,expires:d.state.minute+100};await assert.rejects(s.grant(d),/精神干扰/);
 const a=draft(g.doc);assert.throws(()=>magicMessagePermission(a,s.engine,{operation:'grant_access',promisor:target,location:'mental_message',guests:[third],content:'代全队同意'},'bad'),/其他人/);
 await denied(s,g.doc,{spell:'spell_message_consent_link',target,authorization:g.result.authorization,text:'平静'},/本人.*同意/);
});
test('到达时撤销、昏迷、超距或位置证据失效均中止且无泄漏',async()=>{
 const s=await fixture(),g=await s.ready(),r=await s.cast(g.doc,'message',{authorization:g.result.authorization,text:'只有我主动发送这句。'});
 for(const mutate of[d=>d.state.records[g.result.authorization].revoked=true,d=>d.state.npcs[target].status='昏迷',d=>delete d.state.records[`local_actor_position:${target}`]]){
  const d=structuredClone(r.doc);mutate(d);const waited=await s.run(d,'world_time',{minutes:2},'stop-'+messages(d)[0].id);assert.equal(messages(waited.doc)[0].status,'中止');assert.equal(heard(waited.doc).length,0);assert.equal(heard(waited.doc,third).length,0);
 }
 const d=structuredClone(r.doc);d.state.player.companions=[];d.state.npcs[target].location='loc_bs';s.world.npcs.find(x=>x.id===target).schedule={default:[{start:0,end:1440,location:'loc_bs',activity:'交谈',services:[]}]};s.world.spells.find(x=>x.id==='spell_message_message').effectSpec.maxDistanceMeters=100000;
 messages(d)[0].maxDistanceMeters=.1;const waited=await s.run(d,'world_time',{minutes:2},'far-arrival');assert.equal(messages(waited.doc)[0].status,'中止');assert.equal(heard(waited.doc).length,0);
});
test('精神连接只发本人主动声明的有限情绪，持续扣MP且分步与大步一致',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),r=await s.cast(g.doc,'consent_link',{authorization:g.result.authorization,text:'平静'});
 assert.equal(r.result.effect,r.id);assert.equal(heard(r.doc).length,0);
 await denied(s,g.doc,{spell:'spell_message_consent_link',target,authorization:g.result.authorization,text:'林穗答应替我付款'},/有限情绪/);
 const big=await s.run(r.doc,'world_time',{minutes:6},'big');let small=r.doc;for(let i=0;i<6;i++)small=(await s.run(small,'world_time',{minutes:1},`small-${i}`)).doc;
 assert.equal(big.doc.state.player.mp,r.doc.state.player.mp-9);assert.equal(small.state.player.mp,big.doc.state.player.mp);assert.deepEqual(small.state.effects,big.doc.state.effects);assert.deepEqual(messages(small),messages(big.doc));assert.equal(heard(big.doc)[0].content,'平静');
 const expired=await s.run(big.doc,'world_time',{minutes:10},'expired');assert.equal(expired.doc.state.effects[r.id],undefined);assert.equal(expired.doc.state.player.mp,big.doc.state.player.mp);assert.equal(expired.doc.state.records[`ended_link:${r.id}`].spentMp,9);
});
test('有效精神连接可再次主动发送情绪且不重置维持时钟；本人断开中止待发消息',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),r=await s.cast(g.doc,'consent_link',{authorization:g.result.authorization});
 const second=await s.cast(r.doc,'consent_link',{authorization:g.result.authorization,text:'高兴'});assert.equal(second.result.effect,r.id);assert.equal(second.doc.state.effects[r.id].createdAt,r.doc.state.minute);assert.equal(Object.values(second.doc.state.effects).filter(e=>e.kind==='consent_link').length,1);
 const closed=await s.cast(second.doc,'consent_link',{text:'断开'});assert.equal(closed.doc.state.effects[r.id],undefined);assert.equal(messages(closed.doc)[0].status,'中止');
 const later=await s.run(closed.doc,'world_time',{minutes:6},'after-close');assert.equal(later.doc.state.player.mp,closed.doc.state.player.mp);assert.equal(heard(later.doc).length,0);
});
test('本人收回许可与魔力不足均停止连接，不收取后续费用',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),r=await s.cast(g.doc,'consent_link',{authorization:g.result.authorization,text:'紧张'}),a=draft(r.doc);
 const revoked=magicMessagePermission(a,s.engine,{operation:'revoke_access',promisor:target,authorization:g.result.authorization},'revoke');assert.equal(revoked.consent.revoked,true);assert.equal(a.document.state.effects[r.id],undefined);
 const later=await s.run(a.document,'world_time',{minutes:6},'revoked-wait');assert.equal(later.doc.state.player.mp,r.doc.state.player.mp);assert.equal(heard(later.doc).length,0);
 const poor=structuredClone(r.doc);poor.state.player.mp=2;const ended=await s.run(poor,'world_time',{minutes:6},'poor');assert.equal(ended.doc.state.player.mp,2);assert.equal(ended.doc.state.effects[r.id],undefined);assert.match(ended.doc.state.records[`ended_link:${r.id}`].reason,/魔力不足/);assert.equal(heard(ended.doc).length,0);
});
test('跨地点沿可信路线距离投递，未知道路距离不能按零处理',async()=>{
 const s=await fixture(),g=await s.ready(),d=structuredClone(g.doc);d.state.player.companions=[];const moved=await s.run(d,'world_move',{destination:'loc_hw_northwood'},'walk-away');
 const r=await s.cast(moved.doc,'message',{authorization:g.result.authorization,text:'我稍后沿路回来。'}),m=messages(r.doc)[0];assert.equal(m.distanceBasis,'route_length');assert.ok(m.distanceMeters>0);assert.ok(m.routeEdges.length>0);
 const received=await s.run(r.doc,'world_time',{minutes:2},'remote-arrive');assert.equal(heard(received.doc).length,1);
 s.world.routes.find(e=>e.id===m.routeEdges[0]).lengthKm=undefined;await denied(s,moved.doc,{spell:'spell_message_message',target,authorization:g.result.authorization,text:'距离未知'},/真实距离|可通行/);
});
test('目录拒绝全知/人格参数、无延迟、无限维持和超字数',async()=>{
 const s=await fixture(),base=s.world.spells.find(r=>r.id==='spell_message_consent_link');assert.deepEqual(validateMagicCatalog(base),[]);
 for(const mutation of[c=>c.effectSpec.readSecrets=true,c=>c.effectSpec.delayMinutes=0,c=>c.effectSpec.upkeepMp=0,c=>c.duration=1441,c=>c.effectSpec.maxChars=81]){const c=structuredClone(base);mutation(c);assert.ok(validateMagicCatalog(c).length);}
});
test('同事件去重、存储重启及删除回合恢复队列、记忆与魔力守恒',async t=>{
 const s=await fixture(),g=await s.ready(),args={spell:'spell_message_message',target,authorization:g.result.authorization,text:'这条只送一次。'};let input;
 for(let i=0;i<100;i++){const candidate={tool:'world_cast',args,eventId:`stored-${i}`},out=await s.engine.reduce(g.doc,candidate);if(out.result.success){input=candidate;break;}}assert.ok(input);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-magic-message-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const reducer=s.engine.reduce.bind(s.engine),store=new CampaignStorage(dir,{reducer});await store.create({id:'message',worldVersion:g.doc.worldVersion,document:g.doc});
 const event={id:input.eventId,anchor:'sent',input};await store.transact('message',event,reducer);const sent=await store.read('message');await store.transact('message',event,reducer);assert.deepEqual((await store.read('message')).document,sent.document);
 await store.transact('message',{id:'arrival',anchor:'arrival',input:{eventId:'arrival',tool:'world_time',args:{minutes:2}}},reducer);const arrived=await store.read('message');assert.equal(heard(arrived.document).length,1);
 const fresh=new CampaignStorage(dir,{reducer:new WorldEngine(s.world).reduce.bind(new WorldEngine(s.world))});assert.deepEqual((await fresh.read('message')).document,arrived.document);
 await fresh.reconcile('message',['sent'],null);const recovered=await fresh.read('message');assert.equal(heard(recovered.document).length,0);assert.equal(messages(recovered.document)[0].status,'在途');assert.equal(recovered.document.state.player.mp,sent.document.state.player.mp);
});

test('正常world_promise签发本人精神同意，world_cast投递及收回闭合',async()=>{
 const s=await fixture(),doc=await s.contact(s.doc);
 const g=await s.run(doc,'world_promise',{operation:'grant_access',promisor:target,location:'mental_message',content:'本人自愿接收玩家主动发送的短句',minutes:60},'public-grant');
 assert.equal(g.result.consent.action,'mental_message');
 const sent=await s.cast(g.doc,'message',{authorization:g.result.authorization,text:'明早我回来。'});
 const arrived=await s.run(sent.doc,'world_time',{minutes:2},'public-arrival');assert.equal(heard(arrived.doc)[0].content,'明早我回来。');assert.equal(heard(arrived.doc,third).length,0);
 const linkGrant=await s.run(arrived.doc,'world_promise',{operation:'grant_access',promisor:target,location:'consent_link',content:'本人自愿建立有限情绪连接',minutes:60},'public-link-grant');
 const linked=await s.cast(linkGrant.doc,'consent_link',{authorization:linkGrant.result.authorization,text:'高兴'});
 const revoked=await s.run(linked.doc,'world_promise',{operation:'revoke_access',promisor:target,authorization:linkGrant.result.authorization},'public-revoke');assert.equal(revoked.doc.state.effects[linked.result.effect],undefined);
 const later=await s.run(revoked.doc,'world_time',{minutes:6},'public-revoked-wait');assert.equal(later.doc.state.player.mp,revoked.doc.state.player.mp);
});

test('真实行路期间不能用提前写入的目的地维持连接或交付；睡眠停止维持MP',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),r=await s.cast(g.doc,'consent_link',{authorization:g.result.authorization,text:'平静'});
 const departure=structuredClone(r.doc);departure.state.player.companions=[];
 const moved=await s.run(departure,'world_move',{destination:'loc_hw_northwood'},'linked-walk');
 assert.equal(moved.doc.state.location,'loc_hw_northwood');assert.equal(moved.doc.state.effects[r.id],undefined);assert.equal(moved.doc.state.player.mp,r.doc.state.player.mp);
 assert.match(moved.doc.state.records[`ended_link:${r.id}`].reason,/途中/);assert.equal(messages(moved.doc)[0].status,'中止');assert.equal(heard(moved.doc).length,0);
 const sleeping=await s.run(r.doc,'world_time',{minutes:6,activity:'睡眠'},'linked-sleep');
 assert.equal(sleeping.doc.state.effects[r.id],undefined);assert.equal(sleeping.doc.state.player.mp,r.doc.state.player.mp);assert.match(sleeping.doc.state.records[`ended_link:${r.id}`].reason,/睡眠/);assert.equal(heard(sleeping.doc).length,0);
});
