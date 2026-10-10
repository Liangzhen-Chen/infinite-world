export const defaultGeneration=Object.freeze({model:'deepseek-flash',temperature:0.8,thinking:true,reasoningEffort:'low',
    maxOutputTokens:1800,maxContextTokens:65536,toolRecursionLimit:8});
export function generationSettings(overrides={}){
    if(Object.keys(overrides).some(key=>!Object.hasOwn(defaultGeneration,key)))throw new Error('未知生成设置');
    const value={...defaultGeneration,...overrides};
    if(value.model!=='deepseek-flash'||![0.6,0.8,1].includes(value.temperature)||typeof value.thinking!=='boolean'||value.reasoningEffort!=='low'
        ||value.maxOutputTokens!==1800||value.maxContextTokens!==65536||!Number.isInteger(value.toolRecursionLimit)||value.toolRecursionLimit<1||value.toolRecursionLimit>8)throw new Error('生成设置超出本轮对照范围');
    return value;
}
export function generationRequest(settings){
    const value=generationSettings(settings);
    return{model:value.model,temperature:value.temperature,max_tokens:value.maxOutputTokens,stream:false,
        thinking:{type:value.thinking?'enabled':'disabled'},...(value.thinking?{reasoning_effort:value.reasoningEffort}:{})};
}
export function generationPreset(settings){
    const value=generationSettings(settings);
    return{chat_completion_source:'deepseek',deepseek_model:value.model,temp_openai:value.temperature,
        openai_max_context:value.maxContextTokens,openai_max_tokens:value.maxOutputTokens,stream_openai:false,function_calling:true,
        tool_call_recurse_limit:value.toolRecursionLimit,tool_reasoning_mode:'disabled',show_thoughts:value.thinking,reasoning_effort:value.reasoningEffort};
}
