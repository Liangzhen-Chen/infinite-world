// Domain lookup failures can be corrected; transport and storage failures propagate.
export async function lookupToolResult(action){
    try{return await action();}
    catch(error){
        if(/有歧义|未登记|公开规则目录|目录列表需指定|环境对象不在当前位置/.test(error.message))return{ok:false,lookupRejected:true,error:error.message};
        throw error;
    }
}
export function stripTurn(reply){return String(reply).replace(/<回合(?=[\s/>])[^>]*\/?\s*>/g,'').trimEnd();}
export function parseTurn(reply,{location,startMinute,minute=startMinute,present=null,outOfCharacter=false}={}){
    const matches=[...reply.matchAll(/<回合\s+([^>]*?)\s*\/>/g)],visible=stripTurn(reply);
    if(outOfCharacter)return{valid:matches.length===0,warning:matches.length?'场外回复包含尾注':null,args:{outOfCharacter:true},visible};
    const fallback={startMinute,extraMinutes:minute>startMinute?0:10,location,present:[]};
    const invalid=warning=>({valid:false,warning,args:fallback,visible});
    if(matches.length!==1)return invalid('回合尾注缺失或重复');
    const pairs=[...matches[0][1].matchAll(/([\u4e00-\u9fffa-zA-Z]+)="([^"]*)"/g)];
    const attributes=Object.fromEntries(pairs.map(m=>[m[1],m[2]]));
    if(new Set(pairs.map(m=>m[1])).size!==pairs.length||Object.keys(attributes).some(key=>!['额外','地点','在场'].includes(key)))return invalid('回合尾注属性非法');
    const duration=/^(\d{1,5})分$/.exec(attributes.额外??''),extraMinutes=duration?Number(duration[1]):NaN;
    if(!Number.isSafeInteger(extraMinutes)||extraMinutes>43200||!attributes.地点)return invalid('额外时长或地点缺失');
    const claimed=(attributes.在场??'').split(',').map(value=>value.trim()).filter(Boolean);
    const actual=present?claimed.filter(id=>present.includes(id)):claimed;
    const warnings=[];
    if(attributes.地点!==location)warnings.push('尾注地点与账本不一致，保留账本地点');
    if(actual.length!==claimed.length)warnings.push('尾注在场名单与账本不一致，移除未在场者');
    return{valid:warnings.length===0,warning:warnings.join('；')||null,args:{startMinute,extraMinutes,location,present:actual},visible};
}
export function toolResultWithClock(result,{startMinute,minute}={}){
    if(!Number.isSafeInteger(startMinute)||!Number.isSafeInteger(minute)||minute<startMinute)return result;
    return{...result,turnClock:{startMinute,minute,elapsedMinutes:minute-startMinute}};
}
