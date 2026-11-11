import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {mapView}from'../server-plugin/ui-map.mjs';
import {toolDefinitions}from'../extension/tools.mjs';
import {marketTimeWindows}from'../server-plugin/npc-state.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const world=await loadWorld(),engine=new WorldEngine(world);
const run=async(c,tool,args,eventId='test')=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
async function until(c,tool,args,done,label){for(let i=0;i<120;i++){const row=await run(c,tool,args,`${label}_${i}`);if(done(row))return row;}throw new Error(`${label}夹具未出现所需结果`);}
const skill=(proficiency)=>({proficiency,breakthroughs:[],daily:{}});
function fresh(location='bld_hw_school'){
    const c=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'works-test');
    c.state.location=location;c.state.player.coins=500;c.state.skills.skill_literacy=skill(300);
    // E 卡：出版印书每册耗 1 纸 1 墨（works.mjs publish）。原有 10 纸 5 墨供写稿、抄书、测绘，另备 50 纸 50 墨供印书
    // （本文件最多一册书稿印 20+10+20=50 册）。
    c.state.inventory.item_parchment={quantity:60,quality:'木',durability:100,weight:0.06};
    c.state.inventory.item_soot_ink={quantity:55,quality:'木',durability:100,weight:0.1};
    return c;
}
const audience=(c,ids=['npc_hw_luqing','npc_hw_linsui','npc_hw_chenbai'])=>{for(const id of ids){Object.assign(c.state.npcs[id],{location:c.state.location,status:'正常',activity:'闲坐'});c.state.npcs[id].coins=50;}return c;};
const fame=(c,settlement)=>Object.values(c.state.records).find(r=>r.category==='reputation'&&r.subject==='player'&&r.target===settlement);

test('写作出版：署名书稿、印数售出收入、余册入囊；名望与贡献入账；生成作品世界事件',async()=>{
    const c=fresh();
    const wrote=await until(c,'world_research',{operation:'write',name:'河湾农事札记',concept:'记河湾村一年的播种与收成',minutes:240},row=>row.result.success,'write');
    const work=wrote.document.state.works[wrote.result.work];
    assert.equal(work.kind,'manuscript');assert.equal(work.author,'player');assert.equal(work.title,'河湾农事札记');
    assert.equal(wrote.document.state.itemInstances[work.instance].item,'item_work_manuscript');
    assert.equal(wrote.document.state.inventory.item_parchment.quantity,59);// 60 张写稿用 1 张（原为 10-1=9；纸多备 50 张供印书）
    const event=wrote.document.state.records[`world_event:${work.sourceEvent}`];
    assert.equal(event.verb,'author');assert.ok(event.tags.includes('write'));
    const coins=wrote.document.state.player.coins;
    const pub=await run(wrote.document,'world_research',{operation:'publish',project:work.id,coins:80},'pub1');
    assert.equal(pub.result.printed,20);assert.equal(pub.result.sold+pub.result.kept,20);assert.ok(pub.result.sold>=1);
    assert.equal(pub.document.state.player.coins,coins-80+pub.result.income);assert.equal(pub.result.instances.length,pub.result.kept);
    assert.equal(pub.document.state.itemInstances[pub.result.instances[0]].work,work.id);
    assert.equal(pub.document.state.works[work.id].editions[0].edition,1);
    assert.equal(fame(pub.document,'loc_hw').fame,1);
    assert.ok(pub.document.state.records['world_event:pub1'].tags.includes('publish'));
    // The publication is a civic contribution source for this settlement only, once.
    const credited=await run(pub.document,'world_settlement',{operation:'civic_contribution',settlement:'河湾村',sourceEvent:'pub1'},'credit');
    assert.equal(credited.result.contribution.kind,'work_publish');assert.equal(credited.result.contribution.points,2);
    await assert.rejects(run(pub.document,'world_settlement',{operation:'civic_contribution',settlement:'loc_bs_yupo',sourceEvent:'pub1'},'other'),/本聚落|聚落/);
    const again=await run(credited.document,'world_settlement',{operation:'civic_contribution',settlement:'河湾村',sourceEvent:'pub1'},'again');assert.equal(again.result.contribution.duplicate,true);
    await assert.rejects(run(c,'world_research',{operation:'publish',project:work.id,coins:80},'nowork'),/署名书稿/);
    const illiterate=fresh();illiterate.state.skills.skill_literacy=skill(0);
    await assert.rejects(run(illiterate,'world_research',{operation:'write',name:'无字书',concept:'x'},'nolit'),/识字/);
});

