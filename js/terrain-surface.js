(function terrainSurfaceFactory(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TerrainSurface = api.TerrainSurface;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTerrainSurfaceApi() {
  "use strict";

  class TerrainSurface {
    constructor({ width, gridSize, originX, originZ }) {
      if (!Number.isInteger(width) || width <= 0) throw new TypeError("width must be a positive integer");
      if (!(gridSize > 0)) throw new TypeError("gridSize must be positive");
      this.width = width;
      this.gridSize = gridSize;
      this.originX = originX;
      this.originZ = originZ;
      this.heights = new Float32Array(width * width);
      this.ramps = new Array(width * width).fill(null);
    }

    index(cellX, cellZ) { return cellZ * this.width + cellX; }
    containsCell(cellX, cellZ) { return cellX >= 0 && cellX < this.width && cellZ >= 0 && cellZ < this.width; }
    worldToCell(worldX, worldZ) {
      return {
        x: Math.floor((worldX - this.originX) / this.gridSize),
        z: Math.floor((worldZ - this.originZ) / this.gridSize),
      };
    }
    cellCenter(cellX, cellZ) {
      return {
        x: this.originX + (cellX + 0.5) * this.gridSize,
        z: this.originZ + (cellZ + 0.5) * this.gridSize,
      };
    }
    setHeight(cellX, cellZ, height) {
      if (!this.containsCell(cellX, cellZ)) throw new RangeError("terrain cell is outside the map");
      if (!Number.isFinite(height)) throw new TypeError("height must be finite");
      const index = this.index(cellX, cellZ);
      this.heights[index] = height;
      this.ramps[index] = null;
    }
    setRamp(cellX, cellZ, { uphillX, uphillZ, base, rise }) {
      if (!this.containsCell(cellX, cellZ)) throw new RangeError("terrain cell is outside the map");
      if (Math.abs(uphillX) + Math.abs(uphillZ) !== 1) throw new TypeError("ramp direction must be cardinal");
      if (!Number.isFinite(base) || !Number.isFinite(rise)) throw new TypeError("ramp values must be finite");
      const index = this.index(cellX, cellZ);
      this.heights[index] = base;
      this.ramps[index] = Object.freeze({
        uphillX, uphillZ, base, rise,
        x: uphillX, z: uphillZ, step: rise,
      });
    }
    sample(worldX, worldZ) {
      const cell = this.worldToCell(worldX, worldZ);
      if (!this.containsCell(cell.x, cell.z)) {
        return { height: 0, kind: "outside", cell, normal: { x: 0, y: 1, z: 0 } };
      }
      const index = this.index(cell.x, cell.z);
      const ramp = this.ramps[index];
      if (!ramp) return { height: this.heights[index], kind: "flat", cell, normal: { x: 0, y: 1, z: 0 } };
      const center = this.cellCenter(cell.x, cell.z);
      const minX = center.x - this.gridSize / 2;
      const maxX = center.x + this.gridSize / 2;
      const minZ = center.z - this.gridSize / 2;
      const maxZ = center.z + this.gridSize / 2;
      let t;
      if (ramp.uphillX > 0) t = (worldX - minX) / this.gridSize;
      else if (ramp.uphillX < 0) t = (maxX - worldX) / this.gridSize;
      else if (ramp.uphillZ > 0) t = (worldZ - minZ) / this.gridSize;
      else t = (maxZ - worldZ) / this.gridSize;
      t = Math.max(0, Math.min(1, t));
      const dx = ramp.uphillX * ramp.rise / this.gridSize;
      const dz = ramp.uphillZ * ramp.rise / this.gridSize;
      const length = Math.hypot(dx, 1, dz);
      return {
        height: ramp.base + t * ramp.rise,
        kind: "ramp",
        cell,
        normal: { x: -dx / length, y: 1 / length, z: -dz / length },
      };
    }
    heightAt(worldX, worldZ) { return this.sample(worldX, worldZ).height; }
    intersectRay(origin, direction, { maxDistance = 500, step = this.gridSize / 4 } = {}) {
      const magnitude = Math.hypot(direction.x, direction.y, direction.z);
      if (!(magnitude > 0)) throw new TypeError("ray direction must be non-zero");
      const ray = { x: direction.x / magnitude, y: direction.y / magnitude, z: direction.z / magnitude };
      const gapAt = (distance) => {
        const x = origin.x + ray.x * distance;
        const y = origin.y + ray.y * distance;
        const z = origin.z + ray.z * distance;
        return { x, y, z, gap: y - this.heightAt(x, z) };
      };
      let previousDistance = 0;
      let previous = gapAt(0);
      if (previous.gap <= 0) return { x: previous.x, y: this.heightAt(previous.x, previous.z), z: previous.z, distance: 0 };
      for (let distance = step; distance <= maxDistance; distance += step) {
        const current = gapAt(distance);
        if (current.gap <= 0) {
          let low = previousDistance;
          let high = distance;
          for (let iteration = 0; iteration < 24; iteration++) {
            const middle = (low + high) / 2;
            if (gapAt(middle).gap > 0) low = middle;
            else high = middle;
          }
          const hit = gapAt(high);
          return { x: hit.x, y: this.heightAt(hit.x, hit.z), z: hit.z, distance: high };
        }
        previousDistance = distance;
        previous = current;
      }
      return null;
    }
    visualOriginY({ boundsMaxY, scale, surfaceY }) {
      if (![boundsMaxY, scale, surfaceY].every(Number.isFinite)) throw new TypeError("visual placement values must be finite");
      return surfaceY - boundsMaxY * scale;
    }
  }

  return { TerrainSurface };
});
