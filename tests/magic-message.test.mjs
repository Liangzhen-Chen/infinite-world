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
 for(const kind of ['message','mind_message','consent_link','team_link']){
  const id=`spell_message_${kind}`,skill=`skill_message_${kind}`;
  world.skills.push({id:skill,name:skill,attribute:'精神',profession:null});
  world.spells.push({...base,id,name:id,skill,mp:2,minutes:1,materials:[],duration:['consent_link','team_link'].includes(kind)?8:0,effectSpec:{kind,power:1,maxChars:80,maxDistanceMeters:100000,delayMinutes:2,...(['consent_link','team_link'].includes(kind)?{upkeepMp:3,upkeepMinutes:2}:{}),...(kind==='team_link'?{maxMembers:4}:{}),...(kind==='mind_message'?{markText:'心音符'}:{})}});
 }
 // T145起战役解析器扩展自引擎构造时的索引，夹具法术须在构造引擎前登记，不能事后塞进engine.entities。
 const markSpell={...base,id:'spell_message_mark',name:'传讯符刻',skill:'skill_message_message',mp:2,minutes:1,materials:[],duration:8,rangeMeters:3,effectSpec:{kind:'mark',power:40,medium:'fire',visibility:'normal'}};world.spells.push(markSpell);
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'message-test');
 Object.assign(doc.state.player,{mp:100,maxMp:100,hp:10000,maxHp:10000,companions:[target,third]});
 for(const id of[target,third])Object.assign(doc.state.npcs[id],{hp:10000,maxHp:10000,location:doc.state.location,activity:'交谈'});
 doc.state.spells[markSpell.id]={source:{type:'fixture'}};doc.state.inventory.item_whittling_knife={quantity:1,durability:100};
 for(const kind of ['message','mind_message','consent_link','team_link']){doc.state.spells[`spell_message_${kind}`]={source:{type:'fixture'}};doc.state.skills[`skill_message_${kind}`]={proficiency:200,breakthroughs:[],daily:{}};}
 const run=async(d,tool,args,id)=>{const out=await engine.reduce(d,{tool,args,eventId:id});return{doc:applyPatches(d,out.patches),result:out.result,id};};
 let serial=0;
 const contact=async(d,id=target)=>{for(let i=0;i<100;i++){const r=await run(d,'world_combat',{target:id,intent:'defend'},`contact-${serial++}`);if(r.doc.state.records[`local_actor_position:${id}`])return r.doc;}throw Error('未形成真实接触');};
 const grant=(d,kind='message',minutes=60)=>run(d,'world_promise',{operation:'grant_access',promisor:target,location:kind==='message'?'mental_message':'consent_link',content:'本人愿意接收主动发送的私密文字或简单情绪',minutes},`grant-${serial++}`);
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
 const revoked=await s.run(r.doc,'world_promise',{operation:'revoke_access',promisor:target,authorization:g.result.authorization},'revoke');assert.equal(revoked.result.consent.revoked,true);assert.equal(revoked.doc.state.effects[r.id],undefined);
 const later=await s.run(revoked.doc,'world_time',{minutes:6},'revoked-wait');assert.equal(later.doc.state.player.mp,r.doc.state.player.mp);assert.equal(heard(later.doc).length,0);
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