test('抄写：需要原本、抄写员技能与识字；抄本带版本与来源链，品级不超过原本与抄写员；学习受抄本品级限制',async()=>{
    const book='item_book_journey_desk',c=fresh();c.state.inventory[book]={quantity:1,quality:'木',durability:100,weight:0.2};
    await assert.rejects(run(c,'world_research',{operation:'copy',project:book},'noscribe'),/抄写员/);
    const none=fresh();none.state.skills.skill_life_22_core=skill(300);
    await assert.rejects(run(none,'world_research',{operation:'copy',project:book},'nobook'),/原本/);
    c.state.skills.skill_life_22_core=skill(900);c.state.professions.life=['profession_life_22'];
    const first=await until(c,'world_research',{operation:'copy',project:book},row=>row.result.success,'copy1');
    assert.equal(first.result.grade,'中级');assert.equal(first.result.edition,1);assert.deepEqual(first.result.chain,[`catalog:${book}`]);
    assert.equal(first.document.state.itemInstances[first.result.instance].book.grade,'中级');
    assert.equal(first.document.state.careerMetrics.counters.booksCopied,1);
    // Copy of the copy: the original leaves, the chain grows.
    const d=structuredClone(first.document);d.state.inventory[book]={quantity:1,instances:[first.result.instance]};
    const second=await until(d,'world_research',{operation:'copy',project:book},row=>row.result.success,'copy2');
    assert.equal(second.result.edition,2);assert.deepEqual(second.result.chain,[`catalog:${book}`,first.result.instance]);assert.equal(second.result.grade,'中级');
    // A novice scribe's copy is capped at the scribe's own stage.
    const e=structuredClone(d);e.state.skills.skill_life_22_core=skill(100);
    const low=await until(e,'world_research',{operation:'copy',project:book},row=>row.result.success,'copy3');assert.equal(low.result.grade,'初级');
    // Learning a 中级 recipe from only the 初级 copy fails on grade; the 中级 copy passes it.
    const f=structuredClone(low.document);f.state.inventory[book]={quantity:1,instances:[low.result.instance]};
    f.state.skills.skill_life_22_core=skill(300);f.state.professions.life=['profession_life_22'];
    await assert.rejects(run(f,'world_learn',{entity:'recipe_w3c_ledger_cover',source:book,kind:'recipe'},'lowlearn'),/书籍品级不足/);
    const g=structuredClone(f);g.state.inventory[book]={quantity:1,instances:[second.result.instance]};
    g.state.itemInstances[second.result.instance]=structuredClone(second.document.state.itemInstances[second.result.instance]);
    const learned=await run(g,'world_learn',{entity:'recipe_w3c_ledger_cover',source:book,kind:'recipe'},'learn');
    assert.equal(learned.result.source.copy.grade,'中级');assert.deepEqual(learned.result.source.copy.chain,second.result.chain);
});

test('表演：在场观众按演出成色打赏，收入取自观众钱袋；够人数计贡献并增名望',async()=>{
    const c=audience(fresh());c.state.skills.skill_life_13_core=skill(300);
    const empty=fresh();empty.state.skills.skill_life_13_core=skill(300);
    for(const npc of Object.values(empty.state.npcs))if(npc.location===empty.state.location)npc.location='loc_bs';
    await assert.rejects(run(empty,'world_research',{operation:'perform',name:'渡口谣'},'empty'),/观众/);
    const show=await until(c,'world_research',{operation:'perform',name:'渡口谣',minutes:60},row=>row.result.success&&row.result.income>0,'show');
    const tips=show.result.tips.reduce((n,row)=>n+row.coins,0);
    assert.equal(show.result.income,tips);assert.equal(show.document.state.player.coins,500+tips);
    for(const row of show.result.tips)assert.equal(show.document.state.npcs[row.npc].coins,50-row.coins);
    const work=show.document.state.works[show.result.work];assert.equal(work.kind,'performance');assert.ok(work.audience.length>=3);
    assert.equal(fame(show.document,'loc_hw').fame,1);
    const id=work.sourceEvent,credited=await run(show.document,'world_settlement',{operation:'civic_contribution',settlement:'河湾村',sourceEvent:id},'credit');
    assert.equal(credited.result.contribution.kind,'work_perform');assert.equal(credited.result.contribution.points,1);
    assert.ok(show.document.state.records[`world_event:${id}`].tags.includes('perform'));
});

