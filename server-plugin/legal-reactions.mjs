import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {institutionOffices,officeOnDuty} from './entity-view.mjs';
import {knownWorldEventReference,worldEvent} from './world-events.mjs';
import {subjectiveView} from './subjective-view.mjs';

export const FILING_VERSION=1;

const filingFailure=reason=>reject('E-ACTION-LEGAL-REQUEST',reason,{missing:[reason],repair:['取得本人所知的事件及在场有权收件人，再递交原请求']});

// Offices supply powers and hours; a caller cannot supply either in a claim.
export function filingOfficer(engine,d,id,permission,caseId){
 const s=d.get('state');
 const office=institutionOffices(engine,s).find(o=>o.holder===id&&o.seat===s.location&&
  o.authority?.operations?.includes(permission)&&(!o.authority.case||o.authority.case===caseId)&&officeOnDuty(engine,s,o,id));
 if(!office)filingFailure('此人尚未在此处的经办席位当值，或没有办理这件事的职权；请等有权经办人到岗');
 return office;
}

// Resolve the speaker's version, never the private suspicion or the accused's truth.
export function filingKnowledge(engine,d,actor,reference){
 const s=d.get('state'),memories=subjectiveView(engine,d.document,actor).knowledge.memories;
 const heard=memories.find(m=>(m.sourceEvent===reference||`world_event:${m.sourceEvent}`===reference)&&m.sourceType==='转述');
 const id=knownWorldEventReference(s,actor,{reference})??heard?.sourceEvent;
 if(!id)filingFailure('报案者没有亲见或被告知的事件，请先取得本人确实知晓的事由');
 const event=worldEvent(s,id),knowledge=Object.values(s.records??{}).find(r=>r.category==='knowledge'&&r.observer===actor&&r.sourceEvent===id&&r.complete!==false);
 const direct=event.actor===actor||event.witnesses?.includes(actor)||event.observer===actor;
 const visible=direct?event:knowledge?.value??knowledge?.content??heard?.value??(heard?{verb:heard.kind,summary:heard.content,minute:heard.minute,location:heard.location}:null);
 const fields=['id','verb','actor','target','value','location','minute','summary','stolen'];
 // A witness does not acquire other witnesses' perception, internal legal
 // links or the engine's private suspicion by citing the occurrence.
 const version=visible&&typeof visible==='object'?Object.fromEntries(fields.filter(k=>visible[k]!==undefined).map(k=>[k,structuredClone(visible[k])])):null;
 if(direct&&event.payload)version.payload=Object.fromEntries(['owner','item','resource','subject','quantity','name'].filter(k=>event.payload[k]!==undefined).map(k=>[k,structuredClone(event.payload[k])]));
 if(direct&&event.tags?.includes('attempt'))version.tags=['attempt'];
 if(!version||typeof version!=='object')throw preconditionFailure('报案者没有可提交的事件版本');
 return {sourceEvent:id,version,direct};
}
