import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest,CampaignStorage} from '../server-plugin/storage.mjs';
import {planBossMigration} from '../server-plugin/boss-migration.mjs';
import {planWorldUpgrade} from '../server-plugin/world-upgrade.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {validateNpcDepth} from '../tools/npc-profile-validation.mjs';
import {awakeningTotal} from '../server-plugin/wildlife-awakening.mjs';
import {publicLore} from '../server-plugin/lore.mjs';
import {catalogDefinition} from '../server-plugin/catalog.mjs';
import {skipTo} from './fixtures/skip-clock.mjs';
import {buildBatch,people,places,settlements,organizations,ids} from '../world/design/monster-society-3.mjs';
import {FILES,mergeMonsterSociety3,withoutMonsterSociety3} from '../tools/publish-monster-society-3.mjs';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadPromptBundle} from '../tools/build-card.mjs';
const {HX,GS,hx,gs,P}=ids,DAY=1440,batch=buildBatch(),formal=await loadWorld();
const world=mergeMonsterSociety3(formal,batch),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const qty=(doc,id,item)=>{const x=id==='player'?doc.state.inventory[item]:doc.state.npcs[id].inventory[item];return typeof x==='number'?x:x?.quantity??0;};
function session(w=world,seed='t162'){
 const engine=new WorldEngine(w);let doc=engine.createCharacter(legacy,{},seed),serial=0;
 doc=applyPatches(doc,planBossMigration(doc,w.rules,w.bosses,w));
 Object.assign(doc.state.player,{level:10,coins:5000,hp:500,maxHp:500});for(const a of Object.keys(doc.state.player.attributes))doc.state.player.attributes[a]=18;
 const call=async(tool,args,key)=>{for(let i=0;i<(key?80:1);i++){const eventId=`t162_${++serial}`,out=await engine.reduce(doc,{tool,args,eventId}).catch(e=>{e.message+=` @${tool} ${JSON.stringify(args)} t=${doc.state.minute}`;throw e;});if(!key||out.result[key]){doc=applyPatches(doc,out.patches);return out.result;}}throw Error(`检定无成功：${tool}`);};
 const next=async(minute=510)=>{let t=(Math.floor(doc.state.minute/DAY)+1)*DAY+minute;while([10,20,30].includes(engine.calendar(t).day))t+=DAY;await call('world_time',{minutes:t-doc.state.minute});};
 const locate=(location,minute=600)=>{skipTo(engine,doc,minute);doc.state.location=location;for(const n of w.npcs){const slot=n.schedule?.default.find(s=>s.start<=minute%DAY&&minute%DAY<s.end);if(slot)Object.assign(doc.state.npcs[n.id],{location:slot.location,activity:slot.activity});}};
 return{engine,call,next,locate,get doc(){return doc;},set doc(d){doc=d;}};
}

test('T162 正式发布、人口深度、四种精怪本相与旧物种隔离',async()=>{
 for(const[,key]of FILES)for(const row of batch[key])assert.deepEqual(formal[key].find(r=>r.id===row.id),row,`${key}/${row.id}`);
 assert.deepEqual(validateWorld(formal,{stage:'release'}).errors,[]);
 const mine=new Set(people.map(p=>p.id));assert.deepEqual(validateNpcDepth(formal).issues.filter(i=>mine.has(i.id)),[]);
 for(const s of settlements){const named=people.filter(p=>p.settlement===s.id);assert.equal(named.length,12);assert.equal(named.filter(p=>p.tier==='full').length,4);assert.equal(s.population,12+Object.values(s.pendingSpeciesStructure).reduce((n,x)=>n+x.population,0));}
 for(const p of people.filter(p=>p.age<18)){const n=batch.residents.find(n=>n.id===p.id);assert.equal(n.flags.minor,true);assert.equal(n.flags.romanceable,false);assert.doesNotMatch(JSON.stringify(n),/恋爱|亲吻|婚约|服劳役|下矿/);}
 assert.equal(new Set(people.filter(p=>p.settlement===HX).map(p=>p.species)).size,4);
 const culture=formal.cultures.find(c=>c.id==='culture_ms_huipeng');assert.match(culture.description,/绳签/);assert.match(culture.facts.magicAdventurers,/炭阶/);
 assert.ok(publicLore(culture).description);assert.ok(formal.rules.wildlifeAwakening.society.homes.includes(HX));
 const s=session(),view=catalogDefinition(s.engine,s.doc,{entity:'culture_ms_huixi'});
 for(const text of ['七百二十日','每日得两分','每日喂一份','每日一次','三十分','一百分','修习三次','每九十日'])assert.ok(view.description.includes(text),text);
});

