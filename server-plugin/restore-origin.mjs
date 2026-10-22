// Historical-restore interfaces (restore*Snapshot, restoreCoinAccount and the
// like) rebuild facts the campaign setup or a migration vouches for, including
// ones that originate value such as an opening balance from src:genesis. They
// are never game actions: a caller must declare the setup/migration origin.
export const RESTORE_ORIGINS=Object.freeze(['initial','migration']);
export function requireRestoreOrigin(origin,what){
 if(!RESTORE_ORIGINS.includes(origin))throw Error(`${what} is a setup/migration interface and cannot be called as a game action`);
}
