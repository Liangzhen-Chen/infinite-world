import {PrimitiveRejected} from './primitive-policy.mjs';
import {HoldingRejected} from './holdings.mjs';

// Business preconditions carry their world-facing explanation at the source.
export class ActionRejection extends Error {
 constructor(code,reason,{missing=[],repair=[],alternatives=[],fallback=null}={}){
  super(reason);this.name='ActionRejection';this.code=code;
  this.missing=missing;this.repair=repair;this.alternatives=alternatives;this.fallback=fallback;
 }
}
export function reject(code,reason,details){throw new ActionRejection(code,reason,details);}
// The explicit list of typed domain rejections (06 §6.10.4). A plain Error,
// TypeError or any other engine failure is never a world-facing refusal, no
// matter what language its message is written in.
export const DOMAIN_REJECTIONS=Object.freeze([ActionRejection,PrimitiveRejected,HoldingRejected]);
// These codes describe broken native wiring/data, not a player's world limits.
const INTERNAL_CODES=new Set(['E-PRIMITIVE-CONNECTOR','E-PRIMITIVE-FRAME','E-ACTION-COST','E-OPEN-COST','E-OPEN-BOUND','E-MARK-DATA','E-RITE-DATA','E-PRIMITIVE-DUPLICATE']);
export const isDomainRejection=error=>DOMAIN_REJECTIONS.some(type=>error instanceof type)&&!INTERNAL_CODES.has(error.code);

export {refusalProjection} from './primitive-policy.mjs';
