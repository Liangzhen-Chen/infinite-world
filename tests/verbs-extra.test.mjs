import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {organization} from '../server-plugin/organizations.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {eligible,playerOffices} from '../server-plugin/governance.mjs';
import {knownTopics} from '../server-plugin/public-opinion.mjs';
import {toolDefinitions,resolveToolCall} from '../extension/tools.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),DAY=1440;
const A='npc_hw_linsui',B='npc_hw_ayan',G='npc_hw_gucen',J='npc_hw_chenbai';
function fixture(edit=()=>{}){
    const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}edit(w);
    const engine=new WorldEngine(w);let doc=engine.createCharacter(seed,{},'u15-verbs');doc.state.minute=600;doc.state.player.coins=5000;
    for(const n of Object.values(doc.state.npcs))Object.assign(n,{location:'loc_capital',activity:'闲谈',status:'正常'});
    const place=(id,location=doc.state.location)=>Object.assign(doc.state.npcs[id],{location,activity:'当值',status:'正常'});
    const put=(item,quantity=1)=>doc.state.inventory[item]={quantity,quality:w.items.find(i=>i.id===item).quality,durability:100};
    const act=async(tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});doc=applyPatches(doc,out.patches);return out.result;};
    const event=(roll,label='check')=>{for(let n=0;;n++){const id=`${label}_${n}`,die=createHash('sha256').update(`${doc.randomSeed}:${id}:d20`).digest().readUInt32LE(0)%20+1;if(die===roll)return id;}};
    return {engine,w,act,place,put,event,get doc(){return doc;}};
}
const qty=(f,item)=>f.doc.state.inventory[item]?.quantity??0;
const coins=f=>f.doc.state.player.coins+Object.values(f.doc.state.npcs).reduce((n,r)=>n+(r.coins??0),0)+Object.values(f.doc.state.records).filter(r=>['legal_treasury','legal_deposit'].includes(r.category)).reduce((n,r)=>n+(r.coins??0),0);
const view=(f,id,value)=>f.doc.state.records[`standing:${id}:player`]={category:'standing',holder:id,target:'player',value,history:[]};

test('钓鱼按真实鱼种、时段和季节检定；渔获可售，种群扣减守恒，失败仍耗时磨刀',async()=>{
    const f=fixture(),h=f.engine.rules.wildlife.habitats.find(h=>h.id==='habitat_hw_water');f.doc.state.location=h.location;
    f.put('item_kitchen_knife');f.put('item_water',20);const fish='monster_black_fin_perch',key=`ecology:${h.id}`;
    const before=f.doc.state.records[key].populations[fish].count,minute=f.doc.state.minute;
    const out=await f.act('world_field',{operation:'wildlife_fish',species:fish},f.event(20,'fish'));
    assert.equal(out.success,true);assert.equal(qty(f,'item_fish'),1);assert.equal(out.season,0);assert.equal(out.check.difficulty,10);
    const p=f.doc.state.records[key].populations[fish];assert.equal(p.count,before-1);assert.equal(p.initial+p.born+(p.immigrated??0)-(p.emigrated??0)-p.predated-p.starved-p.withdrawn,p.count);
    assert.equal(f.doc.state.skills.skill_life_2_core.proficiency,3);assert.equal(f.doc.state.minute,minute+30);
    assert.equal(f.doc.state.inventory.item_kitchen_knife.durability,99);
    f.put('item_charcoal');f.doc.state.player.hp-=2;
    const meal=await f.act('world_field',{operation:'wildlife_eat'},'eat_catch');assert.equal(meal.eaten,1);assert.equal(qty(f,'item_fish'),0);assert.equal(qty(f,'item_charcoal'),0);
    await f.act('world_field',{operation:'wildlife_fish',species:fish},f.event(20,'fish_for_sale'));
    f.place(A);f.doc.state.npcs[A].coins=100;
    const total=coins(f);await f.act('world_trade',{seller:'player',buyer:A,item:'item_fish',quantity:1},'sell_fish');assert.equal(qty(f,'item_fish'),0);assert.equal(coins(f),total);
    const count=f.doc.state.records[key].populations[fish].count;
    const fail=await f.act('world_field',{operation:'wildlife_fish',species:fish},f.event(1,'fish_fail'));assert.equal(fail.success,false);assert.equal(f.doc.state.records[key].populations[fish].count,count);
    // Day-active fish cannot be summoned out of hours; all fish exhausted means no new catch.
    f.doc.state.minute=1200;const night=await f.act('world_field',{operation:'wildlife_fish',species:fish},f.event(20,'fish_night'));assert.equal(night.success,false);
    f.doc.state.location='loc_hw_northwood';await assert.rejects(f.act('world_field',{operation:'wildlife_fish'},'fish_land'),/水域/);
});

