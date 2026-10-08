import { convertColonPathParams, normalisePath } from './pathUtils';

export function routePath(controllerPath: string, methodPath: string): string {
  return convertColonPathParams(normalisePath(`${controllerPath}/${methodPath}`, '/', '', false));
}

/** Register literal segments before unrestricted parameters. */
export function compareRoutePaths(left: string, right: string): number {
  const a = convertColonPathParams(left).split('/');
  const b = convertColonPathParams(right).split('/');
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const aParams = (a[index].match(/\{[^}]+\}/g) || []).length;
    const bParams = (b[index].match(/\{[^}]+\}/g) || []).length;
    if ((aParams === 0) !== (bParams === 0)) {
      return aParams === 0 ? -1 : 1;
    }
    if (aParams > 0 && bParams > 0) {
      const aLiteralLength = a[index].replace(/\{[^}]+\}/g, '').length;
      const bLiteralLength = b[index].replace(/\{[^}]+\}/g, '').length;
      if (aLiteralLength !== bLiteralLength) {
        return bLiteralLength - aLiteralLength;
      }
    }
    if (a[index] !== b[index] && aParams === 0 && bParams === 0) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return b.length - a.length;
}

export function routeSignature(method: string, path: string): string {
  return `${method.toUpperCase()} ${convertColonPathParams(path)
    .replace(/\{[^}]+\}/g, '{}')
    .toLowerCase()}`;
}
