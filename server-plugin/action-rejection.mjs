// Business preconditions carry their world-facing explanation at the source.
export class ActionRejection extends Error {
 constructor(code,reason,{missing=[],repair=[]}={}){
  super(reason);this.name='ActionRejection';this.code=code;
  this.missing=missing;this.repair=repair;
 }
}
export function reject(code,reason,details){throw new ActionRejection(code,reason,details);}
