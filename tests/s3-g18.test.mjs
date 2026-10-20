import test from 'node:test';
import {equityLiabilityScenario,businessMembershipScenario} from './probes/s3-business-equity.mjs';
test('E18-1 signed shareholder liability and judicial wage seizure',equityLiabilityScenario);
test('E18-4 business membership, dues, known rumor and expulsion',businessMembershipScenario);
