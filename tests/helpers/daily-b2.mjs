// 日常题集第二批（DAILY 卡）的共用夹具：把题面的场景数值落到一份世界副本上，再经界面动作脚本（world_act）结算。
// 做法：世界数据（物价、路线、传闻种子等）在副本里改成题面给定的数值；玩家与人物的状态用 mutate 写入开局存档；
// 断言的预期值全部来自题面（或 balance 参数表的缺省行），引擎自己的数值不当预期。不调用模型。
import {createHash} from 'node:crypto';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {legacyTotal,flowDelta,reconcile} from './ledger-audit.mjs';
import assert from 'node:assert/strict';
import {skipTo} from '../fixtures/skip-clock.mjs';

export const DAY=1440;
export const baseWorld=await loadWorld();
export const baseEngine=new WorldEngine(baseWorld);
export const SEED='daily-b2-seed';

// 世界副本：patch(world) 就地修改副本。
export function variant(patch=()=>{}){const world=structuredClone(baseWorld);patch(world);return world;}
export const item=(world,id)=>world.items.find(row=>row.id===id);
export const setPrice=(world,id,price)=>{item(world,id).basePrice=price;};

// 月日换算：引擎历法 12 月 × 30 日，分钟数从 0 起算。monthDayMinute(4,6,9,0) = 四月初六 09:00（第一年）。
export const monthDayMinute=(month,day,hour=0,minute=0)=>((month-1)*30+day-1)*DAY+hour*60+minute;

// 开局存档直接跳到题面日期：日结类记录（农事 lastDay、势力时钟）也同步到该日，否则第一次跨零点会报“日结顺序不连续”。
export const scene=(location,minute,extra=()=>{})=>(state,doc)=>{
 doc.randomSeed=SEED;state.location=location;
 for(const row of Object.values(state.records??{}))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(minute/DAY)-1;
 skipTo(baseEngine,doc,minute);
 extra(state,doc);
};
export const stack=(quantity,over={})=>({quantity,quality:'木',durability:100,weight:0.1,...over});
export const tool=(quality='木')=>({quantity:1,quality,durability:100,weight:0.2});

// 检定骰点：与 checks.mjs 的 die() 同公式。挑一个不出大失败（1）的事件编号，让制作类题目结果确定。
export function dieOf(seed,eventId,label='d20'){return createHash('sha256').update(`${seed}:${eventId}:${label}`).digest().readUInt32LE(0)%20+1;}
export function safeEventId(prefix,seed=SEED){for(let i=0;i<200;i++){const id=`${prefix}-${i}`;if(dieOf(seed,id)!==1&&dieOf(seed,id)!==2)return id;}throw Error('找不到安全事件编号');}

// 铜钱守恒：差额只来自登记的源汇；旧字段与账本一致。
export function conserved(before,after,label,engine=baseEngine){
 const flows=before.ledger?flowDelta(before,after):{sources:0,sinks:0};
 assert.equal(legacyTotal(engine,after.state)-legacyTotal(engine,before.state),flows.sources-flows.sinks,`${label}：铜钱守恒（差额只来自登记的源汇）`);
 assert.deepEqual(reconcile(engine,after).mismatches,[],`${label}：旧字段与账本一致`);
}
// 先做一次无害观察，让账本打开后再取“之前”快照（与 A1 同法）。
export async function primed(ui){await ui.choose('time',{minutes:1});return ui.read();}
export const held=(inventory,id)=>{const v=inventory?.[id];return typeof v==='number'?v:v?.quantity??0;};

// 没有界面动作的旧工具（寄信、托运、求医）：与界面动作同一条 /execute 通道，直接给旧工具参数。
export async function legacy(ui,tool,args,eventId){
 const view=await ui.server.api('read',{campaignId:ui.campaignId});
 return ui.server.api('execute',{campaignId:ui.campaignId,tool,args,eventId,anchor:null,expectedSequence:view.reference.sequence});
}

// 世界副本里改某人的作息：start 之前睡眠，start–end 在 location 营业（可交易），其后睡眠。分钟自零点起算。
export function openShop(world,npcId,location,start,end,activity='营业'){
 const npc=world.npcs.find(n=>n.id===npcId);
 npc.schedule={default:[{start:0,end:start,location,activity:'睡眠',services:[]},{start,end,location,activity,services:['trade']},{start:end,end:1440,location,activity:'睡眠',services:[]}]};
}