const playerHeard=d=>Object.values(d.memories??{}).filter(m=>m.kind==='magic_message');
async function mark(s,doc,text='心音符'){
 for(let i=0;i<100;i++){const r=await s.run(doc,'world_cast',{spell:'spell_message_mark',target:'item_whittling_knife',text},`mark-${text}-${i}`);if(r.result.success)return r;}throw Error('未得到真实符记');
}
async function group(s,ids=[target,third]){
 let doc=structuredClone(s.doc);doc.state.player.companions=ids;
 for(const id of ids)Object.assign(doc.state.npcs[id],{location:doc.state.location,status:'正常',activity:'交谈',hp:10000,maxHp:10000});
 for(const id of ids)doc=await s.contact(doc,id);
 const keys=[];
 for(const id of ids){const grant=await s.run(doc,'world_promise',{operation:'grant_access',promisor:id,location:'team_link',guests:ids.filter(x=>x!==id),content:'本人愿意向这些小队成员发送有限节奏',minutes:60},`group-grant-${id}`);doc=grant.doc;keys.push(grant.result.authorization);}
 return{doc,keys,args:{authorization:keys[0],authorizations:keys.slice(1)}};
}
test('心音符由正常刻记施法生产，缺符、错误文字、失去实物和过期在真实链拒绝',async()=>{
 const s=await fixture(),g=await s.ready(),args={spell:'spell_message_mind_message',target,authorization:g.result.authorization,text:'我晚些回来。'};
 await denied(s,g.doc,args,/符记/);
 const wrong=await mark(s,g.doc,'普通字迹');await denied(s,wrong.doc,{...args,permit:wrong.result.mark},/符记/);
 const m=await mark(s,g.doc),sent=await s.cast(m.doc,'mind_message',{authorization:g.result.authorization,permit:m.result.mark,text:args.text});
 assert.equal(messages(sent.doc)[0].mark,m.result.mark);const arrived=await s.run(sent.doc,'world_time',{minutes:2},'marked-arrival');assert.equal(heard(arrived.doc)[0].content,args.text);
 const stale=structuredClone(m.doc);stale.state.records[m.result.mark].expires=stale.state.minute+3;await denied(s,stale,{...args,permit:m.result.mark},/符记/);
 const broken=structuredClone(m.doc);broken.state.itemInstances[broken.state.records[m.result.mark].targetInstance].durability=0;await denied(s,broken,{...args,permit:m.result.mark},/符记/);
 const selling=structuredClone(sent.doc);selling.state.player.companions=[];
 const sold=await s.run(selling,'world_trade',{seller:'player',buyer:target,item:'item_whittling_knife',quantity:1},'sell-mark');
 const aborted=await s.run(sold.doc,'world_time',{minutes:2},'sold-arrival');assert.equal(messages(aborted.doc)[0].status,'中止');assert.equal(heard(aborted.doc).length,0);
});
test('NPC通过正常world_promise主动声明情绪，到达才进入玩家记忆和可见回复',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),linked=await s.cast(g.doc,'consent_link',{authorization:g.result.authorization});
 const args={operation:'grant_access',promisor:target,location:'consent_link',authorization:g.result.authorization,obligation:linked.result.effect,content:'紧张'};
 const sent=await s.run(linked.doc,'world_promise',args,'npc-emotion');assert.equal(sent.result.from,target);assert.equal(playerHeard(sent.doc).length,0);assert.equal(heard(sent.doc,third).length,0);
 assert.equal(messages(sent.doc)[0].sourceEvent,'npc-emotion');assert.equal(messages(sent.doc)[0].from,target);
 await assert.rejects(s.run(sent.doc,'world_promise',args,'npc-repeat'),/尚在传送/);
 await assert.rejects(s.run(linked.doc,'world_promise',{...args,content:'何舟答应替我付钱'},'npc-false'),/有限情绪/);
 const arrived=await s.run(sent.doc,'world_time',{minutes:2},'npc-emotion-arrival');assert.equal(playerHeard(arrived.doc)[0].content,'紧张');assert.equal(playerHeard(arrived.doc)[0].sourceType,'听说');assert.equal(playerHeard(arrived.doc)[0].heardFrom,target);assert.ok(arrived.result.messages.some(x=>x.includes('主动传来：紧张')));assert.equal(heard(arrived.doc,third).length,0);
 const revoked=await s.run(sent.doc,'world_promise',{operation:'revoke_access',promisor:target,authorization:g.result.authorization},'npc-withdraw');const cancelled=await s.run(revoked.doc,'world_time',{minutes:3},'npc-cancelled');assert.equal(playerHeard(cancelled.doc).length,0);assert.equal(cancelled.doc.state.player.mp,revoked.doc.state.player.mp);
});
test('多人连接逐人取得许可，玩家广播与NPC主动节奏真正抵达不同收者并按人数扣MP',async()=>{
 const s=await fixture(),g=await group(s),linked=await s.cast(g.doc,'team_link',{...g.args,text:'防守'});
 assert.deepEqual(new Set(linked.result.members),new Set(['player',target,third]));assert.equal(linked.result.upkeepTotalMp,6);assert.equal(linked.result.messageIds.length,2);assert.equal(heard(linked.doc).length,0);assert.equal(heard(linked.doc,third).length,0);
 const first=await s.run(linked.doc,'world_time',{minutes:2},'team-first-arrival');assert.equal(heard(first.doc)[0].content,'防守');assert.equal(heard(first.doc,third)[0].content,'防守');assert.equal(first.doc.state.player.mp,linked.doc.state.player.mp-6);
 const sent=await s.run(first.doc,'world_promise',{operation:'grant_access',promisor:third,location:'team_link',authorization:g.keys[1],obligation:linked.result.effect,content:'撤退'},'npc-team-signal');assert.deepEqual(new Set(sent.result.recipients),new Set(['player',target]));assert.equal(playerHeard(sent.doc).length,0);assert.equal(heard(sent.doc).length,1);
 const arrived=await s.run(sent.doc,'world_time',{minutes:2},'npc-team-arrival');assert.equal(playerHeard(arrived.doc)[0].content,'撤退');assert.equal(heard(arrived.doc).at(-1).content,'撤退');assert.equal(heard(arrived.doc).at(-1).heardFrom,third);assert.equal(heard(arrived.doc,third).length,1);assert.equal(arrived.doc.state.player.mp,first.doc.state.player.mp-6);
 assert.equal(heard(arrived.doc,'npc_hw_ayan').length,0);
});
test('多人缺独立同意、人数超限、许可未覆盖队友、未知成员位置均原子拒绝',async()=>{
 const s=await fixture(),g=await group(s),args={spell:'spell_message_team_link',target,...g.args,text:'前进'};
 await denied(s,g.doc,{...args,authorizations:[]},/独立/);await denied(s,g.doc,{...args,authorizations:[g.keys[0]]},/独立/);
 const narrow=await s.run(g.doc,'world_promise',{operation:'grant_access',promisor:third,location:'team_link',content:'只同意与玩家',minutes:60},'narrow-grant');await denied(s,narrow.doc,{...args,authorizations:[narrow.result.authorization]},/未覆盖/);
 const unknown=structuredClone(g.doc);delete unknown.state.records[`local_actor_position:${third}`];await denied(s,unknown,args,/实际距离/);
 await denied(s,g.doc,{...args,text:'别人必须服从我'},/有限情绪/);
 const crowded=await group(await fixture(),[target,third,'npc_hw_ayan']);const f=await fixture();f.world.spells.find(x=>x.id==='spell_message_team_link').effectSpec.maxMembers=3;await denied(f,crowded.doc,{...args,authorization:crowded.keys[0],authorizations:crowded.keys.slice(1)},/成员超限/);
});
test('独立撤销或到期删除该成员，剩余多人连接继续且不再收取退出者维持费',async()=>{
 const s=await fixture(),ids=[target,third,'npc_hw_ayan'],g=await group(s,ids),linked=await s.cast(g.doc,'team_link',g.args);
 const withdrawn=await s.run(linked.doc,'world_promise',{operation:'revoke_access',promisor:'npc_hw_ayan',authorization:g.keys[2]},'team-withdraw');assert.equal(withdrawn.doc.state.effects[linked.id].members.npc_hw_ayan,undefined);
 const stayed=await s.run(withdrawn.doc,'world_time',{minutes:2},'team-stay');assert.equal(stayed.doc.state.player.mp,withdrawn.doc.state.player.mp-6);assert.deepEqual(Object.keys(stayed.doc.state.effects[linked.id].members).sort(),[target,third].sort());
 const last=await s.run(stayed.doc,'world_promise',{operation:'revoke_access',promisor:third,authorization:g.keys[1]},'team-too-few');assert.equal(last.doc.state.effects[linked.id],undefined);
 const later=await s.run(last.doc,'world_time',{minutes:2},'no-team-fee');assert.equal(later.doc.state.player.mp,last.doc.state.player.mp);
 const f=await fixture(),h=await group(f,ids);const fresh=await f.run(h.doc,'world_promise',{operation:'grant_access',promisor:'npc_hw_ayan',location:'team_link',guests:[target,third],content:'本人短期参与',minutes:3},'short-grant');const expiring=await f.cast(fresh.doc,'team_link',{authorization:h.keys[0],authorizations:[h.keys[1],fresh.result.authorization]});
 const expired=await f.run(expiring.doc,'world_time',{minutes:2},'member-expiry');assert.equal(expired.doc.state.effects[expiring.id].members.npc_hw_ayan,undefined);assert.equal(expired.doc.state.player.mp,expiring.doc.state.player.mp-6);
});

