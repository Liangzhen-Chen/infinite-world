import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { chromium } from './node_modules/playwright-core/index.mjs';
import { setConfigFilePath } from '../SillyTavern/src/util.js';
setConfigFilePath(new URL('../SillyTavern/config.yaml', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const converters = await import('../SillyTavern/src/prompt-converters.js');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let captured;
try {
    const page = await browser.newPage();
    await page.route('**/api/backends/chat-completions/generate', async route => {
        captured = route.request().postDataJSON();
        await route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: '本地截获成功' } }] } });
    });
    await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.infiniteFields);
    await page.evaluate(async () => {
        const api = await import('/scripts/openai.js');
        await api.sendOpenAIRequest('quiet', [{ role: 'user', content: '安全抓包探针，不涉及游戏事件。' }], new AbortController().signal);
    });
    if (!captured || captured.chat_completion_source !== 'deepseek') throw new Error('没有截获 DeepSeek 浏览器请求');
} finally { await browser.close(); }

let upstream;
const receiver = http.createServer(async (req, res) => {
    let bytes = ''; for await (const chunk of req) bytes += chunk;
    upstream = JSON.parse(bytes);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '本地传输完成' } }] }));
});
receiver.listen(0, '127.0.0.1'); await once(receiver, 'listening');
try {
    const source = await fs.readFile(new URL('../SillyTavern/src/endpoints/backends/chat-completions.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function sendDeepSeekRequest(');
    const stop = source.indexOf('\n/**', start);
    const fn = source.slice(start, stop);
    const dependencies = { API_DEEPSEEK: 'https://api.deepseek.com/beta',
        readSecret: () => { throw new Error('探针禁止读取密钥'); }, SECRET_KEYS: {},
        ...Object.fromEntries(['addAssistantPrefix', 'postProcessPrompt', 'PROMPT_PROCESSING_TYPE', 'getPromptNames', 'addReasoningContentToToolCalls'].map(key => [key, converters[key]])),
        tryParse: JSON.parse, color: { yellow: text => text }, fetch,
        forwardFetchResponse: () => { throw new Error('探针不使用流式请求'); }, console: { debug() {}, warn() {}, error() {} } };
    const build = new Function(...Object.keys(dependencies), `${fn}\nreturn sendDeepSeekRequest;`);
    const send = build(...Object.values(dependencies));
    const body = { ...captured, stream: false, reverse_proxy: `http://127.0.0.1:${receiver.address().port}`, proxy_password: '[本地口令已抹]' };
    const request = { body, socket: { removeAllListeners() {}, on() {} }, user: { directories: {} } };
    const response = { headersSent: false, send(value) { this.value = value; }, status() { return this; } };
    await send(request, response);
    if (!upstream) throw new Error('后端未发出 HTTP 请求');
    const report = { date: '2026-10-10', method: '真实浏览器参数 + 已安装后端原函数 + 本地 HTTP 接收器',
        liveDeepSeekCall: false, credentialsRead: false, chatModified: false,
        backendFunctionSha256: createHash('sha256').update(fn).digest('hex'),
        frontend: { source: captured.chat_completion_source, model: captured.model, include_reasoning: captured.include_reasoning,
            reasoning_effort: captured.reasoning_effort, temperature: captured.temperature, max_tokens: captured.max_tokens },
        outbound: { model: upstream.model, thinking: upstream.thinking, reasoning_effort: upstream.reasoning_effort ?? null, temperature: upstream.temperature } };
    await fs.writeFile('docs/测试报告/阶段0请求抓包.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally { receiver.close(); }