test('过度捕捞耗尽当地可用鱼群；无鱼时成功骰也不能凭空生成渔获',async()=>{
    const f=fixture(),h=f.engine.rules.wildlife.habitats.find(h=>h.id==='habitat_hw_water'),species='monster_black_fin_perch';f.doc.state.location=h.location;f.put('item_kitchen_knife');f.put('item_water',4);
    const p=f.doc.state.records[`ecology:${h.id}`].populations[species];p.count=1;p.withdrawn=p.initial-1;
    const first=await f.act('world_field',{operation:'wildlife_fish',species},f.event(20,'last_fish'));assert.equal(first.success,true);
    const second=await f.act('world_field',{operation:'wildlife_fish',species},f.event(20,'empty_fish'));assert.equal(second.success,false);assert.equal(qty(f,'item_fish'),1);assert.equal(f.doc.state.records[`ecology:${h.id}`].populations[species].count,0);
});

test('开矿需要工具；储量与产出守恒，失败磨损，枯竭及缓慢恢复有边界',async()=>{
    const f=fixture(w=>{w.rules.extraction.mining.terrain.find(r=>r.tag==='earth').minerals[0].recoveryDays=1;});f.doc.state.location='loc_wild_lq_adit';await assert.rejects(f.act('world_field',{operation:'site_mine'},'no_pick'),/工具/);
    f.doc.state.inventory.item_mining_pick=1;f.doc.state.player.level=100;
    const out=await f.act('world_field',{operation:'site_mine'},f.event(20,'mine'));assert.equal(out.success,true);assert.equal(qty(f,'item_iron_ore'),1);assert.equal(out.reserve,3);
    const key='mineral:loc_wild_lq_adit:item_iron_ore',p=f.doc.state.records[key];assert.equal(p.initial+p.recovered-p.extracted,p.reserve);assert.equal(f.doc.state.inventory.item_mining_pick.durability,98);assert.equal(f.doc.state.skills.skill_life_17_core.proficiency,3);
    await f.act('world_field',{operation:'site_mine'},f.event(1,'mine_fail'));assert.equal(f.doc.state.records[key].reserve,3);assert.equal(f.doc.state.inventory.item_mining_pick.durability,96);
    f.doc.state.records[key]={...p,reserve:0,extracted:4};await assert.rejects(f.act('world_field',{operation:'site_mine'},'mine_dry'),/枯竭/);
    // Advance the clock without harvesting: lazy recovery only runs at the next mine action.
    await f.act('world_time',{minutes:DAY},'wait_mineral');await f.act('world_field',{operation:'site_mine'},f.event(20,'mine_return'));
    const next=f.doc.state.records[key];assert.equal(next.recovered,1);assert.equal(next.reserve,0);assert.equal(next.initial+next.recovered-next.extracted,next.reserve);
});

test('他人矿区盗采进入法律；在场矿主许可不制造罪名，许可有期限',async()=>{
    const f=fixture(w=>{w.rules.extraction.mining.locations.loc_hw_gate=[{item:'item_iron_ore',reserve:2,owner:A,recoveryDays:0}];});
    f.doc.state.location='loc_hw_gate';f.put('item_mining_pick');f.doc.state.player.level=100;f.place(A);f.place(G);
    const out=await f.act('world_field',{operation:'site_mine'},f.event(20,'illegal'));assert.equal(out.illegal,true);assert.equal(f.doc.state.records[out.case].offense,'illegal_mining');assert.equal(f.doc.state.records[out.case].status,'已报案');
    const permit=await f.act('world_settlement',{operation:'mining_permit',authority:A,consent:true,minutes:120},'permit');
    const legal=await f.act('world_field',{operation:'site_mine',authorization:permit.permit},f.event(20,'licensed'));assert.equal(legal.illegal,false);assert.equal(legal.case,null);
    await assert.rejects(f.act('world_settlement',{operation:'mining_permit',authority:B,consent:true},'wrong_owner'),/所有者/);
});

