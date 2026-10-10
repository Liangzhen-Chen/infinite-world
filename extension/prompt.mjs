export function parseExamples(text){
    return text.split('<START>').filter(part=>part.trim()).flatMap(part=>{
        const match=/\{\{user\}\}:\s*([\s\S]*?)\n\{\{char\}\}:\s*([\s\S]*)/.exec(part.trim());
        if(!match)throw new Error('对话示例格式不完整');
        return[{role:'user',content:match[1].trim()},{role:'assistant',content:match[2].trim()}];
    });
}
export function promptSections(bundle){
    return [
        {identifier:'main',name:'Main Prompt',content:bundle.constitution},
        {identifier:'charDescription',name:'World Primer',marker:true,content:bundle.card.data.description},
        {identifier:'fields-style',name:'Narrative Style',content:bundle.style},
        {identifier:'charPersonality',name:'Character Personality',marker:true,content:bundle.card.data.personality},
        {identifier:'scenario',name:'Scenario',marker:true,content:bundle.card.data.scenario},
        {identifier:'dialogueExamples',name:'Dialogue Examples',marker:true,content:bundle.card.data.mes_example},
    ];
}
export function staticMessages(bundle){
    return promptSections(bundle).flatMap(section=>section.identifier==='dialogueExamples'?parseExamples(section.content).map(message=>({role:'system',name:message.role==='user'?'example_user':'example_assistant',content:message.content})):[{role:'system',content:section.content}]);
}
export function injectToolExamples(messages,card){
    const examples=card?.data?.extensions?.fields_tool_examples??card?.extensions?.fields_tool_examples;
    if(!Array.isArray(examples)||!examples.length)return messages;
    const callIds=new Set(examples.flatMap(message=>(message.tool_calls??[]).map(call=>call.id)));
    if(messages.some(message=>message.tool_calls?.some(call=>callIds.has(call.id))))return messages;
    const lastExample=messages.findLastIndex(message=>['example_user','example_assistant'].includes(message.name));
    // Native host examples have system roles and names. If truncated, keep the
    // demonstration after leading static systems and before live conversation.
    const firstHistory=messages.findIndex(message=>message.role!=='system');
    const index=lastExample>=0?lastExample+1:firstHistory>=0?firstHistory:messages.length;
    messages.splice(index,0,...structuredClone(examples));
    return messages;
}
export function assembleMessages(bundle,history,scene){
    return injectToolExamples([...staticMessages(bundle),...history.map(message=>({...message})),{role:'system',content:scene}],bundle.card);
}
export const isOutOfCharacter=text=>/^[（(]场外[）)]/.test(String(text).trim());
