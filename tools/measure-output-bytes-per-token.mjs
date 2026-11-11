// 只读：从仓库已有的调用证据（world/drafts/**/budget-responses/*.json）统计“返回内容 UTF-8 字节 / 输出 token”。
// 取法：字节 = message.content + 全部 tool_calls[].function.arguments 的 UTF-8 字节；token = usage.completion_tokens。
// 排除：没有 completion_tokens 的记录；带非空 reasoning_content 的记录（completion_tokens 含推理 token 而字节不含，会把比值压低）；
// 输出字节为 0 的记录。usage.jsonl 只有 token 数、没有返回内容，不能用。
// 用法：node tools/measure-output-bytes-per-token.mjs   （输出 JSON；content-pipeline.mjs 的 MAX_UTF8_BYTES_PER_OUTPUT_TOKEN 取其 max 向上取整）
import fs from 'node:fs';
import path from 'node:path';
export function measure(root='world/drafts'){
  const ratios=[],draftRatios=[];let scanned=0,skipped={noTokens:0,reasoning:0,empty:0};
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);
    if(e.isDirectory()){walk(p);continue;}
    if(!e.name.endsWith('.json')||path.basename(dir)!=='budget-responses')continue;
    let ev;try{ev=JSON.parse(fs.readFileSync(p,'utf8'));}catch{continue;}
    scanned++;const msg=ev.response?.choices?.[0]?.message,tokens=ev.response?.usage?.completion_tokens;
    if(!Number.isFinite(tokens)||tokens<=0){skipped.noTokens++;continue;}
    if(msg?.reasoning_content){skipped.reasoning++;continue;}
    const bytes=Buffer.byteLength(msg?.content??'')+(msg?.tool_calls??[]).reduce((n,c)=>n+Buffer.byteLength(c.function?.arguments??''),0);
    if(!bytes){skipped.empty++;continue;}
    const r=bytes/tokens;ratios.push(r);if(!String(ev.label).includes('-review'))draftRatios.push(r);
  }};
  walk(root);
  const stat=a=>{const s=[...a].sort((x,y)=>x-y);return{samples:s.length,max:s.at(-1)??null,p99:s[Math.floor(s.length*.99)]??null,median:s[s.length>>1]??null};};
  return{scanned,skipped,all:stat(ratios),draftOnly:stat(draftRatios)};
}
if(process.argv[1]?.replaceAll(String.fromCharCode(92),'/').endsWith('/measure-output-bytes-per-token.mjs'))console.log(JSON.stringify(measure(process.argv[2]),null,1));
