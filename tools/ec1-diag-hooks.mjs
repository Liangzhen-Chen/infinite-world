// ec1-diag 的加载钩子（只在内存里改读到的源码，不改任何文件）：给 finance-bank.mjs 的“当事人资金不足”抛错点前加一行记录回调，
// 回调是 globalThis.__DIAG_FINANCE__（由 tools/ec1-diag.mjs 安装）。源码里找不到那一行时原样返回，不报错（探针会在输出里说明未安装）。
// 用法：由 tools/ec1-diag.mjs 经 node:module register 载入；云上运行，本机不要运行。
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(url.endsWith('/server-plugin/finance-bank.mjs')&&result.source!=null){
  const text=String(result.source);
  const target="if(!Number.isSafeInteger(balance)||balance<0)throw preconditionFailure('当事人资金不足');";
  if(text.includes(target)){
   const patched="if(!Number.isSafeInteger(balance)||balance<0){globalThis.__DIAG_FINANCE__?.({id,delta,before:balance-delta,sourceEvent,d,e,stack:new Error().stack});throw preconditionFailure('当事人资金不足');}";
   return {...result,source:text.replace(target,patched)};
  }
 }
 return result;
}
