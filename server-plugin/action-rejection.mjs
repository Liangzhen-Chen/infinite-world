import {PrimitiveRejected} from './primitive-policy.mjs';
import {HoldingRejected} from './holdings.mjs';

// Business preconditions carry their world-facing explanation at the source.
export class ActionRejection extends Error {
 constructor(code,reason,{missing=[],repair=[]}={}){
  super(reason);this.name='ActionRejection';this.code=code;
  this.missing=missing;this.repair=repair;
 }
}
export function reject(code,reason,details){throw new ActionRejection(code,reason,details);}
// The explicit list of typed domain rejections (06 §6.10.4). A plain Error,
// TypeError or any other engine failure is never a world-facing refusal, no
// matter what language its message is written in.
export const DOMAIN_REJECTIONS=Object.freeze([ActionRejection,PrimitiveRejected,HoldingRejected]);
export const isDomainRejection=error=>DOMAIN_REJECTIONS.some(type=>error instanceof type);