test('T162 六处聚居地均有路线和实际交易，私宅与议事处许可保留',async()=>{
 const all=[['loc_ms_tanjie','loc_bs','site_ms_tj_stair','npc_ms_tj_yantai','item_dry_mushroom',19*60],['loc_ms_taideng','loc_hw','site_ms_td_saltstone','npc_ms_td_qingzhi','item_herb',19*60],
 ['loc_ms_yugen','loc_bs_yupo','site_ms_yg_gate','npc_ms_yg_jiecang','item_hazelnut',600],['loc_ms_lielu','loc_bs_liquan','site_ms_ll_shop','npc_ms_ll_cuozhen','item_iron_nail',1140],
 [HX,'loc_bs_weiting',hx.garden,P.xianpu,'item_herb',600],[GS,'loc_bs_sangban',gs.gate,P.shenge,'item_flax_cord',600]];
 for(const[seat,parent,shop,seller,item,time]of all){const s=session();assert.ok(s.engine.route(parent,seat,'walk',time,'t162-six').minutes>0);const slot=world.npcs.find(n=>n.id===seller).schedule.default.find(x=>x.start<=time&&time<x.end);s.locate(slot.location,time);
  const before=qty(s.doc,seller,item),buy=await s.call('world_trade',{seller,item,quantity:1});assert.ok(buy.cost>=0);assert.equal(qty(s.doc,seller,item),before-1);assert.ok(qty(s.doc,'player',item)>=1);
 }
 for(const st of settlements){const s=session();for(const p of places.filter(p=>p.settlement===st.id))assert.ok(s.engine.route(st.parent,p.id,'walk',600,'t162').minutes>=0);
  s.locate(st.id);const home=places.find(p=>p.settlement===st.id&&p.kind==='home');await assert.rejects(s.call('world_move',{destination:home.id}),/许可/);await assert.rejects(s.call('world_move',{destination:st.society.meetingPlace}),/许可/);
 }
});

test('T162 两地议题闭合后实际扣公账并分物，公开检索不泄私下目标',async()=>{
 for(const [st,authority,lead]of [[settlements[0],P.qiaosui,P.yiheng],[settlements[1],P.zheqian,P.shenge]]){
  const s=session(),o=organizations.find(o=>o.settlement===st.id),council=st.society.meetingPlace,where=people.find(p=>p.id===authority).workplace;
  s.locate(where,1060);const permit=await s.call('world_promise',{operation:'grant_access',promisor:authority,location:council,minutes:180,content:'进入议事处听双方说法'});await s.call('world_move',{destination:council,authorization:permit.authorization});
  s.locate(council,1085);const full=people.filter(p=>p.settlement===st.id&&p.tier==='full');for(const p of full)Object.assign(s.doc.state.npcs[p.id],{location:council,activity:'议事'});
  const issue=st.society.motions[0].id,key=`society_motion:${st.id}:${issue}`;
  await s.call('world_settlement',{settlement:st.id,operation:'governance_propose',issue});
  // A tie is rejected. Reach the approval branch by actually persuading a dissenting member.
  if(st.id===HX){const before=structuredClone(s.doc);let agreed=false;for(let i=0;i<30;i++){s.doc=structuredClone(before);const out=await s.call('world_settlement',{settlement:st.id,operation:'governance_opinion',proposal:key,speaker:P.luchi,opinion:'approve',content:'先留空棚，把粮份讲明'});if(out.opinion.opinion==='approve'){agreed=true;break;}}assert.ok(agreed);}
  await s.call('world_settlement',{settlement:st.id,operation:'governance_close',proposal:key,authority:lead});
  assert.equal(s.doc.state.records[key].status,st.id===HX?'通过':'否决');
  const before=s.doc.state.npcs[st.id===HX?P.xianpu:P.shenge].inventory;
  const item=st.id===HX?'item_ration':'item_flax_cord',was=typeof before[item]==='number'?before[item]:before[item]?.quantity??0;
  await s.call('world_time',{minutes:4*DAY});
  assert.equal(qty(s.doc,st.id===HX?P.xianpu:P.shenge,item),was+(st.id===HX?4:2));
  const account=s.doc.state.records[`faction-assets:${o.id}`];assert.ok(account);
  assert.ok(account.items[item]<o.items[item]);
  s.locate(st.id,s.doc.state.minute);const inspect=await s.call('world_settlement',{settlement:st.id,operation:'governance_inspect'});assert.equal(inspect.organization.privateGoal,undefined);
 }
});