test('多人长短步费用一致，费用不足不部分扣费且中止全部未抵达消息',async()=>{
 const s=await fixture(),g=await group(s),linked=await s.cast(g.doc,'team_link',{...g.args,text:'停步'});
 const big=await s.run(linked.doc,'world_time',{minutes:4},'team-big');let small=linked.doc;for(let i=0;i<4;i++)small=(await s.run(small,'world_time',{minutes:1},`team-small-${i}`)).doc;
 assert.equal(big.doc.state.player.mp,linked.doc.state.player.mp-12);assert.equal(small.state.player.mp,big.doc.state.player.mp);assert.deepEqual(small.state.effects,big.doc.state.effects);assert.deepEqual(messages(small),messages(big.doc));
 const poor=structuredClone(linked.doc);poor.state.player.mp=5;const stopped=await s.run(poor,'world_time',{minutes:2},'team-poor');assert.equal(stopped.doc.state.player.mp,5);assert.equal(stopped.doc.state.effects[linked.id],undefined);assert.equal(stopped.doc.state.records[`ended_link:${linked.id}`].spentMp,0);assert.ok(messages(stopped.doc).every(m=>m.status==='中止'));assert.equal(heard(stopped.doc).length,0);assert.equal(heard(stopped.doc,third).length,0);
});
test('正常签发、多人施法、NPC反向消息和到达在事件存储重启导入与撤销中守恒',async t=>{
 const s=await fixture();let doc=await s.contact(s.doc);doc=await s.contact(doc,third);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-team-message-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const reducer=s.engine.reduce.bind(s.engine),store=new CampaignStorage(dir,{reducer});await store.create({id:'team',worldVersion:doc.worldVersion,document:doc});
 const transact=async(id,tool,args)=>{const result=await store.transact('team',{id,anchor:id,input:{eventId:id,tool,args}},reducer);return result;};
 for(const [id,who,other]of[['grant-one',target,third],['grant-two',third,target]])await transact(id,'world_promise',{operation:'grant_access',promisor:who,location:'team_link',guests:[other],content:'本人主动参与限定节奏连接',minutes:60});
 let before=(await store.read('team')).document;const args={spell:'spell_message_team_link',target,authorization:'permission_grant-one',authorizations:['permission_grant-two']},cast=await s.cast(before,'team_link',args);
 await transact(cast.id,'world_cast',args);const linked=(await store.read('team')).document;assert.equal(linked.state.player.mp,before.state.player.mp-2);
 const declaration={operation:'grant_access',promisor:third,location:'team_link',authorization:'permission_grant-two',obligation:cast.id,content:'合围'};await transact('emit','world_promise',declaration);const queued=(await store.read('team')).document;
 await transact('emit','world_promise',declaration);assert.deepEqual((await store.read('team')).document,queued);assert.equal(playerHeard(queued).length,0);
 await transact('arrival','world_time',{minutes:2});const arrived=(await store.read('team')).document;assert.equal(playerHeard(arrived)[0].content,'合围');assert.equal(heard(arrived)[0].content,'合围');assert.equal(arrived.state.player.mp,linked.state.player.mp-6);
 const reopened=new CampaignStorage(dir,{reducer});assert.deepEqual((await reopened.read('team')).document,arrived);const bundle=JSON.parse(JSON.stringify(await reopened.export('team')));assert.deepEqual((await reopened.import(bundle,'copy')).document,arrived);
 await reopened.reconcile('team',['grant-one','grant-two',cast.id,'emit'],null);const recovered=(await reopened.read('team')).document;assert.deepEqual(recovered,queued);assert.equal(playerHeard(recovered).length,0);
 await reopened.reconcile('team',['grant-one','grant-two',cast.id],null);assert.deepEqual((await reopened.read('team')).document,linked);
});

