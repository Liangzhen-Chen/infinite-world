// Display unit of a claim/payment row (S5-F): reference coins read as 铜, anything else by its own recorded name.
// Leaf module on purpose: notices and summaries import it without pulling in the economy.
export const claimUnit=row=>row?.resource&&row.resource!=='coin_river'?(row.resourceName??row.resource):'铜';
