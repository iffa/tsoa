import type { Widget } from './model';

export function makeThing(flag: boolean) {
  return flag ? { a: 1, nested: { name: 'x' } } : { a: 2, nested: null };
}

export async function loadWidget() {
  const widget: Widget = { id: 'x' };
  return { ...widget, extra: true as const };
}
