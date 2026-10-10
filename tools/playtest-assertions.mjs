import {isDeepStrictEqual}from'node:util';
export const at=(object,path)=>String(path).split('.').reduce((value,key)=>value?.[key],object);
const matches=(row,where)=>Object.entries(where??{}).every(([key,value])=>isDeepStrictEqual(at(row,key),value));
export function evaluateAssertions(assertions,{before,after,calls,reply}){
    return assertions.map(rule=>{
        let actual,pass=false;
        const value=at(after,rule.path),old=at(before,rule.path);
        switch(rule.kind){
            case'conditional':{
                const condition=at(before,rule.when.path)!==undefined;
                const branch=condition?rule.then:rule.else;
                actual=evaluateAssertions(branch,{before,after,calls,reply});pass=actual.length>0&&actual.every(row=>row.pass);break;
            }
            case'equals':actual=value;pass=isDeepStrictEqual(value,rule.value);break;
            case'quantity':actual=typeof value==='number'?value:value?.quantity??0;pass=actual===rule.value;break;
            case'exists':actual=value!==undefined;pass=actual===(rule.value??true);break;
            case'delta':actual=(value??0)-(old??0);pass=actual===(rule.value??0);break;
            case'range':actual=value;pass=Number.isFinite(value)&&value>=(rule.min??-Infinity)&&value<=(rule.max??Infinity);break;
            case'elapsed':actual=after.state.minute-before.state.minute;pass=actual>=rule.min&&actual<=rule.max;break;
            case'unchanged':actual=(rule.paths??['state']).filter(path=>!isDeepStrictEqual(at(before,path),at(after,path)));pass=!actual.length;break;
            case'records':actual=Object.values(value??{}).filter(row=>matches(row,rule.where)).length;pass=actual>=(rule.min??1)&&actual<=(rule.max??Infinity);break;
            case'calls':actual=calls.filter(call=>call.tool===rule.tool&&matches(call.args,rule.args)&&(!rule.success||call.result?.ok!==false)).length;pass=actual>=(rule.min??1)&&actual<=(rule.max??Infinity);break;
            case'conservation':actual=rule.paths.reduce((sum,path)=>sum+(at(after,path)??0)-(at(before,path)??0),0);pass=actual===0;break;
            case'replyContains':actual=rule.text;pass=reply.includes(rule.text);break;
            default:throw new Error(`未知试玩断言 ${rule.kind}`);
        }
        return{...rule,pass,actual};
    });
}