test('T162 正式取得路线：导师入门认证、药草、听息立意、逐日修习、借形与自愿定居',async t=>{
 const s=session(),institution='bld_bs_reed_dao',teacher='npc_bs_077_1',role=world.professions.find(p=>p.id==='profession_taoist'),entry=world.rules.training.institutions.find(e=>e.institution===institution&&e.teacher===teacher);
 s.locate('loc_bs',510);await s.call('world_move',{destination:institution});
 await s.call('world_profession',{operation:'initiate',profession:role.id,teacher,institution});
 await s.call('world_learn',{entity:role.entry.skill,source:teacher,kind:'skill'},'success');
 while(s.doc.state.skills[role.entry.skill].proficiency<240){await s.call('world_practice',{skill:role.entry.skill,gain:100,target:'每日基础动作'});if(s.doc.state.skills[role.entry.skill].proficiency<240)await s.next();}
 await s.next();await s.call('world_profession',{operation:'certify',profession:role.id,teacher},'certified');await s.next();
 const grant=await s.call('world_profession',{operation:'ritual_officiate',profession:role.id,teacher,institution,deity:entry.deity,minutes:10080});assert.ok(grant.permit);
 await s.call('world_move',{destination:hx.garden});
 if(s.doc.state.minute%DAY>900)await s.next(600);
 const herbs=await s.call('world_trade',{seller:P.xianpu,item:'item_herb',quantity:12});assert.ok(herbs.cost>0);
 await s.call('world_move',{destination:'loc_hw_northwood'});
 let night=Math.floor(s.doc.state.minute/DAY)*DAY+1200;if(night<s.doc.state.minute)night+=DAY;await s.call('world_time',{minutes:night-s.doc.state.minute});
 const tracked=await s.call('world_wildlife',{operation:'track',species:'monster_red_ear_fox'},'success'),target=tracked.found.id,original=structuredClone(s.doc.state.creatures[target]);
 let fed=0,mentored=0,heard=false;
 for(let i=0;i<4&&!s.doc.state.creatures[target].mind?.awakened;i++){
  const out=await s.call('world_wildlife',{operation:'nurture',target,item:'item_herb'});fed++;
  if(!s.doc.state.creatures[target].mind?.awakened){await s.call('world_wildlife',{operation:'enlighten',target,permit:grant.permit});mentored++;}
  const animal=s.doc.state.creatures[target];if(!animal.mind.awakened)heard||=awakeningTotal(s.engine,s.doc.randomSeed,target,animal,Math.floor(s.doc.state.minute/DAY))>=30;
  if(!s.doc.state.creatures[target].mind?.awakened)await s.next(600);
 }
 assert.ok(heard);assert.ok(s.doc.state.creatures[target].mind.awakened);assert.ok(fed>0&&mentored>0);assert.equal(s.doc.state.creatures[target].species,original.species);assert.deepEqual(s.doc.state.creatures[target].ecology,original.ecology);
 await assert.rejects(s.call('world_pet',{operation:'tame',target}),/已立意/);
 await s.call('world_wildlife',{operation:'pact',target});await s.call('world_wildlife',{operation:'follow',target});
 await s.call('world_move',{destination:hx.garden});assert.equal(s.doc.state.creatures[target].location,hx.garden);
 for(let i=0;i<3;i++){await s.call('world_learn',{entity:role.entry.skill,source:'player',student:target});if(i<2)await s.next(600);}
 assert.equal(s.doc.state.creatures[target].cultivation.sessions.length,3);
 let borrowPermit=grant.permit;
 if(s.doc.state.records[borrowPermit].expires<=s.doc.state.minute+120){
  await s.call('world_move',{destination:institution});await s.next();
  borrowPermit=(await s.call('world_profession',{operation:'ritual_officiate',profession:role.id,teacher,institution,deity:entry.deity,minutes:10080})).permit;
 }
 const acquired=await s.call('world_wildlife',{operation:'borrow_form',target,permit:borrowPermit});assert.equal(acquired.acquired,true);
 const body=({hp,maxHp,level,species,ecology})=>({hp,maxHp,level,species,ecology}),before=body(s.doc.state.creatures[target]);
 const shaped=await s.call('world_wildlife',{operation:'borrow_form',target,species:'人形'});assert.equal(shaped.form.until-shaped.form.since,360);assert.deepEqual(body(s.doc.state.creatures[target]),before);
 await s.call('world_wildlife',{operation:'borrow_form',target});assert.equal(s.doc.state.creatures[target].form,undefined);
 assert.equal(qty(s.doc,'player','item_herb'),12-fed-4);
 await s.call('world_move',{destination:HX});await s.call('world_wildlife',{operation:'settle',target});assert.equal(s.doc.state.creatures[target].companion.following,false);
 const quarter=(Math.floor(s.doc.state.minute/DAY/90)+1)*90*DAY;
 while(s.doc.state.minute<quarter+5)await s.call('world_time',{minutes:Math.min(30*DAY,quarter+5-s.doc.state.minute)});
 const actor=s.doc.state.creatures[target];assert.equal(actor.society.location,HX);assert.deepEqual(actor.ecology,original.ecology);assert.ok(s.doc.state.records[`spirit_society:${HX}`].members[target]);
 assert.equal(world.settlementProfiles.find(p=>p.id===HX).population,48);
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'t162-save-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(d,input,opts)=>s.engine.reduce(d,input,opts),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'path',worldVersion:world.version,document:s.doc});const exported=await store.export('path'),reloaded=await store.import(exported,'copy');assert.equal(digest(reloaded.document.state),digest(s.doc.state));
});

