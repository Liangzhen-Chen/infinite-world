import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once}from'node:events';
import express from 'express';
import {init}from'../server-plugin/index.mjs';
import {assembleMessages,isOutOfCharacter}from'../extension/prompt.mjs';
import {toolDefinitions,readOnlyTools}from'../extension/tools.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {parseTurn,toolResultWithClock}from'../extension/turn.mjs';
import {visibleReply}from'../extension/message-view.mjs';
import {evaluateAssertions}from'./playtest-assertions.mjs';
import {generationSettings,generationRequest}from'../extension/generation.mjs';
import {planNpcAutonomy}from'./npc-autonomy-planner.mjs';
import {groupHistory,planHistoryWindow}from'../extension/history-window.mjs';
import {loadHistoryTokenizer}from'./m3-history-tokenizer.mjs';
import {loadWorld}from'./load-world.mjs';
import {summarizeConsistency,consistencyTurnFailed}from'../server-plugin/consistency-outcome.mjs';

export async function createPlaytestServer({world,seed,plannerClient,consistencyClient=plannerClient??null,consistencyEnabled=true,directory:persistentDirectory=null}={}){
    const directory=persistentDirectory?path.resolve(persistentDirectory):await fs.mkdtemp(path.join(os.tmpdir(),'fields-playtests-'));await fs.mkdir(directory,{recursive:true});
    // Same body limit as the SillyTavern host (src/server-main.js): exported bundles carry every world version they replay on.
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
    const npcPlanner=plannerClient?(engine,document,options)=>planNpcAutonomy(engine,document,{...options,client:options.client??{generate:plannerClient.generate.bind(plannerClient)}}):undefined;
    await init(router,{world,baseRoot:directory,newCampaignSeed:seed===undefined?undefined:()=>seed,npcPlanningEnabled:Boolean(plannerClient),npcPlanner,consistencyClient,consistencyEnabled});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    const api=async(endpoint,body={})=>{
        const response=await fetch(`${origin}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok||data.ok===false){const error=new Error(data.error??`HTTP ${response.status}`);error.httpStatus=response.status;throw error;}return data;
    };
    return{api,directory,close:async()=>{await new Promise(resolve=>server.close(resolve));if(!persistentDirectory)await fs.rm(directory,{recursive:true,force:true});}};
}

export async function runPlaytest({scenario,api,client,bundle,attempt=1,processMessages=messages=>messages,countTokens=null,historyWindow={},session=null,stopOnFailure=false}={}){
    if(scenario.initial?.requiresSession&&!session)throw new Error(`${scenario.id} 必须先准备隔离 HTTP 会话，不能用新角色代替`);
    historyWindow={...scenario.historyWindow,...historyWindow};
    const settings=generationSettings(bundle.generation);
    countTokens??=await loadHistoryTokenizer();let historyCursor=structuredClone(session?.historyCursor??null);
    const tools=toolDefinitions(),allowed=new Set(tools.map(row=>row.function.name));
    let view=session?await api('read',{campaignId:session.campaignId}):await api('create',scenario.initial?.mode==='legacy'?{name:'试玩者'}:{character:{name:'试玩者'}});
    const opening=bundle.card.data.first_mes;
    const campaignId=view.reference.campaignId,chat=structuredClone(session?.chat??[{is_user:false,name:bundle.card.data.name,mes:opening}]),history=structuredClone(session?.history??[{role:'assistant',content:opening}]),reports=[],frames=[];
    const sync=()=>api('sync-index',{campaignId,start:0,messages:chat,total:chat.length});
    const fresh=async()=>{view=await api('read',{campaignId});return view.document;};
    const checkpoint=()=>({chat:structuredClone(chat),history:structuredClone(history),document:structuredClone(view.document),historyCursor:structuredClone(historyCursor)});
    // Initial fixtures are the same supported create endpoints used by the extension; no state injection.
    for(const [index,step]of scenario.turns.entries()){
        const report={index,input:step.input,operation:step.operation??'send',calls:[],requests:[],assertions:[],reply:'',errors:[]};reports.push(report);
        let assertionBefore=null;const started=performance.now();
        try{
            if(step.operation==='regenerate'||step.operation==='deleteLast'){
                const frame=frames.pop();if(!frame)throw new Error('没有可以回退的回合');
                const anchored=chat.filter(row=>row.is_user).map(row=>row.extra.fields_anchor);
                await api('reconcile',{campaignId,validAnchors:anchored.slice(0,-1)});
                chat.splice(0,chat.length,...frame.chat);history.splice(0,history.length,...frame.history);historyCursor=frame.historyCursor;await fresh();await sync();
                const same=JSON.stringify(view.document.state)===JSON.stringify(frame.document.state);
                report.assertions.push({kind:'rollback',pass:same});
                if(step.operation==='deleteLast'){
                    report.assertions.push(...evaluateAssertions(step.assertions??[],{before:frame.document,after:view.document,calls:[],reply:''}));continue;
                }
            }
            if(step.operation==='refresh'){
                const before=structuredClone(view.document);await fresh();await sync();
                report.assertions.push({kind:'reload',pass:JSON.stringify(view.document)===JSON.stringify(before)});
            }
            frames.push(checkpoint());
            const before=structuredClone(view.document),startMinute=before.state.minute,anchor=step.anchor??`${scenario.id}-${attempt}-${index}`;
            assertionBefore=before;
            chat.push({is_user:true,mes:step.input,extra:{fields_anchor:anchor}});history.push({role:'user',content:step.input});await sync();
            const reviewTurn=await api('review/begin',{campaignId,anchor,playerText:step.input,expectedSequence:view.reference.sequence,captureSearch:true});
            const scene=await api('scene',{campaignId,query:step.input});
            report.sceneBefore=scene.scene;
            let final=false;
            for(let recursion=0;recursion<settings.toolRecursionLimit;recursion++){
                const current=recursion?await api('scene',{campaignId,query:step.input}):scene;
                report.sceneBeforeReply=current.scene;
                const anchors=chat.filter(message=>message.is_user).map(message=>message.extra.fields_anchor);
                const groups=await groupHistory(history,{format:'api',anchors,tokenCounts:await Promise.all(history.map(message=>countTokens(JSON.stringify(message))))});
                const reservedTokens=1024+await countTokens(JSON.stringify(assembleMessages(bundle,[],current.scene)))+await countTokens(JSON.stringify(tools));
                const coverage=await api('history/coverage',{campaignId,expectedSequence:view.reference.sequence});
                const planned=planHistoryWindow(groups,{...historyWindow,cursor:historyCursor,coverage,contextTokens:historyWindow.contextTokens??settings.maxContextTokens-settings.maxOutputTokens,reservedTokens});
                if(!planned.canSend)throw new Error('历史上下文超限，或待裁剪回合缺少编年史及原文覆盖');
                historyCursor=planned.cursor;report.historyWindow={reason:planned.reason,reset:planned.reset,beforeTokens:planned.beforeTokens,afterTokens:planned.afterTokens,batch:planned.batch,removedAnchors:planned.cursor.removed.map(row=>row.anchor)};
                const messages=assembleMessages(bundle,planned.messages,current.scene);
                const response=await client.generate({...generationRequest(settings),messages:processMessages(messages,bundle),tools,tool_choice:'auto'},`${scenario.id}-${attempt}-${index}-${recursion}`);
                if(response.measurement)report.requests.push(response.measurement);
                const message=response.choices?.[0]?.message;if(!message)throw new Error('模型没有返回消息');
                report.finish=response.choices[0].finish_reason??null;
                if(report.finish==='length')throw new Error(`输出达到${settings.maxOutputTokens} token上限，回复或调用未完成`);
                const normalized={role:'assistant',content:message.content??null,...(message.tool_calls?.length?{tool_calls:message.tool_calls}:{})};
                messages.push(normalized);history.push(normalized);
                if(!message.tool_calls?.length){report.reply=message.content??'';final=Boolean(report.reply);break;}
                for(const call of message.tool_calls){
                    let args={},result;const tool=call.function?.name;
                    try{
                        args=JSON.parse(call.function.arguments);if(!allowed.has(tool))throw new Error('模型调用未注册工具');
                        if(isOutOfCharacter(step.input)&&!readOnlyTools.has(tool))throw new Error('场外不能写入世界');
                        if(tool==='world_read')result=readStateSection(view.document.state,args.section,args.npc);
                        else if(tool==='world_search')result=await api('search',{...args,campaignId,token:reviewTurn.token,anchor,expectedSequence:view.reference.sequence});
                        else if(tool==='world_catalog')result=await api('catalog',{...args,campaignId});
                        else if(tool==='world_actions')result=await api('actions',{target:args.target,query:args.query,campaignId,limit:12});
                        else{
                            const eventId=`${anchor}-${report.calls.length}`;
                            const request={campaignId,tool,args,eventId,anchor,expectedSequence:view.reference.sequence};
                            const output=await api('execute',request);await fresh();
                            result=toolResultWithClock(output.result,{startMinute,minute:view.document.state.minute});
                            if(step.repeatWrites){
                                const duplicate=await api('execute',request),unchanged=await api('read',{campaignId});
                                report.assertions.push({kind:'duplicate',pass:duplicate.duplicate===true&&JSON.stringify(unchanged.document)===JSON.stringify(view.document)});
                            }
                        }
                    }catch(error){result={ok:false,error:error.message};}
                    report.calls.push({tool,args,result});
                    const reply={role:'tool',tool_call_id:call.id,content:JSON.stringify(result)};messages.push(reply);history.push(reply);
                    chat.push({is_system:true,mes:reply.content,extra:{tool_invocations:[{name:tool}]}});
                }
            }
            if(!final)throw new Error(`${settings.toolRecursionLimit}轮调用内未返回完整正文`);
            report.originalReply=report.reply;
            report.consistency=await api('review/reply',{campaignId,token:reviewTurn.token,draft:report.reply,query:step.input,expectedSequence:view.reference.sequence});
            report.reply=report.consistency.canCommit?report.consistency.text:report.originalReply;
            history.at(-1).content=report.reply;
            if(!report.consistency.canCommit){
                const issues=report.consistency.issues.length?report.consistency.issues:report.consistency.originalIssues??[];
                report.reviewFailure={reason:report.consistency.rewriteError??report.consistency.feedback,categories:issues.length?[...new Set(issues.map(issue=>issue.category))]:['review-unverified']};
                // Keep the original conversation and successful action receipts;
                // a rejected tail must never enter the game ledger.
                chat.push({is_user:false,name:'无限原野·世界主持人',mes:report.reply});await sync();
                report.visible=visibleReply(report.reply,scene.labels);
                continue;
            }
            const state=view.document.state,parsed=parseTurn(report.reply,{location:state.location,startMinute,minute:state.minute,
                present:Object.entries(state.npcs).filter(([,npc])=>npc.location===state.location).map(([id])=>id),outOfCharacter:isOutOfCharacter(step.input)});
            report.tail={valid:parsed.valid,warning:parsed.warning};
            const output=await api('execute',{campaignId,tool:'world_turn',args:parsed.args,eventId:`turn_${anchor}`,anchor,expectedSequence:view.reference.sequence,reviewId:report.consistency.reviewId});
            report.turnResult=output.result;await fresh();
            chat.push({is_user:false,name:'无限原野·世界主持人',mes:report.reply});await sync();
            report.visible=visibleReply(report.reply,scene.labels);
            if(isOutOfCharacter(step.input))report.assertions.push({kind:'outOfCharacter',pass:JSON.stringify(before)===JSON.stringify(view.document)&&parsed.valid});
            report.player=view.document.state.player;report.minute=view.document.state.minute;report.location=view.document.state.location;
            report.feedback=(await api('feedback',{campaignId})).events.filter(event=>event.anchor===anchor);
        }catch(error){report.errors.push(error.message);report.assertions.push({kind:'execution',pass:false,actual:error.message});}
        finally{
            report.latencyMs=performance.now()-started;
            // A generation failure can follow a successful write. Keep every
            // declared assertion and the actual saved state in the report.
            if(assertionBefore){
                await fresh();
                report.assertions.push(...evaluateAssertions(step.assertions??[],{before:assertionBefore,after:view.document,calls:report.calls,reply:report.visible??'',scene:report.sceneBefore,historyWindow:report.historyWindow}));
                report.player=view.document.state.player;report.minute=view.document.state.minute;report.location=view.document.state.location;
            }
        }
        if(stopOnFailure&&report.errors.length)break;
    }
    const assertions=reports.flatMap(row=>row.assertions),passed=assertions.filter(row=>row.pass).length;
    const ledgerPass=assertions.length>0&&passed===assertions.length;
    const reviews=reports.filter(row=>row.originalReply!==undefined).map(row=>row.consistency);
    const consistencyVerified=reviews.length>0&&reviews.every(row=>row?.verified===true&&row.canCommit);
    const consistencyIssues=reviews.flatMap(row=>row?.issues??[]);
    const consistency=summarizeConsistency([{id:scenario.id,attempt,turns:reports}]);
    const consistencyPass=consistency.thresholdReached;
    return{id:scenario.id,title:scenario.title,attempt,settings,fixture:scenario.initial??{mode:'new'},requirements:scenario.requirements,
        ledgerPass,consistencyVerified,consistencyPass,consistencyIssues,consistency,reviewRequired:consistency.failed>0,acceptancePass:ledgerPass&&consistencyPass,
        assertions:assertions.length,passed,ratio:passed/Math.max(1,assertions.length),pass:assertions.length>0&&passed===assertions.length&&consistency.rejected===0,
        failedTurns:reports.filter(turn=>turn.errors.length||turn.assertions.some(rule=>!rule.pass)||consistencyTurnFailed(turn)).length,turns:reports,
        session:{campaignId,chat,history,historyCursor},finalDocument:view.document};
}

// Deterministic HTTP preparation only; these actions are not model turns or M1 evidence.
export async function preparePlaytestSession({scenario,api,world,directory}={}){
    if(!scenario.initial?.requiresSession)return null;
    if(!['m3_memory','world_upgrade'].includes(scenario.id))throw new Error(`未提供 ${scenario.id} 的会话准备路径`);
    if(scenario.id==='m3_memory'&&!directory)throw new Error('记忆夹具需要当前隔离HTTP服务器的目录');
    let source;
    try{
        const selected=world??await loadWorld();
        if(scenario.id==='world_upgrade'){
            const old=structuredClone(selected);
            old.version=`${old.version}-m3-old`;old.rules.version=old.version;
            old.skills[0].description+='；隔离旧版目录。';
            source=await createPlaytestServer({world:old,consistencyEnabled:false});
        }else source=await createPlaytestServer({world:selected,directory,consistencyEnabled:false});
        const sourceApi=source.api;
        let view=await sourceApi('create',scenario.id==='m3_memory'?{}:{character:{name:'试玩者'}});
        const campaignId=view.reference.campaignId;let sequence=0;
        const act=async(tool,args)=>{
            const anchor=`${scenario.id}-fixture-${sequence++}`;
            await sourceApi('execute',{campaignId,tool,args,anchor,eventId:anchor,expectedSequence:view.reference.sequence});
            view=await sourceApi('read',{campaignId});
        };
        await act('world_move',{destination:'青灯酒馆'});
        if(scenario.id==='m3_memory'){
            await act('world_time',{minutes:2880,activity:'休息'});
            await act('world_remember',{subject:'林穗',key:'账簿厨房',content:scenario.memoryFact,source:'受控亲历夹具'});
            await act('world_remember',{subject:'玩家',key:'摘要遗漏',content:'我把旅行笔记取名为雨檐蓝页',source:'亲历'});
        }else{
            await act('world_trade',{seller:'林穗',service:'住宿',days:1});
            await act('world_trade',{seller:'林穗',item:'面包',quantity:1});
            await act('world_remember',{subject:'玩家',key:'旧版住宿',content:'我在青灯酒馆向林穗付六铜住宿，又花两铜买了一个面包',source:'亲历'});
        }
        if(scenario.id==='world_upgrade')view=await api('import',{bundle:await sourceApi('export',{campaignId})});
        view=await api('read',{campaignId:view.reference.campaignId});
        return {campaignId:view.reference.campaignId};
    }finally{await source?.close();}
}
