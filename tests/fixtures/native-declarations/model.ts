import { makeThing } from './service';

/** A widget */
export interface Widget {
  /**
   * The id
   * @pattern ^[a-z]+$
   */
  id: string;
}

export class ClassModel {
  public count = 7;

  public toJSON() {
    return { count: this.count, kind: 'class' as const };
  }
}

export enum Color {
  Red = 'red',
  Blue = 'blue',
}

export type Thing = ReturnType<typeof makeThing>;
