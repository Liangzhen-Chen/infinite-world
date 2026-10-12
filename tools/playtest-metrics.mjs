import {isDeepStrictEqual}from'node:util';
import {resolveToolCall}from'../extension/tools.mjs';

const at=(object,path)=>String(path).split('.').reduce((value,key)=>value?.[key],object);
const matches=(args,expected)=>Object.entries(expected??{}).every(([key,value])=>isDeepStrictEqual(at(args,key),value));
const definition=({pass,actual,...rule})=>rule;
const sameRules=(actual,planned)=>Array.isArray(actual)&&Array.isArray(planned)&&actual.length===planned.length&&
    actual.every((row,index)=>isDeepStrictEqual(definition(row),planned[index]));
const targetKeys=new Set(['npc','target','entity','seller','buyer','destination','teacher','recipient','owner','subject','with','source']);

// Only declared actions and branches actually evaluated by the runner are opportunities.
export function toolSelectionMetrics(results,scenarios){
    const readOnly=new Set(['world_read','world_catalog','world_search','world_weather']);
    const rows=[],excluded=[];let totalTurns=0,annotatedTurns=0;
    for(const session of results){
        const scenario=scenarios.find(row=>row.id===session.id);
        for(const turn of session.turns??[]){
            totalTurns++;
            const step=scenario?.turns?.[turn.index];
            if(!step){excluded.push({session:session.id,attempt:session.attempt,turn:turn.index,reason:'scenario-turn-missing'});continue;}
            if(turn.input!==step.input){excluded.push({session:session.id,attempt:session.attempt,turn:turn.index,reason:'scenario-input-not-measured',input:turn.input,annotatedInput:step.input});continue;}
            const hasAnnotation=step.expectedTools?.length||step.assertions?.some(rule=>rule.kind==='calls'||rule.kind==='conditional');
            if(!hasAnnotation)continue;
            annotatedTurns++;
            const context={session:session.id,attempt:session.attempt,turn:turn.index,input:step.input};
            const conditions=[],expectations=[];let complete=true;
            if(step.toolExpectationAfter){
                const gate=step.toolExpectationAfter;
                const prerequisite=session.turns.find(row=>row.index===gate.turn)?.assertions?.find(rule=>rule.kind==='exists'&&rule.path===gate.path);
                if(!prerequisite||typeof prerequisite.actual!=='boolean'||prerequisite.value===false){
                    excluded.push({...context,reason:'prerequisite-not-measured',prerequisite:gate});continue;
                }
                if(!prerequisite.actual){excluded.push({...context,reason:'prerequisite-not-met',prerequisite:gate});continue;}
                conditions.push({kind:'prerequisite',...gate,actual:prerequisite.actual});
            }
            const collect=(planned,evaluated,branchConditions=[])=>{
                for(const rule of planned??[]){
                    const observed=evaluated?.find(row=>isDeepStrictEqual(definition(row),rule));
                    if(rule.kind==='calls'&&(rule.min??1)>0)expectations.push({...rule,conditions:branchConditions});
                    if(rule.kind!=='conditional')continue;
                    const branches=['then','else'].filter(branch=>sameRules(observed?.actual,rule[branch]));
                    if(!branches.length){complete=false;excluded.push({...context,reason:'conditional-not-measured',when:rule.when});continue;}
                    const branch=branches.length===2?'equivalent':branches[0];
                    conditions.push({kind:'conditional',when:rule.when,branch});
                    collect(rule[branches[0]],observed.actual,[...branchConditions,{kind:'conditional',when:rule.when,branch}]);
                }
            };
            collect(step.assertions,turn.assertions,[...conditions]);
            const expected=[...new Set([...(step.expectedTools??[]),...expectations.map(rule=>rule.tool)])];
            if(!expected.length){if(complete)excluded.push({...context,reason:'no-required-call',conditions});continue;}
            const selected=(turn.calls??[]).map(call=>{
                try{return{...call,...resolveToolCall(call.tool,call.args),rawTool:call.tool};}
                catch{return{...call,rawTool:call.tool,invalidArguments:true};}
            });
            const categoryMatches=selected.filter(call=>expected.includes(call.tool)||expected.includes(call.rawTool));
            const wrongCalls=selected.filter(call=>!expected.includes(call.tool)&&!expected.includes(call.rawTool)&&!readOnly.has(call.tool));
            const missingTools=expectations.filter(rule=>!selected.some(call=>call.tool===rule.tool||call.rawTool===rule.tool)).map(rule=>rule.tool);
            const parameterErrors=[],targetErrors=[];
            for(const call of categoryMatches){
                const rules=expectations.filter(rule=>call.tool===rule.tool||call.rawTool===rule.tool);
                if(call.invalidArguments||!rules.length||rules.some(rule=>matches(call.args,rule.args)))continue;
                const split=target=>rules.map(rule=>Object.fromEntries(Object.entries(rule.args??{}).filter(([key])=>targetKeys.has(key.split('.')[0])===target)));
                const targets=split(true),parameters=split(false);
                const error={tool:call.tool,expectedArgs:rules.map(rule=>rule.args??{}),actualArgs:call.args,conditions:rules.map(rule=>rule.conditions)};
                const targetMismatch=targets.every(args=>Object.keys(args).length&&!matches(call.args,args));
                if(targetMismatch)targetErrors.push(error);
                if(parameters.some(args=>Object.keys(args).length)&&(parameters.every(args=>!matches(call.args,args))||!targetMismatch))parameterErrors.push(error);
            }
            const unroutableCalls=categoryMatches.filter(call=>call.invalidArguments).length;
            const missing=!categoryMatches.length||missingTools.length>0;
            const wrong=wrongCalls.length>0;
            rows.push({...context,expected,selected:selected.map(call=>call.tool),conditions,
                expectations:expectations.map(({kind,...rule})=>rule),complete,missing,missingTools,wrong,
                wrongCalls:wrongCalls.map(call=>({tool:call.tool,rawTool:call.rawTool,args:call.args})),
                parameterErrors,targetErrors,unroutableCalls,selectedAction:categoryMatches.length>0,
                parameterMeasurement:categoryMatches.some(call=>!call.invalidArguments&&expectations.some(rule=>(call.tool===rule.tool||call.rawTool===rule.tool)&&Object.keys(rule.args??{}).some(key=>!targetKeys.has(key.split('.')[0]))))?'asserted':'not-measured',
                targetMeasurement:categoryMatches.some(call=>!call.invalidArguments&&expectations.some(rule=>(call.tool===rule.tool||call.rawTool===rule.tool)&&Object.keys(rule.args??{}).some(key=>targetKeys.has(key.split('.')[0]))))?'asserted':'not-measured',
                argumentMeasurement:categoryMatches.some(call=>!call.invalidArguments&&expectations.some(rule=>(call.tool===rule.tool||call.rawTool===rule.tool)&&Object.keys(rule.args??{}).length))?'asserted':'not-measured',
                rejected:categoryMatches.filter(call=>call.result?.ok===false).length});
        }
    }
    const opportunities=rows.length,missed=rows.filter(row=>row.missing).length,wrong=rows.filter(row=>row.wrong).length;
    const parameterWrong=rows.filter(row=>row.parameterErrors.length).length,targetWrong=rows.filter(row=>row.targetErrors.length).length;
    const argumentOpportunities=rows.filter(row=>row.argumentMeasurement==='asserted').length;
    const parameterOpportunities=rows.filter(row=>row.parameterMeasurement==='asserted').length,targetOpportunities=rows.filter(row=>row.targetMeasurement==='asserted').length;
    const failures=rows.filter(row=>row.missing||row.wrong||row.parameterErrors.length||row.targetErrors.length||row.unroutableCalls).length;
    const complete=opportunities>0&&rows.every(row=>row.complete)&&!excluded.some(row=>/-not-measured|scenario-turn-missing/.test(row.reason));
    return {measurement:opportunities?'measured':'not-measured',scope:'仅脚本标注的明确行动及实际触发分支；逐行列输入和条件，未标注回合不外推，未标注参数不推断',
        complete,totalTurns,annotatedTurns,unannotatedTurns:totalTurns-annotatedTurns,opportunities,missed,wrong,parameterWrong,targetWrong,argumentOpportunities,parameterOpportunities,targetOpportunities,
        missedRatio:opportunities?missed/opportunities:null,wrongRatio:opportunities?wrong/opportunities:null,
        parameterWrongRatio:parameterOpportunities?parameterWrong/parameterOpportunities:null,targetWrongRatio:targetOpportunities?targetWrong/targetOpportunities:null,
        unroutable:rows.filter(row=>row.unroutableCalls).length,failures,failureRatio:opportunities?failures/opportunities:null,zeroSelectionErrors:complete&&failures===0,
        hasSelectedAction:opportunities>0&&rows.some(row=>row.selectedAction),rows,excluded};
}

// Used by both the persisted report and CLI: no separate success shortcut.
export function playtestAcceptance(report,milestone=report.milestone){
    return milestone==='M2'?report.complete===true&&report.m2?.thresholdReached===true&&
        report.toolSelection?.complete===true&&report.toolSelection.hasSelectedAction===true:report.releaseLedgerPass===true;
}
export const playtestExitCode=report=>playtestAcceptance(report)?0:1;
