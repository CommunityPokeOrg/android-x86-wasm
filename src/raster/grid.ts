/**
 * Geometry helpers mapping between three coordinate spaces:
 *
 *   guest pixels  <->  terminal cells  <->  DOM/CSS pixels on the canvas
 *
 * A terminal cell always covers `sx` guest pixels horizontally and `2*sy`
 * guest pixels vertically (half-block mode), or `sx` x `2*sy` in ascii mode
 * — identical geometry, different glyph choice.
 */

export interface CellGeometry {
  /** Guest pixels per cell horizontally. */
  sx: number;
  /** Guest pixels per half-cell vertically (full cell = 2*sy). */
  sy: number;
}

export interface GridDims {
  cols: number;
  rows: number;
}

export function gridDimsFor(
  guestWidth: number,
  guestHeight: number,
  geo: CellGeometry,
): GridDims {
  return {
    cols: Math.max(1, Math.floor(guestWidth / geo.sx)),
    rows: Math.max(1, Math.floor(guestHeight / (2 * geo.sy))),
  };
}

/**
 * Map a terminal cell + fractional offset inside it to guest pixel
 * coordinates. fx/fy are fractions in [0,1]: (0.5, 0.5) = cell center.
 */
export function cellToGuest(
  col: number,
  row: number,
  geo: CellGeometry,
  fx = 0.5,
  fy = 0.5,
): { x: number; y: number } {
  return {
    x: (col + fx) * geo.sx,
    y: (row + fy) * 2 * geo.sy,
  };
}

/** Map guest pixel coordinates to the cell that contains them. */
export function guestToCell(
  x: number,
  y: number,
  geo: CellGeometry,
): { col: number; row: number } {
  return {
    col: Math.floor(x / geo.sx),
    row: Math.floor(y / (2 * geo.sy)),
  };
}

/**
 * Convert a DOM point (CSS pixels relative to the canvas element's
 * border box) to a terminal cell, clamped into the grid.
 */
export function domPointToCell(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  dims: GridDims,
): { col: number; row: number } {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const cellW = rect.width / dims.cols;
  const cellH = rect.height / dims.rows;
  return {
    col: Math.min(dims.cols - 1, Math.max(0, Math.floor(px / cellW))),
    row: Math.min(dims.rows - 1, Math.max(0, Math.floor(py / cellH))),
  };
}

/**
 * Convert a DOM point + fractional position inside the hit cell to guest
 * pixel coordinates — the composition of domPointToCell and cellToGuest
 * that keeps sub-cell precision for smooth pointer tracking.
 */
export function domPointToGuest(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  dims: GridDims,
  geo: CellGeometry,
  guestWidth: number,
  guestHeight: number,
): { x: number; y: number; col: number; row: number } {
  const { col, row } = domPointToCell(clientX, clientY, rect, dims);
  const cellW = rect.width / dims.cols;
  const cellH = rect.height / dims.rows;
  const fx = (clientX - rect.left - col * cellW) / cellW;
  const fy = (clientY - rect.top - row * cellH) / cellH;
  const p = cellToGuest(col, row, geo, fx, fy);
  return {
    x: Math.min(guestWidth - 1, Math.max(0, p.x)),
    y: Math.min(guestHeight - 1, Math.max(0, p.y)),
    col,
    row,
  };
}
