// T105 W4-B2: ten bosses published through L1/L2/L4; checks keyed to this batch.
import {defineBatchTests} from './w4-boss-batch-checks.mjs';
await defineBatchTests('w4-b2',{balanceFile:'world/design/w4-b2-balance.json',tiers:[1,2,4,5,6,8,9]});
