import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),light=world.spells[0];
    const rows=[['damage','试炼焰矢',8],['heal','试炼止血',5],['repair','试炼熔缝',12],['dry','试炼烘衣',100]];
    for(const[kind,name,power]of rows){
        world.skills.push({id:`skill_test_${kind}`,name,attribute:'精神',profession:null});
        world.spells.push({...light,id:`spell_test_${kind}`,name,skill:`skill_test_${kind}`,mp:2,duration:0,effectSpec:{kind,power},materials:kind==='repair'?[{item:'item_iron',amount:1}]:[]});
    }
    world.items.find(row=>row.id==='item_staff').tags=['metal'];
    world.items.find(row=>row.id==='item_clothes').tags=['clothing'];
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'magic-test');
    for(const[kind]of rows){document.state.spells[`spell_test_${kind}`]={source:{type:'fixture'}};document.state.skills[`skill_test_${kind}`]={proficiency:10,daily:{},breakthroughs:[]};}
    document.state.inventory.item_iron={quantity:2,quality:'木',durability:100,weight:2};
    const run=async(c,args,id)=>{const out=await engine.reduce(c,{tool:'world_cast',args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function successful(run,document,args){for(let i=0;i<100;i++){const result=await run(document,args,`magic_${i}`);if(result.result.success)return {...result,id:`magic_${i}`};}throw new Error('测试夹具未出现成功');}
test('伤害法术实际扣生命，NPC永久死亡，远处或已死目标拒绝',async()=>{
    const{document,run}=await setup();document.state.npcs.npc_hw_linsui.hp=1;
    const cast=await successful(run,document,{spell:'spell_test_damage',target:'林穗'});
    assert.equal(cast.document.state.npcs.npc_hw_linsui.hp,0);assert.equal(cast.document.state.npcs.npc_hw_linsui.status,'死亡');
    assert.equal(cast.result.damage,1);assert.equal(cast.document.state.player.mp,8);assert.equal(cast.document.state.npcs.npc_hw_linsui.trust,-10);
    assert.equal(cast.document.state.npcs.npc_hw_linsui.developments.at(-1).source,cast.id);
    await assert.rejects(run(cast.document,{spell:'spell_test_heal',target:'林穗'},'revive'),/已经死亡/);
    await assert.rejects(run(document,{spell:'spell_test_damage',target:'段岩'},'far'),/不在场/);
});
test('治疗需要实际同意，满血钳制，濒死自救生效且不复活死者',async()=>{
    const{document,run}=await setup();
    const before=structuredClone(document);
    await assert.rejects(run(document,{spell:'spell_test_heal',target:'林穗'},'none'),/本人同意/);assert.deepEqual(document,before);
    document.state.npcs.npc_hw_linsui.hp=10;document.state.npcs.npc_hw_linsui.maxHp=12;
    document.state.records.medical={category:'authorization',subject:'npc_hw_linsui',action:'healing',expires:document.state.minute+30};
    const cast=await successful(run,document,{spell:'spell_test_heal',target:'林穗',authorization:'medical'});
    assert.equal(cast.document.state.npcs.npc_hw_linsui.hp,12);assert.equal(cast.result.healed,2);
    document.state.player.hp=0;document.state.player.status='濒死';document.state.player.dyingSince=document.state.minute;
    const self=await successful(run,document,{spell:'spell_test_heal',target:'player'});
    assert.equal(self.document.state.player.hp,5);assert.equal(self.document.state.player.status,'正常');
    document.state.player.dyingSince=document.state.minute-9;
    const late=await run(document,{spell:'spell_test_heal',target:'player'},self.id);
    assert.equal(late.document.state.player.status,'死亡');assert.equal(late.document.state.player.mp,8);
    assert.equal(late.result.success,false);assert.match(late.result.effectFailed,/死亡/);
});
test('物品法术真实扣材料、修缮和去湿，单件与材质校验不允许凭空物品',async()=>{
    const{document,run}=await setup();document.state.inventory.item_staff.durability=95;
    const repaired=await successful(run,document,{spell:'spell_test_repair',target:'旧木杖'});
    assert.equal(repaired.document.state.inventory.item_staff.durability,100);assert.equal(repaired.result.repaired,5);assert.equal(repaired.document.state.inventory.item_iron.quantity,1);
    document.state.inventory.item_clothes.moisture=80;
    const dried=await successful(run,document,{spell:'spell_test_dry',target:'普通衣服'});
    assert.equal(dried.document.state.inventory.item_clothes.moisture,0);assert.equal(dried.result.dried,80);
    document.state.inventory.item_clothes.quantity=2;
    await assert.rejects(run(document,{spell:'spell_test_dry',target:'普通衣服'},'stack'),/单件/);
    await assert.rejects(run(document,{spell:'spell_test_dry',target:'行囊'},'bag'),/衣物/);
    delete document.state.inventory.item_iron;
    await assert.rejects(run(document,{spell:'spell_test_repair',target:'旧木杖'},'missing'),/缺少材料/);
});
test('施法结果可确定重放，失败有实际消耗，未接入的规则不能伪报成功',async()=>{
    const{world,engine,document,run}=await setup();
    const args={spell:'spell_test_damage',target:'林穗'},first=await run(document,args,'determinism'),second=await run(document,args,'determinism');
    assert.deepEqual(first,second);
    let failed=null;for(let i=0;i<100;i++){const row=await run(document,args,`failure_${i}`);if(!row.result.success){failed=row;break;}}
    assert.ok(failed);assert.equal(failed.document.state.player.mp,8);assert.equal(failed.document.state.minute,document.state.minute+1);
    assert.equal(failed.document.state.npcs.npc_hw_linsui.hp,document.state.npcs.npc_hw_linsui.hp);
    assert.ok(failed.document.state.skills.skill_test_damage.proficiency>10);
    world.spells.find(row=>row.id==='spell_test_damage').effectSpec.kind='free_city_destruction';
    const changed=new WorldEngine(world);
    await assert.rejects(changed.reduce(document,{tool:'world_cast',args,eventId:'unsupported'}),/尚未接入/);
    assert.equal(document.state.player.mp,10);
});
