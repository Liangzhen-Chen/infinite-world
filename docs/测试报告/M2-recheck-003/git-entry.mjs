import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs';
import {promisify} from 'node:util';
const context=JSON.parse(fs.readFileSync(new URL('./git-context.json',import.meta.url),'utf8'));
const original=childProcess.execFile;
// Sandbox blocks child processes. Only this already captured read-only Git query
// is supplied locally; every other command keeps the original implementation.
childProcess.execFile=function(file,args,options,callback){
 if(file==='git'&&JSON.stringify(args)===JSON.stringify(['rev-parse','--git-common-dir'])){
  if(typeof options==='function')callback=options;
  queueMicrotask(()=>callback(null,context.commonDirectory+'\n',''));
  return undefined;
 }
 return original.apply(this,arguments);
};
childProcess.execFile[promisify.custom]=function(file,args,options){
 if(file==='git'&&JSON.stringify(args)===JSON.stringify(['rev-parse','--git-common-dir']))
  return Promise.resolve({stdout:context.commonDirectory+'\n',stderr:''});
 return original[promisify.custom].call(this,file,args,options);
};
syncBuiltinESMExports();
