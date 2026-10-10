export function parseExamples(text){
    return text.split('<START>').filter(part=>part.trim()).flatMap(part=>{
        const match=/\{\{user\}\}:\s*([\s\S]*?)\n\{\{char\}\}:\s*([\s\S]*)/.exec(part.trim());
        if(!match)throw new Error('对话示例格式不完整');
        return[{role:'user',content:match[1].trim()},{role:'assistant',content:match[2].trim()}];
    });
}
export function staticMessages(bundle){
    return[{role:'system',content:bundle.constitution},{role:'system',content:bundle.card.data.description},
        {role:'system',content:bundle.style},{role:'system',content:bundle.card.data.personality},
        {role:'system',content:bundle.card.data.scenario},...parseExamples(bundle.card.data.mes_example)];
}
export function assembleMessages(bundle,history,scene){
    return[...staticMessages(bundle),...history.map(message=>({...message})),{role:'system',content:scene}];
}
export const isOutOfCharacter=text=>/^[（(]场外[）)]/.test(String(text).trim());