test('正式决斗由性格立场灵智决定；拒绝不伤人，见证人不可冒充；点到为止留命并记名望',async()=>{
    const f=fixture(w=>{w.npcs.find(n=>n.id===A).personality={traits:['勇敢','尚武']};});f.doc.state.location='loc_hw_gate';f.place(A);f.place(B);
    await assert.rejects(f.act('world_settlement',{operation:'duel_challenge',member:A,authority:A},'duel_self'),/独立/);
    const challenge=await f.act('world_settlement',{operation:'duel_challenge',member:A,authority:B,choice:'touch'},'duel');assert.equal(challenge.status,'已接受');
    f.doc.state.npcs[A].hp=1;f.doc.state.player.attributes.力量=100;f.doc.state.player.attributes.敏捷=100;
    for(let n=0;n<12&&f.doc.state.records[challenge.duel].status!=='已结束';n++)await f.act('world_combat',{target:A},`duel_hit_${n}`);
    assert.equal(f.doc.state.records[challenge.duel].status,'已结束');assert.equal(f.doc.state.npcs[A].status,'正常');assert.ok(f.doc.state.npcs[A].hp>=1);
    assert.ok(f.doc.state.records.duel_renown);assert.equal(Object.values(f.doc.state.records).some(r=>r.category==='legal_case'),false);
    const other=fixture(w=>{w.npcs.find(n=>n.id===A).personality={traits:['谨慎','温和']};});other.place(A);other.place(B);
    const hp=other.doc.state.npcs[A].hp,no=await other.act('world_settlement',{operation:'duel_challenge',member:A,authority:B,choice:'death'},'refuse');assert.equal(no.status,'已拒绝');assert.equal(other.doc.state.npcs[A].hp,hp);
});

test('NPC向玩家下战书须玩家答复；生死斗按本法域独立决斗规则登记杀人案',async()=>{
    const f=fixture(w=>{w.npcs.find(n=>n.id===A).personality={traits:['勇敢','尚武','好斗']};});f.doc.state.location='loc_hw_gate';f.place(A);f.place(B);view(f,A,-100);
    const c=await f.act('world_settlement',{operation:'duel_challenge',speaker:A,member:'player',authority:B,choice:'death'},'challenge_player');assert.equal(c.status,'待答复');
    await f.act('world_settlement',{operation:'duel_answer',proposal:c.duel,consent:true},'accept_player');f.doc.state.npcs[A].hp=1;f.doc.state.player.attributes.力量=100;f.doc.state.player.attributes.敏捷=100;
    for(let i=0;i<12&&f.doc.state.npcs[A].status!=='死亡';i++)await f.act('world_combat',{target:A},`lethal_${i}`);
    assert.equal(f.doc.state.npcs[A].status,'死亡');assert.ok(Object.values(f.doc.state.records).some(r=>r.category==='legal_case'&&r.offense==='homicide'));
});

test('点到为止在玩家仅一生命时仍判负而不杀人；法典可独立准许生死斗',async()=>{
    const f=fixture(w=>{const n=w.npcs.find(n=>n.id===A);n.personality={traits:['尚武']};n.attributes={力量:100,敏捷:100,体质:100,智力:10,精神:10,魅力:10};});f.place(A);f.place(B);f.doc.state.player.hp=1;
    const c=await f.act('world_settlement',{operation:'duel_challenge',member:A,authority:B,choice:'touch'},'touch_player');
    for(let i=0;i<12&&f.doc.state.records[c.duel].status!=='已结束';i++)await f.act('world_combat',{target:A},`touch_low_${i}`);
    assert.equal(f.doc.state.records[c.duel].winner,A);assert.equal(f.doc.state.player.hp,1);assert.equal(f.doc.state.player.status,'正常');
    const legal=fixture(w=>{w.npcs.find(n=>n.id===A).personality={traits:['尚武']};w.rules.law.duels.law_hw_property.death=true;});legal.doc.state.location='loc_hw_gate';legal.place(A);legal.place(B);view(legal,A,-100);
    await legal.act('world_settlement',{operation:'duel_challenge',member:A,authority:B,choice:'death'},'legal_death');legal.doc.state.npcs[A].hp=1;legal.doc.state.player.attributes.力量=100;legal.doc.state.player.attributes.敏捷=100;
    for(let i=0;i<12&&legal.doc.state.npcs[A].status!=='死亡';i++)await legal.act('world_combat',{target:A},`legal_hit_${i}`);
    assert.equal(legal.doc.state.npcs[A].status,'死亡');assert.equal(Object.values(legal.doc.state.records).some(r=>r.category==='legal_case'),false);
});

