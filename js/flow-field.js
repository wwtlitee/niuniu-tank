(function flowFieldFactory(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FlowField = api.FlowField;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFlowFieldApi() {
  "use strict";

  const DIRECTIONS = Object.freeze([
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ]);

  class MinHeap {
    constructor() { this.items = []; }
    push(item) {
      let index = this.items.push(item) - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (this.items[parent].distance <= item.distance) break;
        this.items[index] = this.items[parent];
        index = parent;
      }
      this.items[index] = item;
    }
    pop() {
      if (!this.items.length) return null;
      const root = this.items[0];
      const tail = this.items.pop();
      if (this.items.length) {
        let index = 0;
        while (true) {
          let child = index * 2 + 1;
          if (child >= this.items.length) break;
          if (child + 1 < this.items.length && this.items[child + 1].distance < this.items[child].distance) child++;
          if (this.items[child].distance >= tail.distance) break;
          this.items[index] = this.items[child];
          index = child;
        }
        this.items[index] = tail;
      }
      return root;
    }
    get size() { return this.items.length; }
  }

  class FlowField {
    constructor(width, height = width) {
      this.width = width;
      this.height = height;
      this.distances = new Float32Array(width * height);
      this._passable = () => false;
      this._canStep = () => true;
      this.computeCount = 0;
      this.distances.fill(Infinity);
    }
    contains(x, z) { return x >= 0 && x < this.width && z >= 0 && z < this.height; }
    index(x, z) { return z * this.width + x; }
    distanceAt(x, z) { return this.contains(x, z) ? this.distances[this.index(x, z)] : Infinity; }
    _canTraverse(ax, az, bx, bz) {
      if (!this.contains(bx, bz) || !this._passable(bx, bz) || !this._canStep(ax, az, bx, bz)) return false;
      const dx = bx - ax, dz = bz - az;
      if (dx && dz) {
        if (!this._passable(ax + dx, az) || !this._passable(ax, az + dz)) return false;
        if (!this._canStep(ax, az, ax + dx, az) || !this._canStep(ax, az, ax, az + dz)) return false;
      }
      return true;
    }
    compute(targetCells, { passable, canStep = () => true }) {
      this.computeCount += 1;
      this._passable = passable;
      this._canStep = canStep;
      this.distances.fill(Infinity);
      const heap = new MinHeap();
      for (const target of targetCells) {
        if (!this.contains(target.x, target.z) || !passable(target.x, target.z)) continue;
        const index = this.index(target.x, target.z);
        this.distances[index] = 0;
        heap.push({ x: target.x, z: target.z, distance: 0 });
      }
      while (heap.size) {
        const current = heap.pop();
        if (current.distance > this.distanceAt(current.x, current.z) + 1e-5) continue;
        for (const [dx, dz, cost] of DIRECTIONS) {
          const x = current.x + dx, z = current.z + dz;
          // Distances propagate backwards from the destination; the actual step is x,z -> current.
          if (!this.contains(x,z) || !passable(x,z) || !this._canTraverse(x, z, current.x, current.z)) continue;
          const distance = current.distance + cost;
          const index = this.index(x, z);
          if (distance >= this.distances[index]) continue;
          this.distances[index] = distance;
          heap.push({ x, z, distance });
        }
      }
      return this;
    }
    directionAt(x, z) {
      const here = this.distanceAt(x, z);
      if (!Number.isFinite(here) || here <= 0) return { x: 0, z: 0 };
      let best = null;
      let bestDistance = Infinity;
      for (const [dx, dz, cost] of DIRECTIONS) {
        const nx = x + dx, nz = z + dz;
        if (!this._canTraverse(x, z, nx, nz)) continue;
        const distance = this.distanceAt(nx, nz);
        if (distance < here - 1e-5 && distance + cost < bestDistance - 1e-5) {
          bestDistance = distance + cost;
          best = { x: dx, z: dz };
        }
      }
      if (!best) return { x: 0, z: 0 };
      const length = Math.hypot(best.x, best.z);
      return { x: best.x / length, z: best.z / length };
    }
  }

  return { FlowField, DIRECTIONS };
});
