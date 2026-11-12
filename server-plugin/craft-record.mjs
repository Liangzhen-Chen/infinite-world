// 制造记录的唯一入口：守恒对凭据（stock.mjs recordCraftLedger）加按（聚落，物品）的滚动耗料累计。
// 所有制造写入方（works、manufacturing、wildlife-society、finance-assets、npc-autonomy、agriculture）都从这里 import recordCraft，不各自累计。
// 本文件依赖 stock.mjs 与 supply-interval.mjs（→ entity-view）；stock.mjs 不依赖本文件，所以没有导入环。
import {recordCraftLedger} from './stock.mjs';
import {craftUseWindowDays} from './supply-interval.mjs';

// 行为人 actor（可空：野生社会的群体没有单个行为人时按所属群体/空）与发生地聚落 place 由各调用方传入；place 非空时耗料同时记入按（聚落，物品）的滚动日桶（accrueCraftUse）。
// place 只给"投入被实际消耗"的工序；转移、捐赠、存取这类不改变物料总量的记录不传 place（只留守恒对凭据）。
export function recordCraft(d,{engine,actor=null,place=null,recipe,batches=1,inputs={},outputs={},failure=null,writer,eventId=null}){
    // 不变量兜底：带 place 的记录是"投入被消耗"的工序；产物与投入同物同量是转移，不得计入耗料，抛错。
    // 产物为空（投入被消耗、产出的是非物品成果，如撰写、抄录、勘绘的文书）照常计入。
    // 失败的工序（failure 非空）可以全额回收（产物 = 投入），照常按净耗料记账，不受此限。
    if(recipe&&place&&!failure){
        const made=Object.entries(outputs).filter(([,n])=>n>0),sameAsInputs=made.length>0&&made.length===Object.keys(inputs).length&&made.every(([item,n])=>inputs[item]===n);
        if(sameAsInputs)throw Error(`转移不得计入耗料：${recipe} 带 place 但产物与投入同物同量（转移、捐赠、存取不传 place）`);
    }
    if(recipe&&place)accrueCraftUse(d,engine,place,inputs,outputs,failure);
    recordCraftLedger(d,{actor,place,recipe,batches,inputs,outputs,failure,writer,eventId});
}
// 滚动耗料累计：state.records['craft-use:<聚落>'] = {days:{<日>:{<物品>:耗用量}}}，按日分桶；窗口 = 最长补给间隔天数（craftUseWindowDays，由补给间隔的上限推出，不新增常数），
// 写入时丢掉窗口外的日桶，所以每个聚落至多 窗口天数 个桶。耗用量按投入计；失败时回收的同一种料（outputs 里的同名物品）不算耗用。
function accrueCraftUse(d,engine,place,inputs,outputs,failure){
    const day=Math.floor((d.get('state','minute')??0)/1440),key=`craft-use:${place}`,old=d.get('state','records',key),keep=craftUseWindowDays(engine,d.get('state'),d.get('randomSeed'),Object.keys(d.get('state','settlements')??{}));
    const days={};for(const [k,v] of Object.entries(old?.days??{}))if(Number(k)>day-keep)days[k]=v;
    const row={...(days[day]??{})};
    for(const [item,amount] of Object.entries(inputs)){const net=amount-(failure?Math.min(amount,outputs[item]??0):0);if(net>0)row[item]=(row[item]??0)+net;}
    days[day]=row;
    d.set(['state','records',key],{category:'craft_use',place,days});
}