test('T162 灵地来源与年岁经历的边界，四种野兽保留已有生态正文',async()=>{
 const s=session();s.locate('loc_hw_northwood',1200);const tracked=await s.call('world_wildlife',{operation:'track',species:'monster_red_ear_fox'},'success'),id=tracked.found.id;
 // Isolate the natural source at the authored land, keeping a real tracked body and ecology receipt.
 s.doc.state.location=hx.garden;s.doc.state.creatures[id].location=hx.garden;
 await s.call('world_time',{minutes:DAY-s.doc.state.minute%DAY+5});assert.equal(s.doc.state.creatures[id].mind.points.place,2);
 const a=structuredClone(s.doc.state.creatures[id]);a.mind.points={experience:20,place:0,item:0,mentor:0,clock:0};a.since=0;
 assert.ok(awakeningTotal(s.engine,s.doc.randomSeed,id,a,10000)<100);
 for(const sp of ['monster_red_ear_fox','monster_stone_whisker_weasel','monster_grey_otter','monster_plate_back_tortoise'])assert.deepEqual(world.monsters.find(m=>m.id===sp),formal.monsters.find(m=>m.id===sp));
});

test('T162 静态提示增量不超过40，六处聚居地名可见且内部地点仍在目录',async()=>{
 const before=await loadPromptBundle({world:withoutMonsterSociety3(formal)}),after=await loadPromptBundle({world:formal});
 assert.ok(after.budget.estimatedTokens-before.budget.estimatedTokens<=40);
 for(const id of ['loc_ms_tanjie','loc_ms_taideng','loc_ms_yugen','loc_ms_lielu',HX,GS])assert.ok(after.card.data.description.includes(formal.locations.find(l=>l.id===id).name));
 for(const p of places.filter(p=>p.kind!=='seat'))assert.ok(formal.locations.some(l=>l.id===p.id));
});

