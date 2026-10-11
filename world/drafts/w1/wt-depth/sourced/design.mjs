import * as original from '../../../../design/w1-wt-depth.mjs';

// Source-only extension. The original before, patches and revision are retained.
export const revision=original.revision;
export const incrementLimitYuan=original.incrementLimitYuan;
export const authorBatches=original.authorBatches;
export const patchRows=original.patchRows.map(row=>({
 ...structuredClone(row),
 referenceRelationshipIds:[row.id],
 referenceMemoryIds:authorBatches.find(batch=>batch.ids.includes(row.id)).ids.slice(),
}));
