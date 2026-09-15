import type { CellGeometry } from "../raster/grid";

export interface GeoPreset extends CellGeometry {
  label: string;
}

export const GEO_PRESETS: GeoPreset[] = [
  { label: "High — 1×2 px/cell", sx: 1, sy: 1 },
  { label: "Medium — 2×4 px/cell", sx: 2, sy: 2 },
  { label: "Low — 4×8 px/cell", sx: 4, sy: 4 },
];