test('测绘：只画亲历地点与路线，持图者地图上可见图上地点；地图可出售转手',async()=>{
    const c=fresh('loc_hw');c.state.skills.skill_life_11_core=skill(300);
    // 在首次开账前设置买方的初始钱袋；后续等待和成交均走真实账本。
    audience(c,['npc_hw_chenbai']);c.state.npcs.npc_hw_chenbai.coins=200;
    c.state.discoveries={loc_hw:{minute:0,source:'亲历'},loc_hw_dock:{minute:0,source:'亲历'}};
    const drawn=await until(c,'world_research',{operation:'survey',name:'河湾渡口图'},row=>row.result.success,'survey');
    assert.ok(drawn.result.locations.includes('loc_hw_dock'));assert.ok(!drawn.result.locations.includes('loc_hw_northwood'));
    assert.ok(drawn.result.routes.includes('route_loc_hw_dock'));
    const unit=drawn.document.state.itemInstances[drawn.result.instance];assert.equal(unit.item,'item_work_map');assert.deepEqual(unit.map.locations,drawn.result.locations);
    // Another holder who never visited the dock sees it from the map.
    const holder=structuredClone(drawn.document);holder.state.discoveries={loc_hw:{minute:0,source:'亲历'}};holder.state.location='loc_hw';
    assert.equal(mapView(engine,holder).locations.find(row=>row.id==='loc_hw_dock')?.knowledge,'reliable');
    const lost=structuredClone(holder);lost.state.itemInstances[drawn.result.instance].owner='npc_hw_chenbai';
    assert.equal(mapView(engine,lost).locations.find(row=>row.id==='loc_hw_dock'),undefined);
    // Sold through the existing trade entry.
    const trading=structuredClone(world);trading.npcs.find(n=>n.id==='npc_hw_chenbai').schedule={default:[{start:0,end:1440,location:'loc_hw',activity:'营业',services:['trade']}]};
    const market=new WorldEngine(trading);
    const visiting=structuredClone(drawn.document);
    // K08：测绘跨过正午，陈白可能已经出门采购；等真实往返结束才卖图。
    const end=Math.max(drawn.document.state.minute,...marketTimeWindows(drawn.document.state,'npc_hw_chenbai').map(r=>r.end));
    // 还须从采购出发地按新营业作息走回柜台，给足一小时的本地步行窗口。
    const waited=await market.reduce(visiting,{tool:'world_time',args:{minutes:Math.max(1,end-drawn.document.state.minute)+60},eventId:'survey-prelude'});
    const shop=applyPatches(visiting,waited.patches);
    const sold=await (async()=>{const out=await market.reduce(shop,{tool:'world_trade',args:{operation:'trade',buyer:'npc_hw_chenbai',seller:'player',item:'item_work_map',quantity:1},eventId:'sell'});return{document:applyPatches(shop,out.patches),result:out.result};})();
    assert.equal(sold.document.state.itemInstances[drawn.result.instance].owner,'npc_hw_chenbai');
    assert.ok(sold.document.state.player.coins>drawn.document.state.player.coins);
});

test('杰作作品成为U4突破凭据（同一阶段同一技能，只用一次）',async()=>{
    const c=fresh();c.state.professions.combat='profession_mage';c.state.skills.skill_light=skill(2399);
    const wrote=await until(c,'world_research',{operation:'write',name:'光的折返',concept:'论照明术在雾中的折返',skills:['照明术']},row=>row.result.masterpiece,'master');
    const evidence=wrote.document.state.careerMetrics.evidence[`masterpiece:${wrote.result.work.slice(5)}`];
    assert.equal(evidence.kind,'masterpiece');assert.deepEqual(evidence.skills,{skill_light:7});
    const done=await run(wrote.document,'world_practice',{skill:'照明术',breakthroughSource:'杰作'},'bt');
    assert.equal(done.result.breakthrough,true);assert.equal(done.result.path,'masterpiece');assert.deepEqual(done.document.state.skills.skill_light.breakthroughs,[8]);
    await assert.rejects(run(done.document,'world_practice',{skill:'照明术',breakthroughSource:'杰作'},'again'),/杰作记录/);
});

test('技能融合：两项相关技能均至少高级1等，投材料与时间，检定通过得融合技能，熟练度为较低一方的四分之一',async()=>{
    const c=fresh();c.state.professions.combat='profession_mage';c.state.skills.skill_light=skill(900);c.state.skills.skill_mage_combat_02=skill(640);
    const args={operation:'fuse',skills:['照明术','元素取样'],name:'取光',concept:'以照明光束显出元素样本的纹理',coins:30,minutes:240};
    const low=structuredClone(c);low.state.skills.skill_mage_combat_02=skill(599);
    await assert.rejects(run(low,'world_research',args,'low'),/高级1等/);
    const far=structuredClone(c);far.state.skills.skill_life_0_core=skill(900);far.state.professions.life=['profession_life_0'];
    await assert.rejects(run(far,'world_research',{...args,skills:['照明术','skill_life_0_core']},'far'),/共同机制/);
    const fused=await until(c,'world_research',args,row=>row.result.success,'fuse');
    const id=fused.result.skill,row=fused.document.state.skills[id];
    assert.equal(row.proficiency,160);assert.equal(row.source.type,'fusion');assert.deepEqual(row.source.skills,['skill_light','skill_mage_combat_02']);
    assert.equal(fused.document.state.created[id].name,'取光');assert.equal(fused.document.state.player.coins<500,true);
    await assert.rejects(run(fused.document,'world_research',{...args,name:'取光二'},'twice'),/已经融合/);
});

