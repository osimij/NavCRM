// The shape of the NavCRM world that layout needs before the renderer loads: the frame of each
// composition and the cumulus tower's design. js/art/sky.js renders from these, and
// js/sections/hero.js uses them to place the painting so the tower clears the copy.

/** A frame `width` world units wide, from `top` above the horizon to `bottom` below it. */
export const frame = (width, top, bottom) => ({ aspect: width / (top - bottom), hz: -bottom / (top - bottom), span: top - bottom, width, top, bottom });

// The cumulus tower, designed as a painter blocks one in: a foot in the cloud sea, a column of
// turrets stacked with alternating offsets, and a crown wider than its neck, built of large,
// medium and small billows. The small billows sit only on the sunlit crown, where the light
// rakes across them. A lobe is [x, y, r, g, lvl, dz]: lvl 0 is a mass (it casts the big shadows
// and makes up the envelope the light turns on), 1 a medium lump, 2 a small billow; g is how
// many billows it sprouts (0: the design is final); dz sets it back in depth. Units: k = 1.
export const TOWER = [
  // foot, in the sea
  [-1.2, 0.1, 0.65], [-0.2, 0.25, 0.9], [0.95, 0.15, 0.75, 0, 0, 0.35],
  // body: turrets stacked with alternating offsets
  [-0.35, 1.25, 1.0], [0.6, 1.05, 0.78], [-0.55, 2.15, 0.85], [0.45, 2.2, 0.8], [-0.25, 2.95, 0.88],
  // crown, wider than the neck: three big billows and two on top
  [-0.95, 3.7, 0.78], [0.15, 3.95, 0.92], [0.9, 3.72, 0.85, 0, 0, 0.25], [-0.45, 4.6, 0.62], [0.5, 4.65, 0.6, 0, 0, 0.15],
  // medium lumps on the outlines: crisp on the sunlit crown, broad and set back in the shade
  [-1.45, 4.05, 0.42, 0, 1], [-1.15, 4.65, 0.4, 0, 1], [-0.6, 5.08, 0.44, 0, 1], [0.15, 5.22, 0.38, 0, 1], [0.62, 5.0, 0.34, 0, 1],
  [1.45, 3.62, 0.5, 0, 1, 0.35],
  [-1.3, 1.3, 0.55, 0, 1], [-1.35, 2.3, 0.48, 0, 1], [-1.15, 3.05, 0.55, 0, 1],
  [1.25, 1.6, 0.5, 0, 1], [1.05, 2.75, 0.45, 0, 1],
  // small billows, only on the sunlit crown, unevenly sized and spaced
  [-1.62, 4.5, 0.24, 0, 2], [-0.98, 5.12, 0.18, 0, 2], [-0.25, 5.45, 0.26, 0, 2], [0.38, 5.42, 0.17, 0, 2],
];

/**
 * The tower's silhouette in world units, for layout: for heights from its base to its top, the
 * left and right edge (with a little air for the halo). x and k place and scale it as tower() does.
 */
export function towerOutline(x = 0, k = 1, step = 0.1, air = 0.12) {
  const rows = [];
  let top = -Infinity;
  for (const [, ly, r] of TOWER) top = Math.max(top, ly + r);
  for (let y = 0; y <= top; y += step) {
    let l = Infinity, rr = -Infinity;
    for (const [lx, ly, r] of TOWER) {
      const dy = y - ly;
      if (Math.abs(dy) >= r) continue;
      const h = Math.sqrt(r * r - dy * dy);
      l = Math.min(l, lx - h);
      rr = Math.max(rr, lx + h);
    }
    if (l < Infinity) rows.push([y * k, x + (l - air) * k, x + (rr + air) * k]);
  }
  return { rows, top: top * k, left: Math.min(...rows.map((r) => r[1])), right: Math.max(...rows.map((r) => r[2])) };
}

// Each composition's frame and where its tower stands ([x, scale]). Desktop and tablets share one
// wide frame, so the painting can slide and scale behind the copy; phones have their own.
export const FRAMES = {
  desktop: { ...frame(26, 9, -8), tower: [6.5, 1] },
  phone: { ...frame(6.8, 14, -12), tower: [1.35, 0.68] },
};
