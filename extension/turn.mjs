// Domain lookup errors are useful feedback. Storage/transport faults still propagate.
export async function lookupToolResult(action){
    try{return await action();}
    catch(error){
        if(/有歧义|未登记|公开规则目录|目录列表需指定|环境对象不在当前位置/.test(error.message))return{ok:false,lookupRejected:true,error:error.message};
        throw error;
    }
}

export function parseTurn(reply,{location,startMinute,outOfCharacter=false}={}) {
    if(outOfCharacter)return {valid:true,args:{outOfCharacter:true},visible:reply};
    const matches=[...reply.matchAll(/<回合\s+([^>]*?)\s*\/>/g)];
    const fallback={startMinute,minutes:10,location,present:[]};
    if(matches.length!==1)return {valid:false,warning:'回合尾注缺失或重复，普通对话按10分钟处理',args:fallback,visible:reply.replace(/<回合[^>]*>/g,'')};
    const attributes=Object.fromEntries([...matches[0][1].matchAll(/([\u4e00-\u9fffa-zA-Z]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    const duration=/^(\d{1,5})分$/.exec(attributes.时长??'');
    const minutes=duration?Number(duration[1]):NaN;
    if(!Number.isSafeInteger(minutes)||minutes<0||minutes>43200||!attributes.地点)return {valid:false,warning:'回合尾注非法，普通对话按10分钟处理',args:fallback,visible:reply.replace(matches[0][0],'')};
    return {valid:true,args:{startMinute,minutes,location:attributes.地点,present:attributes.在场?attributes.在场.split(',').filter(Boolean):[]},visible:reply.replace(matches[0][0],'')};
}

export function toolResultWithClock(result,{startMinute,minute}={}){
    if(!Number.isSafeInteger(startMinute)||!Number.isSafeInteger(minute)||minute<startMinute)return result;
    const elapsedMinutes=minute-startMinute;
    return{...result,turnClock:{startMinute,minute,elapsedMinutes,
        tailRule:elapsedMinutes>0?`本回合工具已推进${elapsedMinutes}分钟，包含操作过程中的对白。没有额外独立动作时尾注时长写${elapsedMinutes}分；不能再加默认10分。`
            :result.actionScope?.clockManaged?`本次交锋耗${result.actionScope.seconds}秒，秒钟已由引擎累计，尚未满一分钟；只有本次交锋时尾注写0分，不再额外加入10分钟。`
            :result.actionScope?.instantaneous?'本次工具明确为即时操作；只有该操作而无其他独立动作时尾注时长写0分，不另加默认10分。普通交谈仍按实际耗时结算。':'本回合工具尚未推进时间，普通对话按实际耗时结算。'}};
}
