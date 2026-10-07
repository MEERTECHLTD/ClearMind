// Minimal typings for the parts of d3-quadtree the graph uses (the package ships none
// and @types/d3-quadtree isn't installed).
declare module 'd3-quadtree' {
  export interface Quadtree<T> {
    x(): (d: T) => number;
    x(fn: (d: T) => number): Quadtree<T>;
    y(): (d: T) => number;
    y(fn: (d: T) => number): Quadtree<T>;
    addAll(data: readonly T[]): Quadtree<T>;
    find(x: number, y: number, radius?: number): T | undefined;
    visit(cb: (node: unknown, x0: number, y0: number, x1: number, y1: number) => boolean | void): Quadtree<T>;
  }
  export function quadtree<T>(): Quadtree<T>;
  export function quadtree<T>(data: readonly T[], x?: (d: T) => number, y?: (d: T) => number): Quadtree<T>;
}
