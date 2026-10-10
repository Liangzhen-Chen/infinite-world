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
