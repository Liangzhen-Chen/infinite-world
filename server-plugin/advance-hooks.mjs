// Small L0 registration surface for optional L1 advance optimizations.
const hooks={};
export function registerAdvanceHook(name,handler){
    if(typeof name!=='string'||typeof handler!=='function')throw new TypeError('推进钩子需名称与函数');
    hooks[name]=handler;
    return ()=>{if(hooks[name]===handler)delete hooks[name];};
}
export const advanceHook=name=>hooks[name];