function smugglingFixture({honest=false}={}){
    const f=fixture(w=>{
        w.routes.push({id:'route_u15_checkpoint',from:'loc_hw_gate',to:'loc_hw_dock',lengthKm:.1,speedKmh:5,modes:['walk'],closedSeasons:[],toll:1,risk:0});
        w.rules.smuggling.checkpoints.push({route:'route_u15_checkpoint',location:'loc_hw_gate',guards:[G],taxBps:1500});
        if(honest)w.rules.law.polities[0].integrity[G]=100;
    });
    f.doc.state.location='loc_hw_gate';f.place(G);f.place(A,'loc_hw_dock');f.doc.state.npcs[A].coins=1000;f.put('item_ember_core',3);return f;
}
test('走私装货不凭空获利；实际过关隐藏成功后当面售货，买方与行囊资金守恒',async()=>{
    const f=smugglingFixture(),total=coins(f);f.doc.state.player.attributes.敏捷=1000;
    const s=await f.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:2,location:'loc_hw_dock'},'load');
    await assert.rejects(f.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:2,location:'loc_hw_dock'},'double'),/足量/);
    await assert.rejects(f.act('world_trade',{operation:'deliver_smuggled',seller:A,contract:s.shipment},'early'),/目的地/);
    await f.act('world_move',{destination:'loc_hw_dock'},'cross');const row=f.doc.state.records[s.shipment];assert.ok(row.checks.some(c=>c.edge==='route_u15_checkpoint'&&c.passed));
    const out=await f.act('world_trade',{operation:'deliver_smuggled',seller:A,contract:s.shipment},'deliver');assert.equal(out.success,true);assert.ok(out.paid>0);assert.equal(qty(f,'item_ember_core'),1);assert.equal(f.doc.state.records[s.shipment].status,'已交付');assert.equal(coins(f),total-1,'仅原有路费退出玩家/NPC账，货款不生成');
    await assert.rejects(f.act('world_trade',{operation:'deliver_smuggled',seller:A,contract:s.shipment},'twice'),/待交付/);
});

test('廉洁守卫拒绝贿赂，查获没收实物并登记可判罚案件；无岗守卫不隔空查验',async()=>{
    const f=smugglingFixture({honest:true});f.doc.state.player.attributes.敏捷=1;
    const s=await f.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:2,coins:500,location:'loc_hw_dock'},'load_fail');
    await f.act('world_move',{destination:'loc_hw_dock'},'catch');const row=f.doc.state.records[s.shipment];assert.equal(row.status,'已查获');assert.equal(qty(f,'item_ember_core'),1);assert.equal(row.seizure.custodian,G);assert.equal(f.doc.state.npcs[G].inventory.item_ember_core.quantity,2);assert.equal(f.doc.state.records[row.seizure.case].offense,'smuggling');
    assert.ok(Object.values(f.doc.state.records).some(r=>r.offense==='bribery_attempt'));
    await assert.rejects(f.act('world_trade',{operation:'deliver_smuggled',seller:A,contract:s.shipment},'sell_seized'),/待交付/);
});

