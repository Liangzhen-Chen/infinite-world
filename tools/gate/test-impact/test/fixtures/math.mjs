export const label = '原野🪵';
export function alpha() {
  return 'alpha';
}
export function beta() {
  return 'beta';
}
export function unused() {
  return 'unused';
}
export function outer() {
  function inner() {
    return 'inner';
  }
  return inner();
}
