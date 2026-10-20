// L0 obligation interfaces. L1 installs queries and mutations at module startup.
// Wrappers resolve at call time so existing composition imports can remain cyclic.
const implementations=new Map();
export function registerObligationProtocol(methods){
    for(const [name,fn] of Object.entries(methods)){
        if(typeof fn!=='function')throw Error(`Invalid obligation protocol: ${name}`);
        if(implementations.has(name))throw Error(`Duplicate obligation protocol: ${name}`);
        implementations.set(name,fn);
    }
}
const invoke=(name,args)=>{
    const fn=implementations.get(name);
    if(!fn)throw Error(`Obligation protocol not registered: ${name}`);
    return fn(...args);
};
export const openObligation=(...args)=>invoke('openObligation',args);
export const settleObligation=(...args)=>invoke('settleObligation',args);
export const closeObligation=(...args)=>invoke('closeObligation',args);
export const performObligation=(...args)=>invoke('performObligation',args);
export const receiveObligationCollection=(...args)=>invoke('receiveObligationCollection',args);
export const dueObligation=(...args)=>invoke('dueObligation',args);
export const claimEnforceable=(...args)=>invoke('claimEnforceable',args);
export const addObligationSchedule=(...args)=>invoke('addObligationSchedule',args);
export const automaticObligationItems=(...args)=>invoke('automaticObligationItems',args);
export const obligationClosed=(...args)=>invoke('obligationClosed',args);
export const fileClosedObligation=(...args)=>invoke('fileClosedObligation',args);
export const advanceProcedure=(...args)=>invoke('advanceProcedure',args);