test('面对面签发后沿真实路线远离，NPC仍可主动回传并自行远程收回同意',async()=>{
 const s=await fixture(),g=await s.ready('consent_link'),depart=structuredClone(g.doc);depart.state.player.companions=[];
 const moved=await s.run(depart,'world_move',{destination:'loc_hw_northwood'},'remote-walk');const linked=await s.cast(moved.doc,'consent_link',{authorization:g.result.authorization});
 const args={operation:'grant_access',promisor:target,location:'consent_link',authorization:g.result.authorization,obligation:linked.result.effect,content:'难过'};
 const sent=await s.run(linked.doc,'world_promise',args,'remote-emotion');assert.equal(playerHeard(sent.doc).length,0);
 const arrived=await s.run(sent.doc,'world_time',{minutes:2},'remote-emotion-arrival');assert.equal(playerHeard(arrived.doc)[0].content,'难过');assert.equal(heard(arrived.doc,third).length,0);
 const again=await s.run(arrived.doc,'world_promise',{...args,content:'平静'},'remote-again');
 const revoked=await s.run(again.doc,'world_promise',{operation:'revoke_access',promisor:target,authorization:g.result.authorization},'remote-revoke');assert.equal(revoked.result.consent.revoked,true);assert.equal(revoked.doc.state.effects[linked.id],undefined);
 const later=await s.run(revoked.doc,'world_time',{minutes:3},'remote-after-revoke');assert.equal(playerHeard(later.doc).length,1);assert.equal(later.doc.state.player.mp,revoked.doc.state.player.mp);
});
