// Targeted regressions for observed contradictions. This is not a general
// semantic grader; the full narrative and NPC acceptance still need review.
export function inspectionClaimErrors(reply){
    const errors=[];
    if(/水泥/.test(reply))errors.push('出现现代水泥');
    const clauses=reply.split(/[。！？；\n]/);
    for(const clause of clauses){
        if(/(?:木料|木头|木楔).{0,30}(?:裂成两半|全废|崩掉|劈开)/.test(clause)&&!/(?:没有|并未|未曾|不会|不曾).{0,12}(?:裂成|全废|崩掉|劈开)/.test(clause))errors.push('纯检查描述实际毁物');
        if(/(?:手里的|你拿出|他拿出|握着|抓起).{0,12}(?:刀|凿)/.test(clause))errors.push('检查者虚构持有刀凿');
    }
    return errors;
}
export function manufacturingClaimErrors(reply,{feePaid,recovery,success}){
    const errors=[];
    if(feePaid>0&&/(?:费|铜).{0,12}(?:尚未结算|没有扣|不收|未扣|退还|退回)/s.test(reply))errors.push('否认已支付费用或声称退款');
    if(!success&&recovery===0)for(const clause of reply.split(/[。！？；\n]/)){
        if(/回收(?:下来|了|到)|收回了|留下了.{0,8}(?:木楔|刨屑)/.test(clause)&&!/(?:没有|没能|未能|无法|未).{0,6}(?:回收|收回)/.test(clause))errors.push('回收率0却声称回收产物');
    }
    return errors;
}

export function repairClaimErrors(reply,{maker}){
    const errors=[];
    if(maker===null)for(const clause of reply.split(/[。！？；\n]/)){
        if(/(?:你的|你留下的|你刻下的)(?:制作(?:者)?|工匠)?署名|(?:制作者|制造者|制作人)(?:是|仍是|还是)你/.test(clause)&&
            !/(?:没有|并未|不是|未有).{0,10}(?:署名|制作者|制造者|制作人)/.test(clause))errors.push('未知制作者被写成玩家署名');
    }
    return errors;
}

export function waterTransferClaimErrors(reply){
    const errors=[];
    for(const clause of reply.split(/[。！？；\n]/)){
        if(/(?:其余|剩余|余下|多余|水流|水).{0,25}(?:滞|留|积|停).{0,12}(?:沟中|沟内)/.test(clause)&&
            !/(?:没有|并未|未曾|不会|未另|不曾).{0,25}(?:滞|留|积|停|水)/.test(clause))errors.push('未转移的水被虚构留在沟内');
    }
    return errors;
}
