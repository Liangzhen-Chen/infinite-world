import {publishNpcDepth} from '../../tools/publish-npc-depth.mjs';
// Test files run in parallel and republish against the same formal baseline; the publisher's
// lock correctly refuses a concurrent commit, so wait for the other file's commit to finish.
export async function publishNpcDepthSerial(options){
 for(let attempt=0;;attempt++){
  try{return await publishNpcDepth(options);}
  catch(error){if(attempt>=120||!/另一个人物发布正在提交/.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,250));}
 }
}
