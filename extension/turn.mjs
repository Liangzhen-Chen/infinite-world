// Domain lookup failures can be corrected; transport and storage failures propagate.
export function actionModes(value={}){
 return {intent:['off','match','propose'].includes(value.intent)?value.intent:'propose',
  narration:['off','async','sync'].includes(value.narration)?value.narration:'sync'};
}
export function modelToolAllowed(name,settings={}){
 const {intent}=actionModes(settings);
 const reads=['world_read','world_search','world_catalog','world_actions'];
 return intent==='propose'||reads.includes(name)||intent==='match'&&name==='world_act';
}

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
    if(result?.receipt)result={...result,narrationContract:actionNarrationContract(result)};
    if(!Number.isSafeInteger(startMinute)||!Number.isSafeInteger(minute)||minute<startMinute)return result;
    return{...result,turnClock:{startMinute,minute,elapsedMinutes:minute-startMinute}};
}

// Model-only wire projection. Saved receipts stay intact. JSON Pointer refs
// replace exact duplicates, so the evidence still has one complete copy of
// every value (including consent provenance and failed checks).
export function modelContextProjection(value){
 const internal=key=>/version$/i.test(key)||['protocol','revision','sequence','parentSequence','head','worldHash','beforeHash','afterHash','replay','replayMetadata','patches','randomState','idempotencyKey','signature','signatureKind'].includes(key);
 const clean=row=>{
  if(!row||typeof row!=='object')return row;
  if(Array.isArray(row))return row.map(clean);
  const entries=Object.entries(row).filter(([key,entry])=>!internal(key)&&!(key==='path'&&Array.isArray(entry)&&entry[0]==='state'&&Object.hasOwn(row,'before')&&Object.hasOwn(row,'after')));
  return Object.fromEntries(entries.map(([key,entry])=>{
   // Legacy is a copy of the public result, not another effect. Keep only
   // values with no identical top-level counterpart, including unique costs.
   if(key==='legacy'&&entry&&typeof entry==='object')entry=Object.fromEntries(Object.entries(entry).filter(([field,data])=>JSON.stringify(value?.[field])!==JSON.stringify(data)));
   return [key,clean(entry)];
  }));
 };
 const seen=new Map();
 const visit=(row,path)=>{
  if(!row||typeof row!=='object')return row;
  const text=JSON.stringify(row),prior=seen.get(text);
  if(text.length>=64){
   if(prior&&JSON.stringify({$ref:prior}).length<text.length)return {$ref:prior};
   seen.set(text,path);
  }
  return Array.isArray(row)?row.map((entry,index)=>visit(entry,`${path}/${index}`)):
   Object.fromEntries(Object.entries(row).map(([key,entry])=>[key,visit(entry,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`)]));
 };
 return visit(clean(value),'#');
}
export function modelToolResult(result){return modelContextProjection(result);}

export function actionCompletion(saved){
 const result=saved?.result??saved,receipt=result?.receipt;
 if(receipt?.status==='pending')return {ok:false,pending:true,error:'行动仍在等待裁决，尚未完成'};
 if(receipt&&receipt.status!=='committed')return {ok:false,error:receipt.reason??(receipt.status==='preview'?'预览尚未执行':'行动未完成')};
 return {ok:result?.ok!==false};
}

// This is a projection of a native receipt, never a proposal or executable plan.
// In particular, pending/preview effects must not become accomplished facts.
export function actionNarrationContract(result){
 const receipt=result?.receipt??result?.result?.receipt;
 if(!receipt)return null;
 const settled=receipt.status==='committed',applied=settled?receipt.applied??[]:[];
 return structuredClone({eventId:receipt.eventId,status:receipt.status,routed:receipt.routed??null,
  applied,must:settled?receipt.narrate?.must??[]:[],mustNot:receipt.narrate?.mustNot??[],
  check:receipt.check??null,trimmed:receipt.trimmed??[],consequences:settled?receipt.consequences??[]:[],
  alternatives:receipt.alternatives??[],fallback:receipt.fallback??null,reason:receipt.reason??null,
  instruction:settled?'只叙述实际 applied；must 必须保留，mustNot 不得写成发生。检定失败与裁剪不能补写成功。':'尚未完成：不得把提案、预览或等待裁决写成成功，不得补写物品、资金、移动或承诺。'});
}

// Speech generated after a wait does not itself authorize more elapsed time.
export function fullyTimedWait({playerText='',receipts=[],clock}={}){
    if(!clock||!Number.isSafeInteger(clock.minute)||!Number.isSafeInteger(clock.startMinute))return false;
    if(!/等(?:待)?|停留|待满|休息|睡|跳过/.test(playerText)||/(?<!不|别|勿|不要)(?:然后|之后|以后|过后|后|再)(?:(?!不|别|勿|不要)[^。！？；]){0,24}(?:问|交谈|聊天|聊聊|寒暄|说说)/.test(playerText))return false;
    return receipts.some(receipt=>{
        const result=receipt.result?.result??receipt.result??{},duration=result.elapsed??receipt.args?.minutes;
        return String(receipt.tool).replace(/^world_/,'')==='time'&&result.ok!==false&&Number.isSafeInteger(duration)&&duration>0&&clock.minute-clock.startMinute===duration;
    });
}

export function normalizeReplyProtocol(reply,{clock,playerText,receipts,outOfCharacter=false}={}){
    const parsed=parseTurn(reply,{...clock,outOfCharacter});
    if(outOfCharacter||!clock)return {text:reply,changed:false,originalTail:parsed};
    const args={...parsed.args};
    if(fullyTimedWait({clock,playerText,receipts}))args.extraMinutes=0;
    if(parsed.valid&&args.extraMinutes===parsed.args.extraMinutes)return {text:reply,changed:false,originalTail:parsed};
    const tail=`<回合 额外="${args.extraMinutes}分" 地点="${args.location}" 在场="${args.present.join(',')}"/>`;
    return {text:`${stripTurn(reply)}\n${tail}`,changed:true,originalTail:parsed,args};
}
