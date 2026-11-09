import fs from 'node:fs';
const WIN_DEFAULT='C:/Program Files/Google/Chrome/Application/chrome.exe';
export function browserExecutablePath(){
  const env=process.env.BROWSER_EXECUTABLE;
  if(env)return env;
  if(fs.existsSync(WIN_DEFAULT))return WIN_DEFAULT;
  throw new Error('未找到浏览器：请设置环境变量 BROWSER_EXECUTABLE 指向 Chrome/Chromium 可执行文件（例如 /usr/bin/chromium）');
}
