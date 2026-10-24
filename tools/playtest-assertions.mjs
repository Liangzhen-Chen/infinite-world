import {isDeepStrictEqual}from'node:util';
import {resolvePlaytestCall}from'./playtest-call.mjs';
import {builderToolCall}from'../extension/tools.mjs';
export const at=(object,path)=>String(path).split('.').reduce((value,key)=>value?.[key],object);
const matches=(row,where)=>Object.entries(where??{}).every(([key,value])=>isDeepStrictEqual(at(row,key),value));
export function evaluateAssertions(assertions,{before,after,calls,reply,scene,historyWindow,turnCalls={}}){
    return assertions.map(rule=>{
        let actual,pass=false;
        const value=at(after,rule.path),old=at(before,rule.path);
        switch(rule.kind){
            case'conditional':{
                const observed=at(before,rule.when.path);
                const condition=Object.hasOwn(rule.when,'equals')?isDeepStrictEqual(observed,rule.when.equals):observed!==undefined;
                const branch=condition?rule.then:rule.else;
                actual=evaluateAssertions(branch,{before,after,calls,reply,scene,historyWindow,turnCalls});pass=actual.length>0&&actual.every(row=>row.pass);break;
            }
            case'equals':actual=value;pass=isDeepStrictEqual(value,rule.value);break;
            case'oneOf':actual=value;pass=Array.isArray(rule.values)&&rule.values.some(candidate=>isDeepStrictEqual(value,candidate));break;
            case'quantity':actual=typeof value==='number'?value:value?.quantity??0;pass=actual===rule.value;break;
            case'exists':actual=value!==undefined;pass=actual===(rule.value??true);break;
            case'delta':actual=(value??0)-(old??0);pass=actual===(rule.value??0);break;
            case'range':actual=value;pass=Number.isFinite(value)&&value>=(rule.min??-Infinity)&&value<=(rule.max??Infinity);break;
            case'elapsed':actual=after.state.minute-before.state.minute;pass=actual>=rule.min&&actual<=rule.max;break;
            case'present':{
                actual=(rule.npcs??[]).map(npc=>{
                    const actor=after.state.npcs?.[npc];
                    return{npc,location:actor?.location,activity:actor?.activity,status:actor?.status,
                        available:Boolean(actor&&actor.location===after.state.location&&!actor.scheduleTravel&&!actor.cognitionTravel&&
                            !['死亡','濒死','昏迷','患病'].includes(actor.status)&&!/睡眠|熟睡|睡觉/.test(actor.activity??''))};
                });
                pass=actual.length>0&&actual.every(row=>row.available);break;
            }
            case'unchanged':actual=(rule.paths??['state']).filter(path=>!isDeepStrictEqual(at(before,path),at(after,path)));pass=!actual.length;break;
            case'records':actual=Object.values(value??{}).filter(row=>matches(row,rule.where)&&(!rule.includes||Array.isArray(at(row,rule.includes.path))&&at(row,rule.includes.path).some(entry=>matches(entry,rule.includes.where)))).length;pass=actual>=(rule.min??1)&&actual<=(rule.max??Infinity);break;
            case'newRecordsDuringTurn':{
                const from=before.state?.minute,to=after.state?.minute;
                const records=Object.entries(value??{}).filter(([id,row])=>!Object.hasOwn(old??{},id)&&matches(row,rule.where)&&
                    Number.isSafeInteger(row.minute)&&row.minute>from&&row.minute<=to&&(!rule.settled||
                        Number.isSafeInteger(row.start)&&row.start>=0&&row.start<row.minute&&
                        row.spent?.minutes===row.minute-row.start&&Number.isSafeInteger(row.spent?.fee)&&row.spent.fee>=0&&
                        Array.isArray(row.spent?.materials)&&typeof row.outcome?.success==='boolean')).map(([,row])=>structuredClone(row));
                actual={from,to,count:records.length,records};
                pass=Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&to>from&&records.length>=(rule.min??1)&&records.length<=(rule.max??Infinity);break;
            }
            case'calls':actual=calls.filter(call=>{
                let routed;try{routed=resolvePlaytestCall(call.tool,call.args);}catch{
                    const receipt=call.result?.receipt;
                    if(call.tool!=='world_act'||receipt?.status!=='rejected'||receipt.routed!==call.args?.action)return false;
                    routed=builderToolCall(call.args.action,call.args.slots);
                }
                const matched=call.tool===rule.tool?matches(call.args,rule.args):routed.tool===rule.tool&&matches(routed.args,rule.args);
                return matched&&(!rule.success||call.result?.ok===true);
            }).length;pass=actual>=(rule.min??1)&&actual<=(rule.max??Infinity);break;
            case'callReceipt':{
                const candidates=rule.anchor?turnCalls[rule.anchor]??[]:calls;
                const selected=candidates.filter(call=>{
                    if(call.tool===rule.tool)return matches(call.args,rule.args);
                    // A rejected submission is still a call. Do not require
                    // its invalid slots to pass execution-time translation.
                    const submitted=call.tool==='world_act'?builderToolCall(call.args?.action,call.args?.slots):call;
                    if(submitted.tool===rule.tool)return matches(submitted.args,rule.args);
                    let routed;try{routed=resolvePlaytestCall(call.tool,call.args);}catch{return false;}
                    return routed.tool===rule.tool&&matches(routed.args,rule.args);
                });
                actual=selected.map(call=>({receipt:call.result?.receipt,stateUnchanged:call.stateUnchanged}));
                pass=actual.length>=(rule.min??1)&&actual.every(({receipt,stateUnchanged})=>
                    receipt&&(rule.statuses??['committed','rejected']).includes(receipt.status)&&
                    (receipt.status!=='rejected'||typeof receipt.reason==='string'&&receipt.reason.trim().length>0&&
                        Array.isArray(receipt.alternatives)&&receipt.fallback&&typeof receipt.fallback==='object'&&
                        Array.isArray(receipt.applied)&&receipt.applied.length===0&&stateUnchanged===true));break;
            }
            case'conservation':actual=rule.paths.reduce((sum,path)=>sum+(at(after,path)??0)-(at(before,path)??0),0);pass=actual===0;break;
            case'replyContains':actual=rule.text;pass=reply.includes(rule.text)===(rule.value??true);break;
            case'replyMatches':actual=reply;pass=new RegExp(rule.pattern,'u').test(reply)===(rule.value??true);break;
            case'searchHit':{
                const searches=calls.filter(call=>call.tool==='world_search'&&call.args.query===rule.query);
                actual=searches.map(call=>({ok:call.result?.ok!==false,results:call.result?.results}));
                pass=actual.length>0&&actual.every(row=>row.ok&&Array.isArray(row.results)&&
                    row.results.some(hit=>hit.id===rule.id&&hit.text===rule.text)&&
                    row.results.every(hit=>!(rule.exclude??[]).some(text=>hit.text.includes(text))));break;
            }
            case'sceneContains':{
                actual=typeof scene==='string'?scene:undefined;
                if(actual!==undefined&&rule.section){
                    const header=`【${rule.section}】`,start=actual.indexOf(header);
                    actual=start<0?'':actual.slice(start+header.length).split(/【[^】]+】/)[0];
                }
                pass=actual!==undefined&&actual.includes(rule.text)===(rule.value??true);break;
            }
            case'historyTrimmed':actual=historyWindow?.removedAnchors;pass=Array.isArray(actual)&&actual.includes(rule.anchor);break;
            default:throw new Error(`未知试玩断言 ${rule.kind}`);
        }
        return{...rule,pass,actual};
    });
}