test('作品系统复用 world_research，不新增工具',()=>{
    const tools=toolDefinitions();assert.equal(tools.length,27);
    assert.match(tools.find(t=>t.function.name==='world_research').function.description,/fuse/);
});

test('F014 出版需求来自真实读者：同一读者不重复买；再版无新读者则售0；名望与贡献只记一次；钱来自读者钱袋而非凭空',async()=>{
    // K08：先让真实午间客流结算，再建立读者钱袋夹具。12:30写240分钟，
    // 首版17:30赶在陆青18点出门前；三版共到19:30，不跨次日正午。
    const {document:c}=await run(fresh(),'world_time',{until:{dayOffset:0,hour:12,minute:30}},'readers-prelude');
    // 读者夹具：卢清（已识字450）有200铜；陈白、林穗识字300，陈白50铜、林穗只有20铜（买不起：20÷4=5铜 < 书价）。
    for(const id of['npc_hw_chenbai','npc_hw_linsui']){c.state.npcs[id].skills={...c.state.npcs[id].skills,skill_literacy:skill(300)};Object.assign(c.state.npcs[id],{location:'bld_hw_school',status:'正常'});}
    c.state.npcs.npc_hw_luqing.coins=200;c.state.npcs.npc_hw_chenbai.coins=50;c.state.npcs.npc_hw_linsui.coins=20;
    const wrote=await until(c,'world_research',{operation:'write',name:'河湾农事札记',concept:'记河湾村一年的播种与收成',minutes:240},row=>row.result.success&&row.result.quality==='普通','write');
    const work=wrote.result.work,coin=doc=>doc.state.player.coins+Object.values(doc.state.npcs).reduce((n,x)=>n+x.coins,0);
    const total=coin(wrote.document);
    // 普通做工系数1：书价 round(8×1)=8铜。第一版印 80÷4=20 册。可买者：卢清(200÷4=50≥8)、陈白(50÷4=12≥8)；林穗 20÷4=5<8 买不起。
    const first=await run(wrote.document,'world_research',{operation:'publish',project:work,coins:80},'pub1');
    // 设计依据（F014）：读者各自经 NPC 决策路径决定买不买，不再按识字高低排序指派；同样有钱愿买的两人按编号先后到柜（陈白在卢清之前）。
    assert.deepEqual(first.result.buyers,['npc_hw_chenbai','npc_hw_luqing']);
    assert.equal(first.result.sold,2);assert.equal(first.result.income,16);assert.equal(first.result.kept,18);
    assert.equal(first.document.state.npcs.npc_hw_luqing.coins,192);assert.equal(first.document.state.npcs.npc_hw_chenbai.coins,42);assert.equal(first.document.state.npcs.npc_hw_linsui.coins,20);
    assert.equal(first.document.state.player.coins,wrote.document.state.player.coins-80+16);
    // 总钱数只减去印刷费80（进 sink:export）：读者付的16铜是从他们钱袋转给作者，不是凭空增加。
    assert.equal(coin(first.document),total-80);
    assert.equal(first.document.state.itemInstances[first.result.instances[0]].owner,'player');
    assert.equal(fame(first.document,'loc_hw').fame,1);assert.equal(first.document.state.works[work].editions[0].points,2);
    // 第二版：能买的人已各有一册，林穗仍买不起 => 没有新读者，售0、收入0，钱只出不进；名望不再加，贡献分为0。
    const second=await run(first.document,'world_research',{operation:'publish',project:work,coins:40},'pub2');
    assert.deepEqual(second.result.buyers,[]);assert.equal(second.result.sold,0);assert.equal(second.result.income,0);assert.equal(second.result.kept,10);
    assert.equal(second.document.state.player.coins,first.document.state.player.coins-40);
    assert.equal(fame(second.document,'loc_hw').fame,1);assert.equal(second.document.state.works[work].editions[1].points,0);
    // 林穗有钱以后成为新读者：第三版印 80÷4=20 册，只有他买一册，得8铜。
    const richer=structuredClone(second.document);richer.state.npcs.npc_hw_linsui.coins=100;
    const third=await run(richer,'world_research',{operation:'publish',project:work,coins:80},'pub3');
    assert.deepEqual(third.result.buyers,['npc_hw_linsui']);assert.equal(third.result.income,8);assert.equal(third.document.state.npcs.npc_hw_linsui.coins,92);
    assert.equal(fame(third.document,'loc_hw').fame,1);
});