test('T162 world_upgrade 加入两地，旧账与野生身体不补发；发布重复零写入',async t=>{
 const old=withoutMonsterSociety3(world),s=session(old,'t162-upgrade');const villager=Object.keys(s.doc.state.npcs)[0];s.doc.state.npcs[villager].coins=777;s.doc.state.player.coins=321;
 const next=planWorldUpgrade(s.doc,old,world,{worldHash:'t162',eventId:'upgrade'});s.doc=applyPatches(s.doc,next.patches);s.doc=applyPatches(s.doc,planBossMigration(s.doc,world.rules,world.bosses,world));
 assert.equal(s.doc.state.npcs[villager].coins,777);assert.equal(s.doc.state.player.coins,321);for(const p of people.filter(p=>p.tier==='full'))assert.ok(s.doc.state.npcs[p.id]);
 const count=Object.keys(s.doc.state.creatures??{}).length;assert.equal(count,0);
 const again=planWorldUpgrade(s.doc,world,world,{worldHash:'t162',eventId:'again'});assert.equal(Object.keys(applyPatches(s.doc,again.patches).state.creatures??{}).length,count);
 const {publishMonsterSociety3,batchIds}=await import('../tools/publish-monster-society-3.mjs');
 // A3-内容1：旧 L2 回执绑定的是私人所有者骨架；本卡纠正组织公物后不可挪用旧审核。
 // 原“重发零写入”意图保留：本测试显式构造的当前批次重放零写；生产入口拒绝过期回执。
 await assert.rejects(publishMonsterSociety3(),/发布骨架或引用事实已改变 site_ms_hx_store/);
 assert.deepEqual((await publishMonsterSociety3({batch})).changed,[]);
 // A first publication must remain reloadable with D1's separate biome catalog and K8 derivation.
 const root=await fs.mkdtemp(path.join(tmpRoot(),'t162-publish-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const folder of ['geo','meta','people','lore'])await fs.cp(path.resolve('world',folder),path.join(root,folder),{recursive:true});
 const mine=batchIds();for(const[file]of FILES){const target=path.join(root,file),rows=JSON.parse(await fs.readFile(target,'utf8'));await fs.writeFile(target,JSON.stringify(rows.filter(r=>!mine.has(r.id))));}
 const rf=path.join(root,'meta/rules.json'),rawRules=JSON.parse(await fs.readFile(rf,'utf8'));rawRules.wildlifeAwakening.society.homes=rawRules.wildlifeAwakening.society.homes.filter(x=>x!==HX);rawRules.wildlifeAwakening.spiritLands=rawRules.wildlifeAwakening.spiritLands.filter(x=>x.location!==hx.garden);await fs.writeFile(rf,JSON.stringify(rawRules));
 await publishMonsterSociety3({root,publish:true,batch});const reload=await loadWorld(root);assert.deepEqual(validateWorld(reload,{stage:'release'}).errors,[]);
 const rawLocations=JSON.parse(await fs.readFile(path.join(root,'geo/locations.json'),'utf8'));assert.equal(rawLocations.find(l=>l.id==='loc_hw_northwood').biome,undefined);
 assert.ok(!JSON.parse(await fs.readFile(rf,'utf8')).wildlife.habitats.some(h=>h.derived));
});
