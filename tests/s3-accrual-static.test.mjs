import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Settlement/payment events may update paid and accruedTo. A daily loop that
// increments a stored debt/interest balance is forbidden by 01 §1.4.
const dailyAccumulation=/for\s*\([^)]*(?:day\+\+|\+=\s*(?:DAY|1440))[^)]*\)\s*\{[^}]*\b(?:amount|interest|accrued|balance)\s*(?:\+=|=\s*\w+\.(?:amount|interest|balance)\s*\+)/s;
test('义务模块没有逐日增加累计债务余额的写法',async()=>{
    const files=['obligation-state','obligation-kinds','contracts','credit','finance-bank','finance-assets','office-salary'];
    for(const file of files){
        const src=await fs.readFile(new URL(`../server-plugin/${file}.mjs`,import.meta.url),'utf8');
        assert.equal(dailyAccumulation.test(src),false,file);
    }
    assert.equal(dailyAccumulation.test('for(let at=0;at<end;at+=DAY){ row.interest += dailyInterest; }'),true);
});
