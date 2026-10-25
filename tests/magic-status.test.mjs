import {relationView} from '../server-plugin/npc-state.mjs';
// A3 causal2: read the canonical relation; preserve original trust expectations.
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),light=world.spells[0];
    for(const[status,power]of[['stone_skin',4],['fire_shield',40],['fear',2]]){
        world.skills.push({id:`skill_test_${status}`,name:`试炼${status}`,attribute:'精神',profession:null});
        world.spells.push({...light,id:`spell_test_${status}`,name:`试炼${status}`,skill:`skill_test_${status}`,mp:2,duration:5,effectSpec:{kind:'status',status,power}});
    }
    for(const type of['fire','cold']){
        world.skills.push({id:`skill_test_${type}`,name:`试炼伤害${type}`,attribute:'精神',profession:null});
        world.spells.push({...light,id:`spell_test_${type}`,name:`试炼伤害${type}`,skill:`skill_test_${type}`,mp:2,duration:0,effectSpec:{kind:'damage',power:20,damageType:type,armorFactor:0}});
    }
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'status-test');
    document.state.player.mp=100;document.state.player.maxMp=100;document.state.player.hp=100;document.state.player.maxHp=100;
    document.state.npcs.npc_hw_linsui.hp=100;document.state.npcs.npc_hw_linsui.maxHp=100;
    for(const spell of world.spells){document.state.spells[spell.id]={source:{type:'fixture'}};document.state.skills[spell.skill]={proficiency:10,breakthroughs:[],daily:{}};}
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function cast(run,document,args){
    for(let i=0;i<100;i++){const row=await run(document,'world_cast',args,`status_${i}`);if(row.result.success)return{...row,id:`status_${i}`};}
    throw new Error('没有得到成功检定');
}
test('石肤真实影响交锋，不叠加，过期后恢复同一骰点结果',async()=>{
    const{document,run}=await setup(),args={target:'林穗',intent:'defend'};
    document.state.npcs.npc_hw_linsui.level=15;
    let event,ordinary;for(let i=0;i<20;i++){event=`fixed-exchange-${i}`;ordinary=await run(document,'world_combat',args,event);if(ordinary.result.received>5)break;}
    assert.ok(ordinary.result.received>5,'夹具须有命中的强度足够攻击，避免最低1伤害遮住防护差异');
    const shielded=await cast(run,document,{spell:'spell_test_stone_skin',target:'player'});
    const protectedHit=await run(shielded.document,'world_combat',args,event);
    assert.ok(protectedHit.result.received<ordinary.result.received);
    const duplicate=structuredClone(shielded.document);
    duplicate.state.effects.copy={...duplicate.state.effects[shielded.id],source:'copy'};
    assert.equal((await run(duplicate,'world_combat',args,event)).result.received,protectedHit.result.received);
    const expired=await run(shielded.document,'world_time',{minutes:5},'expiry');
    assert.equal(Object.keys(expired.document.state.effects).length,0);
    assert.equal((await run(expired.document,'world_combat',args,event)).result.received,ordinary.result.received);
    assert.deepEqual(await run(document,'world_cast',{spell:'spell_test_stone_skin',target:'player'},shielded.id),shielded&&{document:shielded.document,result:shielded.result});
});
test('火焰防护按门类减伤，寒冷伤害保持原值，不生成全能护盾',async()=>{
    const{document,run}=await setup(),shield=await cast(run,document,{spell:'spell_test_fire_shield',target:'player'});
    const fire=await cast(run,shield.document,{spell:'spell_test_fire',target:'player'});
    const cold=await cast(run,shield.document,{spell:'spell_test_cold',target:'player'});
    assert.equal(fire.result.damage,12);assert.equal(cold.result.damage,20);
});
test('防护他人需要同意，恐惧施术留敌意记录并影响命中',async()=>{
    const{document,run}=await setup();const before=structuredClone(document);
    await assert.rejects(run(document,'world_cast',{spell:'spell_test_stone_skin',target:'林穗'},'without-consent'),/本人同意/);
    assert.deepEqual(document,before);
    document.state.records.support={category:'authorization',subject:'npc_hw_linsui',grantor:'npc_hw_linsui',grantee:'player',action:'support_magic',expires:document.state.minute+10};
    const protectedNpc=await cast(run,document,{spell:'spell_test_stone_skin',target:'林穗',authorization:'support'});
    assert.equal(protectedNpc.result.status,'stone_skin');
    const feared=await cast(run,document,{spell:'spell_test_fear',target:'林穗'});
    assert.equal(relationView(null,feared.document.state,'npc_hw_linsui','player').trust,-10);
    assert.equal(feared.document.state.npcs.npc_hw_linsui.developments.at(-1).type,'敌意法术');
    let normalDamage=0,fearedDamage=0;
    for(let i=0;i<512;i++){
        normalDamage+=(await run(document,'world_combat',{target:'林穗'},`fear-combat-${i}`)).result.received;
        fearedDamage+=(await run(feared.document,'world_combat',{target:'林穗'},`fear-combat-${i}`)).result.received;
    }
    assert.ok(fearedDamage<normalDamage);
});
test('照明使用真实持有物，到期熄灭；发光物出售后不再照亮玩家',async()=>{
    const{world,engine,document,run}=await setup();world.locations.find(row=>row.id===document.state.location).combatTags=['dark'];
    const darkEngine=new WorldEngine(world);
    const fight=async(c,eventId)=>(await darkEngine.reduce(c,{tool:'world_combat',args:{target:'林穗'},eventId})).result;
    const lit=await cast(run,document,{spell:'spell_light',target:'旧木杖'});
    assert.equal(lit.result.illuminated,true);assert.equal(lit.document.state.effects[lit.id].target,'item_staff');
    const sold=structuredClone(lit.document);delete sold.state.inventory.item_staff;
    let darkDamage=0,litDamage=0;
    for(let i=0;i<60;i++){
        const event=`light-combat-${i}`,dark=await fight(document,event),light=await fight(lit.document,event);
        darkDamage+=dark.damage;litDamage+=light.damage;
        assert.equal((await fight(sold,event)).damage,dark.damage);
    }
    assert.ok(litDamage>darkDamage,'发光必须实际改善暗处命中');
    const expired=await run(lit.document,'world_time',{minutes:60},'lights-off');
    assert.equal(Object.keys(expired.document.state.effects).length,0);
    await assert.rejects(run(document,'world_cast',{spell:'spell_light',target:'铁料'},'unowned'),/实际持有/);
});
test('无处理器的机制与非法持续状态在扣魔力前拒绝',async()=>{
    const{world,document}=await setup(),spell=world.spells.find(row=>row.id==='spell_test_stone_skin');
    delete spell.effectSpec;spell.mechanism='unsupported_dynamic_world_change';
    await assert.rejects(new WorldEngine(world).reduce(document,{tool:'world_cast',args:{spell:spell.id,target:'player'},eventId:'missing-handler'}),/尚未接入/);
    spell.effectSpec={kind:'status',status:'stone_skin',power:5000};
    await assert.rejects(new WorldEngine(world).reduce(document,{tool:'world_cast',args:{spell:spell.id,target:'player'},eventId:'overpowered'}),/规则表/);
    assert.equal(document.state.player.mp,100);
});
