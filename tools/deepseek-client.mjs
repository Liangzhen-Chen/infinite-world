import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

// Peak rates form a conservative ceiling even on weekends. Source verified
// 2026-10-10: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
export class DeepSeekClient {
    constructor({ budgetYuan = 60, logFile = 'logs/deepseek-usage.jsonl' } = {}) {
        this.budgetYuan = budgetYuan; this.spent = 0; this.reserved = 0; this.logFile = logFile;
        this.rates = { hit: 0.04, miss: 2, output: 8 };
    }
    async generate(body, label = 'development') {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) throw new Error('DEEPSEEK_API_KEY 环境变量未配置');
        const request = { model: 'deepseek-flash', max_tokens: 1800, stream: false, thinking: { type: 'disabled' }, ...body };
        function sanitizeSchema(value){
            if(!value||typeof value!=='object')return;
            if(Array.isArray(value.required)&&!value.required.length)delete value.required;
            for(const child of Object.values(value))sanitizeSchema(child);
        }
        if(request.tools){request.tools=structuredClone(request.tools);sanitizeSchema(request.tools);}
        if (request.model !== 'deepseek-flash' || request.stream) throw new Error('当前计费护栏只支持 Flash 非流式请求');
        const encoded = JSON.stringify(request);
        // UTF-8 bytes overestimate ordinary text token usage. Reserve the full
        // output limit, including reasoning, before starting a request.
        const ceiling = (Buffer.byteLength(encoded) * this.rates.miss + request.max_tokens * this.rates.output) / 1e6;
        if (this.spent + this.reserved + ceiling > this.budgetYuan) throw new Error(`测试达到${this.budgetYuan}元费用上限，已停止`);
        this.reserved += ceiling;
        const started = performance.now();
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: encoded,
                signal: AbortSignal.timeout(180000),
            });
            const data = await response.json();
            if (!response.ok) {
                const detail=String(data.error?.message??'').replaceAll(key,'[凭据已屏蔽]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [已屏蔽]').slice(0,1500);
                throw new Error(`DeepSeek HTTP ${response.status}，错误代码${data.error?.code ?? 'unknown'}：${detail}`);
            }
            if (!data.usage) throw new Error('DeepSeek 未返回用量，费用无法核实，停止本轮');
            const usage = data.usage;
            const hit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
            const miss = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens - hit;
            const costUpperYuan = (hit * this.rates.hit + miss * this.rates.miss + usage.completion_tokens * this.rates.output) / 1e6;
            this.spent += costUpperYuan;
            const record = { label, model: request.model, thinking: request.thinking.type, usage, costUpperYuan,
                cumulativeUpperYuan: this.spent, latencyMs: performance.now() - started, timestamp: new Date().toISOString() };
            await fs.mkdir(new URL('../logs', import.meta.url), { recursive: true });
            await fs.appendFile(this.logFile, `${JSON.stringify(record)}\n`);
            return { ...data, measurement: record };
        } catch (error) {
            // A transport failure can still have consumed tokens. Charge the
            // reservation conservatively so retries cannot evade the guard.
            this.spent += ceiling;
            throw error;
        } finally { this.reserved -= ceiling; }
    }
}
