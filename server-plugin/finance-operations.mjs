// Shared dispatch names have no runtime dependencies, so finance modules can
// import one another without reading an uninitialized operation set.
export const BANK_OPERATIONS=new Set(['bank_inspect','extend','prepay','lend','collect','pawn','redeem','auction','remit','cash_bill','report_lost']);
export const ASSET_OPERATIONS=new Set(['asset_inspect','invest','dividend','share_transfer','rent_out','rent_in','workshop','workshop_stock','workshop_terms','dismiss','labor_inspect','labor_guarantee','labor_mediate','labor_poach']);
export const CREDIT_OPERATIONS=new Set(['borrow','deposit','withdraw','exchange','work','partner',...BANK_OPERATIONS,...ASSET_OPERATIONS]);
