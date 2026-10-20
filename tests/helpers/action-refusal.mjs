import assert from 'node:assert/strict';

// 06 §6.10.4: routed business failures return rejected receipts. Preserve the
// original reason checks, and require the stronger zero-effects contract.
export async function assertActionRejected(promise,reason,code='E-ACTION-PRECONDITION'){
 const value=await promise,reduced=value.out??value,receipt=reduced.result?.receipt??reduced.receipt;
 assert.equal(receipt?.status,'rejected');if(code!==null)assert.equal(receipt.code,code);else assert.match(receipt.code,/^E-/);
 assert.ok(receipt.reason);
 if(reason)assert.match(receipt.reason,reason);
 assert.deepEqual(receipt.applied,[]);assert.deepEqual(receipt.events,[]);
 assert.deepEqual(receipt.cost,{time:0,resources:[]});
 assert.ok(receipt.missing.length&&receipt.repair.length);
 if(reduced.result){assert.equal(reduced.result.ok,false);assert.deepEqual(reduced.patches,[]);}
 return receipt;
}
