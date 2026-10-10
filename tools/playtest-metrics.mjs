import {resolveToolCall}from'../extension/tools.mjs';
// Explicit action requests and evaluated conditional branches are tagged. Optional actions and
// boundary refusals are not counted as missed tool calls.
export function toolSelectionMetrics(results,scenarios){
    const readOnly=new Set(['world_read','world_catalog','world_search','world_weather']);
    const rows=[];
    for(const session of results){
        const scenario=scenarios.find(row=>row.id===session.id);
        for(const turn of session.turns){
            const step=scenario?.turns[turn.index];
            if(step?.toolExpectationAfter){
                const prerequisite=session.turns.find(row=>row.index===step.toolExpectationAfter.turn)?.assertions
                    .find(rule=>rule.kind==='exists'&&rule.path===step.toolExpectationAfter.path);
                if(!prerequisite?.pass)continue;
            }
            const branchCalls=turn.assertions.filter(rule=>rule.kind==='conditional').flatMap(rule=>rule.actual??[])
                .filter(rule=>rule.kind==='calls'&&(rule.min??1)>0).map(rule=>rule.tool);
            const expected=[...new Set([...(step?.expectedTools??[]),...branchCalls])];
            if(!expected?.length)continue;
            const selected=turn.calls.map(call=>{try{return resolveToolCall(call.tool,call.args).tool;}catch{return call.tool;}});
            const matched=selected.some(tool=>expected.includes(tool));
            const wrong=!matched&&selected.some(tool=>!readOnly.has(tool));
            rows.push({session:session.id,turn:turn.index,expected,selected,missing:!matched&&!wrong,wrong});
        }
    }
    const missed=rows.filter(row=>row.missing).length,wrong=rows.filter(row=>row.wrong).length;
    return {scope:'明确行动及已触发条件分支；参数错误单列，前置条件不满足的施法排除，未标注回合不计',opportunities:rows.length,missed,wrong,
        missedRatio:rows.length?missed/rows.length:null,wrongRatio:rows.length?wrong/rows.length:null,rows};
}
