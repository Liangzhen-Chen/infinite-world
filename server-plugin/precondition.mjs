// A business precondition that a player-facing action failed. It is a typed
// ActionRejection, so the public boundary turns it into a rejection receipt;
// the reason is the world-facing explanation, and the receipt's missing and
// repair lines default to naming that condition.
import {ActionRejection} from './action-rejection.mjs';
export const preconditionFailure=(reason,{code='E-ACTION-PRECONDITION',missing=[reason],repair=[`先满足当前条件：${reason}`]}={})=>new ActionRejection(code,reason,{missing,repair});
