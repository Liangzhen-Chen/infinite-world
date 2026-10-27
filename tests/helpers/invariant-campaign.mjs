// 不变量性质测试的共用夹具：真实世界 + 真实工具动作（world_trade / world_move / world_time），不为测试加产品接口。
// 世界前提与 tests/ledger-reconcile.test.mjs 的 campaign() 相同（三位对手方全天在岗）。
import fs from 'node:fs/promises';
import fc from 'fast-check';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';

export const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
export const DAY=1440,inn='bld_hw_qingdeng',post='bld_hw_post';
export const host='npc_hw_linsui',clerk='npc_hw_shendu',worker='npc_hw_ayan';

export function campaign(name){
    const w=structuredClone(world),placeOf={[host]:inn,[worker]:inn,[clerk]:post};
    for(const npc of w.npcs.filter(n=>placeOf[n.id]))npc.schedule={default:[{start:0,end:1440,location:placeOf[npc.id],activity:'营业',services:npc.id===host?['trade']:[]}]};
    const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},name);
    doc.state.minute=600;doc.state.location=inn;doc.state.player.coins=600;
    for(const [id,location] of [[host,inn],[worker,inn],[clerk,post]])Object.assign(doc.state.npcs[id],{location,activity:'营业',status:'正常'});
    doc.state.npcs[host].inventory.item_ration=40;
    return {engine,doc};
}
// 合法动作调色板：每项是 {tool,args}。是否被世界接受由引擎裁决（拒绝的动作不改变存档，也不算违例）。
export const actionArb=fc.oneof(
    fc.record({tool:fc.constant('world_trade'),args:fc.record({seller:fc.constant(host),item:fc.constantFrom('item_bread','item_ration'),quantity:fc.integer({min:1,max:40})})}),
    fc.record({tool:fc.constant('world_trade'),args:fc.record({operation:fc.constant('work'),seller:fc.constant(worker),consent:fc.constant(true),minutes:fc.integer({min:60,max:480})})}),
    fc.record({tool:fc.constant('world_trade'),args:fc.record({operation:fc.constantFrom('deposit','withdraw'),seller:fc.constant(clerk),coins:fc.integer({min:1,max:900})})}),
    fc.record({tool:fc.constant('world_move'),args:fc.record({destination:fc.constantFrom(inn,post)})}),
    fc.record({tool:fc.constant('world_time'),args:fc.record({minutes:fc.integer({min:30,max:2*DAY})})}),
);
// 执行一步：返回 {before,after,out}；被引擎拒绝（抛错）时返回 null，存档不变。
export async function stepAction(c,action,eventId){
    const before=c.doc;let out;
    try{out=await c.engine.reduce(before,{tool:action.tool,args:action.args,eventId});}catch{return null;}
    const after=applyPatches(before,out.patches);c.doc=after;
    return {before,after,out};
}
// 第一次真实买卖会开账（开局存档没有 ledger 分区）；性质测试从开账之后的存档起算。
export async function openedCampaign(name){
    const c=campaign(name);
    const first=await stepAction(c,{tool:'world_trade',args:{seller:host,item:'item_bread',quantity:1}},`${name}-open`);
    if(!first?.after.ledger)throw Error('前提失败：第一笔真实买卖应开账');
    return c;
}
