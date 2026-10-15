// T106 W4-B3: ten bosses published through L1/L2/L4; checks keyed to this batch.
// After this batch the catalog covers boss tiers one through nine.
import {defineBatchTests} from './w4-boss-batch-checks.mjs';
await defineBatchTests('w4-b3',{balanceFile:'world/design/w4-b3-balance.json',tiers:[1,2,3,4,5,6,7,8,9]});
