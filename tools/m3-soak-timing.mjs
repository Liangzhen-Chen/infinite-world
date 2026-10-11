import {isOutOfCharacter} from '../extension/prompt.mjs';

const numerals={一:1,两:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,半:.5};
// Deliberately a small, whole-input grammar. Compound plans, conditions and
// unrecognized wording stay unknown rather than being guessed from a receipt.
export function explicitSoakTiming(input,startMinute){
 const text=String(input??'').trim();
 if(isOutOfCharacter(text))return{basis:'player-out-of-character',quote:text,range:[0,0]};
 const duration=/^(?:我)?(?:在这里|在此地|在原地)?(?:原地)?(?:等待|等|休息|停留|睡)(?:整整|整)?(\d+|一|两|二|三|四|五|六|七|八|九|十|半)(分钟|小时|天)(?:[，,](?:不做其他事情|不做其他事))?[。.!！]?$/.exec(text);
 if(duration){
  const amount=numerals[duration[1]]??Number(duration[1]),minutes=amount*{分钟:1,小时:60,天:1440}[duration[2]];
  if(Number.isSafeInteger(minutes)&&minutes>=0)return{basis:'player-explicit-duration',quote:text,range:[minutes,minutes]};
 }
 const until=/^(?:我)?(?:原地)?(?:等待|等)到今天(\d{1,2}):(\d{2})[。.!！]?$/.exec(text);
 if(until&&Number.isSafeInteger(startMinute)&&Number(until[1])<24&&Number(until[2])<60){
  const minutes=Math.floor(startMinute/1440)*1440+Number(until[1])*60+Number(until[2])-startMinute;
  if(minutes>=0)return{basis:'player-explicit-deadline',quote:text,range:[minutes,minutes]};
 }
 const greeting=/^(?:你好|早上好|晚上好|谢谢)[。.!！]?$/.test(text)||/^(?:我)?(?:向|对)[^，。！？：:]{1,30}(?:问好|打招呼)[。.!！]?$/.test(text);
 const quotedQuestion=/^(?:我)?问[^，。！？：:]{1,30}[：:]“[^”]+”[。.]?$/.test(text);
 if(greeting||quotedQuestion)return{basis:'constitution-dialogue-range',quote:text,rule:'prompt/constitution.md:17',range:[5,20]};
 return null;
}

export function assessSoakTiming(replay,{input}={}){
 let intent=explicitSoakTiming(input,replay.startMinute);const elapsed=replay.elapsedMinutes;
 if(intent?.basis==='constitution-dialogue-range'&&replay.actionCount>0)intent=null;
 const valid=Number.isFinite(elapsed)&&elapsed>=0;
 const receipts=replay.receipts??[],measured=receipts.filter(r=>Number.isFinite(r.declaredMinutes)&&r.declaredMinutes>=0);
 const receiptExpected=measured.reduce((n,r)=>n+r.declaredMinutes,0),receiptDifference=measured.reduce((n,r)=>n+Math.abs(r.elapsedMinutes-r.declaredMinutes),0);
 const receiptComplete=receipts.length>0&&measured.length===receipts.length;
 const receiptDeviation=measured.length?(receiptExpected?receiptDifference/receiptExpected:receiptDifference===0?0:null):null;
 const receiptTiming={scope:'completed-tool-actions-only; does not establish player-intent coverage',status:receiptComplete?'measured':'unknown',covered:measured.length,total:receipts.length,
  expectedMinutes:measured.length?receiptExpected:null,deviation:receiptComplete?receiptDeviation:null,knownDeviation:receiptDeviation,evidence:receipts};
 const base={version:2,source:'semantic-action-rules',elapsedMinutes:elapsed,receiptTiming,replay};
 if(!intent||!valid)return{...base,status:'unknown',covered:false,basis:null,reason:!valid?'缺少实际经过时间':'玩家输入不在可核验的单一行动语法内；回执不能替代玩家原始耗时要求',expectedMinutes:null,expectedRange:null,deviation:null};
 const [lower,upper]=intent.range,difference=Math.max(lower-elapsed,0,elapsed-upper),reference=elapsed>upper?upper:lower;
 return {...base,status:lower===upper?'measured':'bounded',covered:true,basis:intent.basis,evidence:intent,
  expectedMinutes:lower===upper?lower:null,expectedRange:[lower,upper],withinExpectedRange:difference===0,
  deviationMinutes:difference,referenceMinutes:reference,deviation:reference?difference/reference:difference===0?0:null};
}

export function summarizeSoakTiming(clocks){
 const measured=clocks.filter(t=>t?.version===2&&t.source==='semantic-action-rules'&&t.covered===true&&['measured','bounded'].includes(t.status)&&
  Number.isFinite(t.deviationMinutes)&&t.deviationMinutes>=0&&Number.isFinite(t.referenceMinutes)&&t.referenceMinutes>=0);
 const reference=measured.reduce((n,t)=>n+t.referenceMinutes,0),difference=measured.reduce((n,t)=>n+t.deviationMinutes,0);
 const knownDeviation=measured.length?(reference?difference/reference:difference===0?0:null):null,complete=clocks.length>0&&measured.length===clocks.length;
 return {status:complete?'measured':'unknown',covered:measured.length,total:clocks.length,coverage:clocks.length?measured.length/clocks.length:null,
  deviation:complete?knownDeviation:null,knownDeviation,unknown:clocks.flatMap((t,i)=>measured.includes(t)?[]:[{index:i,reason:t?.reason??'旧计时证据仅能证明重放或未提供独立语义来源'}]),
  deviationMinutes:difference,referenceMinutes:reference,
  metric:'相对明确期望或允许区间的绝对偏差；区间外取最近边界为分母，区间内取下界。已知子集不代表全体。',
  pass:complete&&(difference===0||reference>0&&knownDeviation<=.1)};
}
