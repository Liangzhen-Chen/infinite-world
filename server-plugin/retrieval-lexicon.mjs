import {preconditionFailure} from './precondition.mjs';
// Domain vocabulary for the existing Chinese BM25 tokenizer. Entity identity
// remains the resolver's job; occupational titles are never global name swaps.
export const RETRIEVAL_SYNONYMS=Object.freeze([
 ['账簿','账本','帐本','帐簿'],['厨房','灶台','炉灶','灶房'],['承诺','答应','约定','应允'],
 ['允许','准许','许可','获准','借用'],['寻找','找回','寻回','失物','遗失'],
 ['酒馆','客栈'],['住宿','住店','住一晚','房钱'],['食物','食品','吃食','饭食'],
 ['购买','买过','买的','购得'],['出售','卖出','卖过'],['支付','付钱','付款','花费'],
 ['欠款','赊账','欠钱','债务'],['偿还','还钱','还款','结清'],['逾期','过期','超期'],
 ['传闻','听说','转述','传话'],['目击','看见','见到','亲眼'],['拜师','授课','教导','学习'],
 ['配方','制法','做法'],['制造','制作','打造','制成'],['维修','修理','修整'],
 ['田地','农田','耕地'],['播种','种下','下种'],['收获','收成','采收'],
 ['会面','见面','碰面'],['等候','等待','候着'],['报酬','酬劳','工钱'],
 ['治疗','疗伤','治伤'],['出发','启程','动身'],['抵达','到达','到过'],
].map(row=>Object.freeze(row)));
export const RETRIEVAL_DICTIONARY=Object.freeze([...new Set(RETRIEVAL_SYNONYMS.flat())]);

const technicalQuery=/事件编号|提示词|系统指令|工具调用|工具结果|主持人|裁定|模型/g;
const injected=/以账本为准|忽略(?:上面|以上|之前|先前|所有).{0,8}(?:指令|规则|提示)|(?:系统|开发者)(?:消息|指令|提示)|(?:工具调用|工具结果|事件编号|提示词|主持人|模型输出)|\b(?:world_[a-z_]+|tool_calls|function_call|role\s*[:=]\s*system)\b/i;
export function isSystemMemoryText(text){return injected.test(String(text));}
export function stripRetrievalEnvelope(text){
 return String(text).replace(/【(?:系统|工具结果|工具|事件记录)】|\[(?:system|tool result)\]/gi,'')
  .replace(/(?:事件编号|eventId)\s*[:：=]\s*[a-zA-Z0-9_:-]+\s*[，,；;]?/gi,'').trim();
}
export function prepareRetrievalRecord(record,{verified=false}={}){
 if(!record||typeof record.text!=='string')throw preconditionFailure('检索记录需要文字正文');
 if(!verified&&isSystemMemoryText(record.text))return null;
 const text=verified?stripRetrievalEnvelope(record.text):record.text;
 return text.trim()?{...record,text}:null;
}
export function expandRetrievalText(text,{normalize=value=>String(value),resolver=null,scope=null}={}){
 const source=normalize(text),parts=[source.replace(technicalQuery,' ')];
 for(const row of RETRIEVAL_SYNONYMS)if(row.some(word=>source.includes(normalize(word))))parts.push(...row.map(normalize));
 if(/(?:能|可以|可否).{0,3}(?:用|借)|借用/.test(source))parts.push('允许 准许 许可 获准 借用');
 if(resolver)for(const id of resolver.mentions(source,scope)){
  const entity=resolver.entities.get(id);parts.push(id,normalize(entity.name));
 }
 // The physical book remains searchable through 账簿; standalone technical
 // vocabulary must not dominate a question about actual events.
 return [...new Set(parts)].join(' ').replaceAll('账本','账簿').replaceAll('帐本','账簿');
}