test('走私沿实际路段查验：贿赂用U5廉洁价码，收钱被目击则撤职通缉；离岗不查验',async()=>{
    const f=smugglingFixture();f.doc.state.player.attributes.敏捷=1;
    const s=await f.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:1,coins:1000,location:'loc_hw_dock'},'bribe_load');
    await f.act('world_move',{destination:'loc_hw_dock'},'bribe_pass');const r=f.doc.state.records[s.shipment];assert.equal(r.checks[0].bribed,true);assert.equal(r.checks[0].exposed,false);assert.equal(r.status,'运输中');
    const other=smugglingFixture();other.doc.state.player.attributes.敏捷=1;other.doc.state.player.attributes.魅力=1;other.place(B,'loc_hw_gate');
    const bad=await other.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:1,coins:1000,location:'loc_hw_dock'},'exposed_load');
    await other.act('world_move',{destination:'loc_hw_dock'},'exposed_cross');const discovered=other.doc.state.records[bad.shipment];assert.equal(discovered.checks[0].exposed,true);assert.ok(discovered.checks[0].corruption);assert.ok(other.doc.state.records[`legal_dismissal:${G}`]);assert.ok(Object.values(other.doc.state.records).some(r=>r.category==='legal_wanted'&&r.subject===G));
    const quiet=smugglingFixture();quiet.place(G,'loc_capital');quiet.doc.state.player.attributes.敏捷=1;
    const no=await quiet.act('world_trade',{operation:'smuggle',seller:A,item:'item_ember_core',quantity:1,location:'loc_hw_dock'},'unguarded');await quiet.act('world_move',{destination:'loc_hw_dock'},'no_guard');assert.equal(quiet.doc.state.records[no.shipment].checks[0].guard,null);assert.equal(quiet.doc.state.records[no.shipment].status,'运输中');
});

function orgFixture(){
    const f=fixture();f.place(A);f.place(B);const id='org_u15';
    f.doc.state.created[id]={id,name:'河口运货会',kind:'行会',aliases:[],scope:f.doc.state.location};
    f.doc.state.records[`organization:${id}`]={category:'organization',id,source:'created',name:'河口运货会',kind:'行会',seat:f.doc.state.location,leader:A,members:{player:{position:'成员'},[A]:{position:'会长'},[B]:{position:'成员'}},removed:{},treasury:0,charter:{mode:'vote',approval:true,fee:0,dues:0,rules:[]}};
    return {f,id};
}
test('走私组织沿U1入会，非成员不能借组织名义装运',async()=>{
    const f=smugglingFixture(),id='org_night_carriers';
    f.doc.state.created[id]={id,name:'渡口夜运会',kind:'帮派',aliases:[],scope:f.doc.state.location};
    f.doc.state.records[`organization:${id}`]={category:'organization',id,source:'created',name:'渡口夜运会',kind:'帮派',seat:f.doc.state.location,leader:G,members:{[G]:{position:'帮主'}},removed:{},treasury:0,charter:{mode:'leader',approval:false,fee:0,dues:0,rules:['合伙私运货物，亏损各负']}};
    const args={operation:'smuggle',seller:A,item:'item_ember_core',quantity:1,location:'loc_hw_dock',business:id};
    await assert.rejects(f.act('world_trade',args,'not_member'),/加入/);
    const joined=await f.act('world_settlement',{operation:'org_join',org:id},'join_smugglers');assert.equal(joined.joined,true);
    const shipment=await f.act('world_trade',args,'org_shipment');assert.equal(f.doc.state.records[shipment.shipment].org,id);
});
test('组织竞选拉票送礼、演说、承诺会改变立场和舆论；投票走U1正式任命会长',async()=>{
    const {f,id}=orgFixture();view(f,A,8);view(f,B,8);f.put('item_ration',2);
    const s=await f.act('world_settlement',{operation:'election_start',org:id},'run');
    await assert.rejects(f.act('world_settlement',{operation:'election_finish',proposal:s.election},'too_soon'),/投票日/);
    const total=coins(f);await f.act('world_settlement',{operation:'election_campaign',proposal:s.election,choice:'gift',speaker:A,item:'item_ration'},f.event(20,'gift'));assert.equal(qty(f,'item_ration'),1);assert.equal(coins(f),total);
    await f.act('world_settlement',{operation:'election_campaign',proposal:s.election,choice:'promise',speaker:B,content:'每月公布账目。'},f.event(20,'promise'));
    assert.ok(standing(f.engine,f.doc.state,A,'player')>=10);assert.ok(knownTopics(f.engine,f.doc,B).size>0);
    f.doc.state.minute=f.doc.state.records[s.election].due;const out=await f.act('world_settlement',{operation:'election_finish',proposal:s.election},'vote');assert.equal(out.won,true);assert.equal(organization(f.engine,f.doc.state,id).leader,'player');assert.equal(f.doc.state.records[out.proposal].category,'organization_proposal');
    await assert.rejects(f.act('world_settlement',{operation:'election_finish',proposal:s.election},'vote_again'),/已经结束/);
});

