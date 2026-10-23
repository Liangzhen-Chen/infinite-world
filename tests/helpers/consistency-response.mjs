import {consistencyReviewRequest} from '../../server-plugin/consistency-review.mjs';

// Legacy tests exercise the independent issue checks (privacy, naming, money,
// protocol and retry). Supply explicit observation classifications for those
// stubs; semantic claim classifications are asserted in claim-review.test.
export function claimFor(segment,extra={}){
 return {segmentId:segment.id,start:segment.start,end:segment.end,quote:segment.quote,speaker:segment.speaker,
  subject:segment.speaker,predicate:'描写',object:null,quantity:null,time:{mode:'current',at:null,until:null},modality:'fact',kind:'observation',verdict:'unsourced',reason:'普通描写不要求行动回执',references:[],decision:null,...extra};
}
export function reviewPayload(input){
 return JSON.parse((input.messages?input:consistencyReviewRequest(input)).messages[1].content);
}
export function reviewResponse(input,issues=[],claims){
 const payload=reviewPayload(input);
 return {choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'report_consistency_issues',arguments:JSON.stringify({issues,claims:claims??payload.segments.map(segment=>claimFor(segment))})}}]}}]};
}
// Adapt archived issue-format responses in memory; keep their issue JSON
// (including deliberately malformed brackets) intact for format-repair tests.
export function withReviewClaims(response,input){
 const copy=structuredClone(response),call=copy.choices?.[0]?.message?.tool_calls?.[0];
 if(call?.function?.name==='report_consistency_issues'){
  const claims=reviewPayload(input).segments.map(segment=>claimFor(segment));
  call.function.arguments=call.function.arguments.replace(/}\s*$/,`,"claims":${JSON.stringify(claims)}}`);
 }
 return copy;
}
