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

export async function createPlaytestServer({world,seed,plannerClient}={}){
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fields-playtests-'));
    const app=express();app.use(express.json({limit:'10mb'}));const router=express.Router();
    const npcPlanner=plannerClient?(engine,document,options)=>planNpcAutonomy(engine,document,{...options,client:{generate:plannerClient.generate.bind(plannerClient)}}):undefined;
    await init(router,{world,baseRoot:directory,newCampaignSeed:seed===undefined?undefined:()=>seed,npcPlanningEnabled:Boolean(plannerClient),npcPlanner});app.use(router);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    const api=async(endpoint,body={})=>{
        const response=await fetch(`${origin}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error??`HTTP ${response.status}`);return data;
    };
    return{api,close:async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}};
}

export async function runPlaytest({scenario,api,client,bundle,attempt=1,processMessages=messages=>messages}){
    const settings=generationSettings(bundle.generation);
    const tools=toolDefinitions(),allowed=new Set(tools.map(row=>row.function.name));
    let view=await api('create',scenario.initial?.mode==='legacy'?{name:'试玩者'}:{character:{name:'试玩者'}});
    const opening=bundle.card.data.first_mes;
    const campaignId=view.reference.campaignId,chat=[{is_user:false,name:bundle.card.data.name,mes:opening}],history=[{role:'assistant',content:opening}],reports=[],frames=[];
    const sync=()=>api('sync-index',{campaignId,start:0,messages:chat,total:chat.length});
    const fresh=async()=>{view=await api('read',{campaignId});return view.document;};
    const checkpoint=()=>({chat:structuredClone(chat),history:structuredClone(history),document:structuredClone(view.document)});
    // Initial fixtures are the same supported create endpoints used by the extension; no state injection.
    for(const [index,step]of scenario.turns.entries()){
        const report={index,input:step.input,operation:step.operation??'send',calls:[],requests:[],assertions:[],reply:'',errors:[]};reports.push(report);
        let assertionBefore=null;const started=performance.now();
        try{
            if(step.operation==='regenerate'||step.operation==='deleteLast'){
                const frame=frames.pop();if(!frame)throw new Error('没有可以回退的回合');
                const anchored=chat.filter(row=>row.is_user).map(row=>row.extra.fields_anchor);
                await api('reconcile',{campaignId,validAnchors:anchored.slice(0,-1)});
                chat.splice(0,chat.length,...frame.chat);history.splice(0,history.length,...frame.history);await fresh();await sync();
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
            const before=structuredClone(view.document),startMinute=before.state.minute,anchor=`${scenario.id}-${attempt}-${index}`;
            assertionBefore=before;
            chat.push({is_user:true,mes:step.input,extra:{fields_anchor:anchor}});history.push({role:'user',content:step.input});await sync();
            const scene=await api('scene',{campaignId,query:step.input});
            report.sceneBefore=scene.scene;
            let final=false;
            for(let recursion=0;recursion<settings.toolRecursionLimit;recursion++){
                const current=recursion?await api('scene',{campaignId,query:step.input}):scene;
                report.sceneBeforeReply=current.scene;
                const messages=assembleMessages(bundle,history,current.scene);
                const response=await client.generate({...generationRequest(settings),messages:processMessages(messages,bundle),tools,tool_choice:'auto'},`${scenario.id}-${attempt}-${index}-${recursion}`);
                if(response.measurement)report.requests.push(response.measurement);
                const message=response.choices?.[0]?.message;if(!message)throw new Error('模型没有返回消息');
                report.finish=response.choices[0].finish_reason??null;
                if(report.finish==='length')throw new Error('输出达到1800 token上限，回复或调用未完成');
                const normalized={role:'assistant',content:message.content??null,...(message.tool_calls?.length?{tool_calls:message.tool_calls}:{})};
                messages.push(normalized);history.push(normalized);
                if(!message.tool_calls?.length){report.reply=message.content??'';final=Boolean(report.reply);break;}
                for(const call of message.tool_calls){
                    let args={},result;const tool=call.function?.name;
                    try{
                        args=JSON.parse(call.function.arguments);if(!allowed.has(tool))throw new Error('模型调用未注册工具');
                        if(isOutOfCharacter(step.input)&&!readOnlyTools.has(tool))throw new Error('场外不能写入世界');
                        if(tool==='world_read')result=readStateSection(view.document.state,args.section);
                        else if(tool==='world_search')result=await api('search',{...args,campaignId});
                        else if(tool==='world_catalog')result=await api('catalog',{...args,campaignId});
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
            const state=view.document.state,parsed=parseTurn(report.reply,{location:state.location,startMinute,minute:state.minute,
                present:Object.entries(state.npcs).filter(([,npc])=>npc.location===state.location).map(([id])=>id),outOfCharacter:isOutOfCharacter(step.input)});
            report.tail={valid:parsed.valid,warning:parsed.warning};
            const output=await api('execute',{campaignId,tool:'world_turn',args:parsed.args,eventId:`turn_${anchor}`,anchor,expectedSequence:view.reference.sequence});
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
                report.assertions.push(...evaluateAssertions(step.assertions??[],{before:assertionBefore,after:view.document,calls:report.calls,reply:report.visible??''}));
                report.player=view.document.state.player;report.minute=view.document.state.minute;report.location=view.document.state.location;
            }
        }
    }
    const assertions=reports.flatMap(row=>row.assertions),passed=assertions.filter(row=>row.pass).length;
    return{id:scenario.id,title:scenario.title,attempt,settings,fixture:scenario.initial??{mode:'new'},requirements:scenario.requirements,
        assertions:assertions.length,passed,ratio:passed/Math.max(1,assertions.length),pass:assertions.length>0&&passed===assertions.length,turns:reports,
        finalDocument:view.document};
}