test('组织拒绝非选任职位；拉票失败与反对票可落选，贿选可用U8证词揭发并接U5案件',async()=>{
    const {f,id}=orgFixture();f.doc.state.records[`organization:${id}`].charter.mode='leader';await assert.rejects(f.act('world_settlement',{operation:'election_start',org:id},'not_vote'),/投票/);
    f.doc.state.records[`organization:${id}`].charter.mode='vote';const s=await f.act('world_settlement',{operation:'election_start',org:id},'run_bad');
    const speech=await f.act('world_settlement',{operation:'election_campaign',proposal:s.election,choice:'speech',content:'我来管理公库。'},f.event(1,'bad_speech'));assert.equal(speech.success,false);assert.ok(standing(f.engine,f.doc.state,A,'player')<0);
    // Move the same organization meeting to a law-covered checkpoint for a witnessed disclosure.
    f.doc.state.location='loc_hw_gate';f.place(A);f.place(B);f.place(G);const total=coins(f);
    await f.act('world_settlement',{operation:'election_campaign',proposal:s.election,choice:'buy_votes',speaker:A,authority:B,coins:20},'bought');assert.equal(coins(f),total);
    assert.ok(Object.values(f.doc.state.records).some(r=>r.category==='lie'&&r.truth.includes('贿选')));
    const exposed=await f.act('world_settlement',{operation:'election_expose',proposal:s.election,sourceEvent:'bought',speaker:A},'expose');assert.equal(exposed.disqualified,true);assert.equal(f.doc.state.records[exposed.case].offense,'vote_buying');assert.ok(exposed.exposed.length);
    f.doc.state.minute=f.doc.state.records[s.election].due;const out=await f.act('world_settlement',{operation:'election_finish',proposal:s.election},'lose');assert.equal(out.won,false);assert.equal(organization(f.engine,f.doc.state,id).leader,A);
});

test('村长竞选按成年住户立场投票，当选后仍经现有公署资格审定才能任职',async()=>{
    const f=fixture(),sid='loc_bs_yupo',profile=f.w.settlementProfiles.find(s=>s.id===sid),head=profile.details.governance.head,chart=f.w.rules.governance.authority.superiors.auth_bs_office_charter;
    f.doc.state.location=profile.details.governance.meetingPlace;
    f.doc.state.records[`civic_citizen:${sid}:player`]={category:'civic_citizen',subject:'player',settlement:sid,status:'已登记',sourceEvent:'citizen'};
    f.doc.state.records.contribution={category:'civic_contribution',sourceEvent:'service',settlement:sid,subject:'player',kind:'donation',points:120,minute:0};
    for(const voter of eligible(f.engine,sid,f.doc.state))view(f,voter,100);
    const s=await f.act('world_settlement',{operation:'election_start',settlement:sid,name:'office_village_head'},'village_run');
    await f.act('world_time',{minutes:f.doc.state.records[s.election].due-f.doc.state.minute},'election_day');f.doc.state.location=chart.seat;
    const clerk=f.w.npcs.find(n=>n.workplace?.location===chart.seat&&chart.registrars.occupations.includes(n.occupation)).id;f.place(clerk);
    const win=await f.act('world_settlement',{operation:'election_finish',proposal:s.election},'village_vote');assert.equal(win.won,true);assert.equal(f.doc.state.records[win.appointment].status,'待审定');assert.equal(playerOffices(f.doc.state).length,0);
    await f.act('world_time',{minutes:3*DAY},'appoint');assert.ok(playerOffices(f.doc.state).some(o=>o.office==='office_village_head'));
});

test('工具仍为25个，静态提示不超过硬上限',async()=>{
    assert.equal(toolDefinitions().length,27);assert.equal(resolveToolCall('world_field',{operation:'wildlife_fish'}).args.operation,'fish');
    const bundle=await loadPromptBundle();assert.ok(bundle.budget.estimatedTokens<=bundle.budget.limit,`提示${bundle.budget.estimatedTokens}，上限${bundle.budget.limit}`);
});
