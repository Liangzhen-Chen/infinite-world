import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {recordFixture} from './replay.mjs';
import {reviewResponse} from '../tests/helpers/consistency-response.mjs';

// AI-21 录制工具：用确定性的可注入模型客户端走真实调用路径（一致性审查与改写，服务端旁路写盘），
// 录一次 T2 会话，产出可入库的夹具。只写到命令行给定的输出目录。
//   node tools/replay-record.mjs <输出目录> [--only full|short] [--model <模型 id>]
// 输出：<输出目录>/full/（30 日）与 <输出目录>/short/（审查、购买、审查回复、推进 1 日），各含
//   manifest.json（commit 出处、contentHash、model、seed、steps、ruleStateDigest 期望值、textDigest）、
//   sideband/<turn>-<seq>.json、trace.jsonl。入库位置约定为 tools/replay-fixtures/。
// 客户端按请求体生成响应（审查据请求里的分段给出分类，改写返回固定正文），同一请求恒得同一响应，所以夹具可复录。
// 这是确定性客户端录出的夹具，model 如实标为 replay-record-stub，不冒充真实模型。
export const FULL_DAYS=30,SHORT_DAYS=1;
export const stepsFor=days=>[
 {endpoint:'review/begin',body:{anchor:'replay-bread',playerText:'买一个面包'}},
 {endpoint:'execute',body:{tool:'world_act',args:{action:'core:trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},eventId:'replay-buy',anchor:'replay-bread'}},
 {endpoint:'review/reply',body:{draft:'<q who="player">我全都答应。</q>',query:'买一个面包'}},
 ...Array.from({length:days},(_,d)=>({endpoint:'execute',body:{tool:'world_time',args:{minutes:1440},eventId:`replay-day-${d}`,anchor:`replay-day-${d}`}}))
];
export const stubClient=()=>({async generate(body,label){
 if(label.startsWith('consistency-rewrite:'))return {choices:[{finish_reason:'stop',message:{content:'<q who="player">我全都答应。</q>'}}]};
 return reviewResponse(body);
}});
export const FIXTURES=Object.freeze({full:FULL_DAYS,short:SHORT_DAYS});

export async function recordAll(outDir,{only=null,model='replay-record-stub'}={}){
 if(only!==null&&!Object.hasOwn(FIXTURES,only))throw Error(`--only 只能是 ${Object.keys(FIXTURES).join(' 或 ')}`);
 const done={};
 for(const [name,days] of Object.entries(FIXTURES)){
  if(only&&only!==name)continue;
  done[name]=await recordFixture({dir:path.join(outDir,name),client:stubClient(),steps:stepsFor(days),model});
 }
 return done;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [outDir,...rest]=process.argv.slice(2),opt={};
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||i+1>=rest.length)throw Error(`参数错误: ${rest[i]}`);opt[rest[i].slice(2)]=rest[i+1];}
 if(!outDir)throw Error('用法: node tools/replay-record.mjs <输出目录> [--only full|short] [--model <模型 id>]');
 await fs.mkdir(outDir,{recursive:true});
 const done=await recordAll(outDir,{only:opt.only??null,...(opt.model?{model:opt.model}:{})});
 console.log(JSON.stringify(Object.fromEntries(Object.entries(done).map(([name,m])=>[name,{contentHash:m.contentHash,ruleStateDigest:m.ruleStateDigest}]))));
}
