// Painted sky: the NavCRM world, rendered once with WebGL2 and finished like a painting.
//
// One world, one sun: a late-October morning above the Dushanbe valley. A sunlit cloud sea
// (a temperature inversion) fills the valley, a cumulus tower rises on the right, and the
// snow of the Hisor range breaks through the haze. Every plate on the page is a framing of
// this world (a composition) under a light (a time of day).
//
// The frame is made in two stages:
//   1. scene: cumulus are sphere-traced from designed lobes, the range is a heightfield of
//      placed peaks, the sea is a field of billows; all lit by one low sun with painted value
//      planes (light, warm half-tone, cool shadow, reflected light);
//   2. paint: an anisotropic Kuwahara filter, sized in composition units, flattens small
//      detail into brush-like planes that follow the forms, so the render reads as a painting
//      and the still and the live render match at any resolution.
// Work is issued in fenced strips so no frame hands the GPU much more than a frame of work.

import { frame, TOWER, FRAMES } from './frames.js';

export { frame };

/* ====================================================================== shaders */

const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Palette slots (display-space sRGB). Kept in one array so lights are plain data.
const PAL = [
  'skyZen', 'skyMid', 'skyHor', 'skyGlow', 'skyBand',
  'clLit', 'clLit2', 'clHalf', 'clShUp', 'clShDn', 'clRefl', 'clRim',
  'seaLit', 'seaLit2', 'seaShLo', 'seaShHi',
  'rockLit', 'rockSh', 'snowLit', 'snowSh', 'snowShUp',
  'haze', 'bg', 'halo',
];
const palDefines = PAL.map((k, i) => `#define P_${k} uPal[${i}]`).join('\n');

const SCENE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp usampler2D;

uniform sampler3D uNoise;     // r: gradient noise, g: Worley F1
uniform sampler2D uNoise2;    // r: tileable 2D gradient noise, period 32
uniform sampler2D uLobes;     // row 0: x y z r, row 1: haze base billow crown, row 2: halo level cx crownAmp,
                              // row 3: the whole cloud as one ellipsoid: centre y, radius x, radius y, centre z
uniform usampler2D uCells;    // per tile: index list offset, count
uniform usampler2D uIdx;      // lobe indices
uniform vec2 uGrid;
uniform vec2 uOrigin;         // pixel offset of this target inside the composition (from bottom-left)
uniform vec2 uFull;           // full composition size in pixels
uniform float uAspect;
uniform float uHz;
uniform float uSpan;          // composition height in world units
uniform vec4 uPeaks[24];      // x, z, height, radius (world)
uniform vec4 uPeakB[24];      // aretes, phase, gully depth, wobble
uniform int uNP;
uniform vec4 uBig[32];        // designed cloud masses
uniform float uBigBase[32];
uniform int uNB;
uniform float uSnow;
uniform float uFade;
uniform vec3 uSea;            // cloud sea: level, relief, scale
uniform vec3 uSun;
uniform vec3 uSeaSun;
uniform float uRowsZ;         // depth from which the sea is painted as rows of billow tops
uniform float uRough;         // relief of the range's faces
uniform vec3 uLandSun;        // the sun stated for the range: from the left, so its faces split into light and shade
uniform vec4 uGlow;           // sun glow centre (world), glow amount, horizon band amount
uniform vec4 uMood;           // x: stars, y: cloud haze lift, z: land haze, w: sea brightness
uniform float uTex;           // strength of the paint's body in the clouds
uniform float uMidK;          // how broadly the turrets blend for the light (larger: fewer, bigger planes)
uniform float uBias;          // shifts the terminator: lower puts more of the cloud in shade
uniform float uTerm;          // how far the cloud terminator follows the single masses (1) or the whole form (0)
uniform vec3 uPal[${PAL.length}];
${palDefines}

out vec4 frag;

#define FOC 10.0
#define CAMH 1.0

float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }

float hash12(vec2 p){
  uvec2 v = uvec2(ivec2(p) + 32768);
  v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u; v.x += v.y * 1664525u;
  return float(v.x & 65535u) / 65535.0;
}
float tn(vec2 p){ return texture(uNoise2, p * (1.0 / 32.0)).r; }
float dome(vec3 q){ float f = texture(uNoise, q).g; return sqrt(max(0.0, 1.0 - f * f * 1.15)); }

/* ---------- sky ---------- */
vec3 skyCol(vec2 w){
  float t = clamp(w.y / 6.6, 0.0, 1.0);
  vec3 c = mix(toLin(P_skyHor), toLin(P_skyMid), smoothstep(0.0, 0.42, t));
  c = mix(c, toLin(P_skyZen), smoothstep(0.3, 1.0, t));
  // light pooling on the sun side
  float g = exp(-length((w - uGlow.xy) * vec2(0.55, 1.0)) * 0.19);
  c = mix(c, toLin(P_skyGlow), g * uGlow.z);
  // a low band of warmth along the horizon, stronger toward the sun
  float band = exp(-max(w.y, 0.0) * 1.1) * (0.55 + 0.45 * smoothstep(8.0, -8.0, w.x - uGlow.x * 0.3));
  c = mix(c, toLin(P_skyBand), band * uGlow.w);
  // broad, faint horizontal strokes, strongest high in the sky
  float stroke = tn(w * vec2(0.07, 0.42) + vec2(3.1, 0.0)) * 0.6 + tn(w * vec2(0.16, 0.9) + vec2(7.7, 2.0)) * 0.4;
  c *= 1.0 + stroke * 0.022 * smoothstep(0.5, 4.0, w.y);
  return c;
}

/* ---------- clouds ---------- */
vec3 seaHaze(vec2 w);
int lp[64]; int np;
int lm[32]; int nm;          // the designed masses and medium lumps under this pixel (no small billows)
float zN, zF; vec4 gAttr, gAttr2, gAttr3;

vec4 lobe(int i){ return texelFetch(uLobes, ivec2(i, 0), 0); }
int idxAt(uint k){ return int(texelFetch(uIdx, ivec2(int(k & 2047u), int(k >> 11u)), 0).r); }

void gather(vec2 fc, vec2 w){
  np = 0; nm = 0; zN = 1e4; zF = -1e4;
  ivec2 cc = ivec2(clamp(floor(fc / uFull * uGrid), vec2(0.0), uGrid - 1.0));
  uvec4 cell = texelFetch(uCells, cc, 0);
  for (uint k = 0u; k < 160u; k++){
    if (k >= cell.y) break;
    int id = idxAt(cell.x + k);
    vec4 s = lobe(id);
    vec2 d = s.xy - w; float m = s.w + 0.3;
    if (dot(d, d) < m * m && np < 64){
      lp[np] = id; np++; zN = min(zN, s.z - s.w); zF = max(zF, s.z + s.w);
      if (nm < 32 && texelFetch(uLobes, ivec2(id, 2), 0).y < 1.5){ lm[nm] = id; nm++; }
    }
  }
  if (np > 0){
    gAttr = texelFetch(uLobes, ivec2(lp[0], 1), 0);
    gAttr2 = texelFetch(uLobes, ivec2(lp[0], 2), 0);
    gAttr3 = texelFetch(uLobes, ivec2(lp[0], 3), 0);
  }
}

float billow(vec3 p, float fine){
  vec3 q = p * 0.55;
  float b = dome(q) * 0.6 + dome(q * 2.2 + vec3(0.37, 0.11, 0.73)) * 0.4;
  // the crown gets a finer octave: crisp cauliflower along the sunlit silhouette
  return b + (dome(q * 4.9 + vec3(0.71, 0.29, 0.53)) - 0.55) * 0.3 * fine;
}
float sdP(vec3 p){
  float d = 1e4;
  // small lumps join with a small fillet so they stay crisp; big masses blend broadly
  for (int k = 0; k < 64; k++){ if (k >= np) break; vec4 s = lobe(lp[k]); d = smin(d, length(p - s.xyz) - s.w, clamp(0.16 * s.w, 0.025, 0.12)); }
  d = smax(d, gAttr.y - p.y, 0.22);
  // billows are small and busy in the crown on the sun side, broad and quiet in the body
  float cr = smoothstep(gAttr.w - 1.2, gAttr.w + 0.6, p.y);
  float sunSide = smoothstep(0.9, -0.6, p.x - gAttr2.z);
  float amp = gAttr.z * (0.3 + gAttr2.w * cr * mix(0.3, 1.0, sunSide));
  if (d < 0.2) d -= (billow(p, cr) - 0.5) * amp * smoothstep(gAttr.y, gAttr.y + 0.7, p.y);
  return d;
}
// the medium form: masses and lumps, smooth, without the small billows. Light planes follow it.
float sdMid(vec3 p){
  float d = 1e4;
  for (int k = 0; k < 32; k++){ if (k >= nm) break; vec4 s = lobe(lm[k]); d = smin(d, length(p - s.xyz) - s.w, uMidK); }
  return smax(d, gAttr.y - p.y, 0.3);
}
vec3 nrmMid(vec3 p){
  const float e = 0.03; const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * sdMid(p + k.xyy * e) + k.yyx * sdMid(p + k.yyx * e) + k.yxy * sdMid(p + k.yxy * e) + k.xxx * sdMid(p + k.xxx * e));
}
// occlusion of the medium form: deep where one mass tucks under another
float aoMid(vec3 p, vec3 n){
  float o = 0.0;
  for (int i = 1; i <= 3; i++){
    float h = 0.14 * float(i);
    o += (h - sdMid(p + n * h)) / float(i);
  }
  return clamp(1.0 - 1.5 * o, 0.0, 1.0);
}
float sdBig(vec3 p){
  float d = 1e4;
  for (int k = 0; k < 32; k++){
    if (k >= uNB) break;
    vec4 s = uBig[k];
    float dk = length(p - s.xyz) - s.w;
    dk = smax(dk, uBigBase[k] - p.y, 0.4);
    d = smin(d, dk, 0.35);
  }
  return d;
}
// the whole cloud as one soft envelope of its masses: the form a painter blocks in first
float sdEnv(vec3 p){
  float d = 1e4;
  for (int k = 0; k < 32; k++){
    if (k >= uNB) break;
    vec4 s = uBig[k];
    d = smin(d, length(p - s.xyz) - s.w, 1.2);
  }
  return d;
}
vec3 nrmEnv(vec3 p){
  const float e = 0.15; const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * sdEnv(p + k.xyy * e) + k.yyx * sdEnv(p + k.yyx * e) + k.yxy * sdEnv(p + k.yxy * e) + k.xxx * sdEnv(p + k.xxx * e));
}
vec3 nrmP(vec3 p){
  const float e = 0.012; const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * sdP(p + k.xyy * e) + k.yyx * sdP(p + k.yyx * e) + k.yxy * sdP(p + k.yxy * e) + k.xxx * sdP(p + k.xxx * e));
}
vec3 nrmBig(vec3 p){
  const float e = 0.1; const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * sdBig(p + k.xyy * e) + k.yyx * sdBig(p + k.yyx * e) + k.yxy * sdBig(p + k.yxy * e) + k.xxx * sdBig(p + k.xxx * e));
}
float shadowBig(vec3 p){
  float res = 1.0, t = 0.1;
  for (int i = 0; i < 24; i++){
    float h = sdBig(p + uSun * t);
    res = min(res, 4.0 * h / t);
    t += clamp(h, 0.08, 0.6);
    if (res < 0.005 || t > 7.0) break;
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}
float aoP(vec3 p, vec3 n){
  float o = 0.0, sc = 1.0;
  for (int i = 1; i <= 4; i++){
    float h = 0.045 * float(i);
    o += (h - sdP(p + n * h)) * sc; sc *= 0.7;
  }
  return clamp(1.0 - 3.2 * o, 0.0, 1.0);
}

float gLit, gEdge, gMinD, gHalo, gLow, gUp;



// Painted value planes: light, a warm half-tone band where each mass turns from the sun, cool
// shadow, and reflected light from the sunlit sea on the undersides. The big designed form
// carries the light across the face, so the lit side reads as a few large planes; the small
// billows only speak at the silhouette and in the crown, where the sun rakes across them.
vec3 shadeCloud(vec3 p, vec2 w){
  vec3 nd = nrmP(p);
  vec3 ns = nrmBig(p);
  vec3 nmid = nrmMid(p);
  float edge = 1.0 - abs(nmid.z);
  float cr = smoothstep(gAttr.w - 0.9, gAttr.w + 0.7, p.y);
  // the light follows the turrets (the masses and their lumps); the small billows only speak at
  // the sunlit silhouette of the crown
  float wd = 0.05 + 0.45 * smoothstep(0.6, 0.95, edge) * cr;
  vec3 n = normalize(mix(nmid, nd, wd));
  float ndl = dot(n, uSun);
  float sb = sdBig(p);
  float sh = shadowBig(p + ns * (max(0.0, -sb) + 0.06));
  float ao = aoP(p, nd);
  float hgt = smoothstep(gAttr.y + 0.2, gAttr.w + 1.0, p.y);
  // Blocked in as a painter does it: the whole cloud is one form that turns from the sun (env),
  // and every turret on it turns on its own (ndl), so the terminator runs around each turret
  // in a scalloped line instead of one long cut. uTerm sets how much the turrets speak.
  vec3 nenvRaw = nrmEnv(p);
  vec3 nenv = normalize(vec3(nenvRaw.xy, nenvRaw.z * 0.55));
  float Le = dot(nenv, uSun);
  // turrets speak most near the terminator of the whole form; deep in its shadow side they
  // merge into one quiet plane, and deep in its light they only turn into half-tone
  float speak = uTerm * (1.0 - 0.6 * smoothstep(0.1, 0.5, -Le));
  float L = mix(Le, ndl, speak) + uBias - (1.0 - hgt) * 0.08;
  // shadows cast by the masses above (the crown over the neck, a turret over the one below)
  // (on the sunlit side of the whole form they only fall to a warm half-tone)
  float sunSideEnv = smoothstep(0.05, 0.3, Le);
  L = min(L, mix(mix(-0.22, 0.03, sunSideEnv), L, smoothstep(0.1, 0.75, sh)));
  // creases where one turret tucks under another fall into a warm half-tone, never into shadow
  float crease = 1.0 - aoMid(p, nmid);
  L = max(min(L, 0.03), L - smoothstep(0.04, 0.3, crease) * 0.3);
  // four planes with short transitions, stated rather than blended: shadow, a warm half-tone
  // where a turret turns away, light, and full light where it faces the sun
  float lit = smoothstep(-0.02, 0.04, L);
  float top = smoothstep(0.14, 0.3, L);
  float full = smoothstep(0.38, 0.56, L);
  gLit = lit;

  // shadow: a cool, slightly grey blue, lifted where it faces the sky, warmed from below by
  // the sunlit sea, and warm again close to the terminator, so the shadow side reads as the
  // same cloud turning away rather than as a second, blue cloud
  // (the shadow plane follows the whole form, not each turret, so it stays quiet)
  vec3 nq = normalize(mix(nenvRaw, n, 0.3));
  vec3 shC = mix(P_clShDn, P_clShUp, smoothstep(-0.45, 0.8, nq.y));
  shC = mix(shC, P_clRefl, smoothstep(-0.1, -0.75, nq.y) * 0.62);
  shC = mix(shC, mix(P_clShUp, P_clHalf, 0.55), smoothstep(-0.32, -0.02, L) * 0.6);
  vec3 col = mix(shC, P_clHalf, lit);
  vec3 litC = mix(P_clLit, P_clLit2, full * (0.35 + 0.65 * hgt));
  // the light side is brightest in the crown and settles, warmer, toward the base
  litC = mix(litC * vec3(0.96, 0.935, 0.9), litC, smoothstep(gAttr.y + 0.3, gAttr.w + 0.8, p.y));
  col = mix(col, litC, top);
  // in shadow, the turrets keep a few light-filled edges where they turn to the sky
  float sil = pow(clamp(1.0 - abs(nd.z), 0.0, 1.0), 3.0);
  col = mix(col, P_clRim, sil * (1.0 - lit) * smoothstep(-0.2, 0.6, n.y) * 0.32);
  col *= mix(vec3(0.94, 0.955, 0.98), vec3(1.0), mix(ao, 1.0, lit * 0.8 + 0.2));
  gEdge = sil * sil * (1.0 - lit) * (1.0 - smoothstep(0.0, 0.6, n.y));
  gUp = n.y;
  // a little body in the paint: soft value variation across each plane, which the brush pass
  // turns into strokes that follow the form (never strong enough to make islands)
  float tex = (dome(p * 0.42 + vec3(0.13, 0.71, 0.37)) - 0.62) * 0.7 + (dome(p * 1.1 + vec3(0.51, 0.23, 0.9)) - 0.62) * 0.3;
  col *= 1.0 + tex * mix(0.1, 0.07, top) * uTex;
  vec3 c = toLin(col);
  float low = 1.0 - smoothstep(-0.6, 3.2, p.y);
  c = mix(c, skyCol(w), clamp(gAttr.x + low * 0.14 + uMood.y, 0.0, 0.92));
  // the foot of the cloud stands in the bright haze over the sea
  float foot = 1.0 - smoothstep(-0.1, 0.75, w.y);
  return mix(c, seaHaze(w), foot * foot * 0.92);
}

vec4 cloudLayer(vec2 fc, vec2 w, float pix){
  gMinD = 1e4; gHalo = 0.0;
  gather(fc, w);
  if (np == 0) return vec4(0.0);
  if (w.y < gAttr.y - 0.3) return vec4(0.0);
  float z = zN - 0.3, zEnd = zF + 0.3;
  float minD = 1e4; vec3 pMin = vec3(w, z);
  bool hit = false; vec3 p;
  bool through = false;
  for (int i = 0; i < 150; i++){
    p = vec3(w, z);
    float d = sdP(p);
    if (d < minD){ minD = d; pMin = p; }
    if (d < 0.0015){ hit = true; break; }
    z += max(d * 0.85, 0.008);
    if (z > zEnd){ through = true; break; }
  }
  // a ray that ran out of steps was creeping through a crease between lumps: it is inside
  if (!hit && (!through || minD < 0.004)){ hit = true; p = pMin; }
  gMinD = hit ? 0.0 : minD;
  // lit air around the sunward side of the cloud: a soft halo, so it never reads as cut out
  vec4 a2 = texelFetch(uLobes, ivec2(lp[0], 2), 0);
  if (!hit && minD < 0.45){
    vec3 nb = nrmBig(pMin);
    float toSun = dot(normalize(nb.xy + 1e-4), normalize(uSun.xy));
    gHalo = exp(-minD / 0.13) * (0.05 + 0.2 * smoothstep(-0.2, 0.8, toSun)) * a2.x;
  }
  if (!hit && minD > 0.16) return vec4(0.0);
  vec3 c = shadeCloud(hit ? p : pMin, w);
  // found edges where the light is, lost edges in shadow and in the lower body
  float lowB = 1.0 - smoothstep(gAttr.y + 0.4, gAttr.y + 1.8, pMin.y);
  // a shaded turret that turns up to the sky keeps a found edge too; the rest of the shadow side is lost
  float found = max(gLit, smoothstep(0.25, 0.75, gUp) * 0.7);
  float soft = mix(pix * 1.1, pix * 2.4 + 0.025, 1.0 - found) + lowB * (0.09 + pix * 2.0);
  float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, soft, minD);
  c = mix(c, skyCol(w), gEdge * 0.28);
  cov *= smoothstep(-0.05, 0.6, w.y);
  if (cov <= 0.001) return vec4(0.0);
  return vec4(c * cov, cov);
}

/* ---------- mountains ---------- */
float peakField(vec2 q){
  float h = -4.0;
  for (int i = 0; i < 24; i++){
    if (i >= uNP) break;
    vec4 pk = uPeaks[i]; vec4 pb = uPeakB[i];
    vec2 d = (q - pk.xy) / pk.w;
    float r2 = dot(d, d);
    if (r2 > 6.0) continue;
    float r = sqrt(r2);
    // the aretes and gullies wander as they fall, so no line runs ruler-straight down a face
    float th = atan(d.y, d.x) + (tn(q * 0.09 + float(i) * 3.71) * 0.5 + tn(q * 0.31 + float(i) * 1.37) * 0.22 * r) * pb.w;
    float g = abs(sin(0.5 * pb.x * (th - pb.y)));
    float lin = r * (0.72 + pb.z * g);
    // the foot drops away steeply, so each range rises straight out of the cloud sea
    h = smax(h, pk.z * (1.0 - lin - 2.5 * max(lin - 0.62, 0.0) * max(lin - 0.62, 0.0)), 1.6);
  }
  return h;
}
float terrain(vec2 q, int oct){
  float h = peakField(q);
  float s = 0.0, a = 1.0, wgt = 1.0;
  vec2 p = q * 0.16 + vec2(3.7, 1.3);
  for (int o = 0; o < 8; o++){
    if (o >= oct) break;
    float n = 1.0 - abs(tn(p));
    n *= n;
    s += n * a * wgt;
    wgt = clamp(n * 1.5, 0.0, 1.0);
    a *= 0.42;
    p = mat2(1.62, 1.18, -1.18, 1.62) * p;
  }
  // only a few broad octaves: the faces stay as planes, the detail is in the ridges and the snow
  return h + (s - 0.5) * (0.16 + 0.07 * max(h, 0.0)) * uRough;
}

// The range in a few planes, as a painter states it: the faces turned to the sun (on the left)
// in warm light, the faces turned away in a clear blue shade that lifts toward the top
// (skylight), snow on the upper faces and in the gullies, and the foot melting into the bright
// haze over the sea.
vec3 landShade(vec3 p, float t, vec2 w){
  float e = 0.06 + t * 0.0016;
  float h0 = terrain(p.xz, 4);
  float hx = terrain(p.xz + vec2(e, 0.0), 4) - h0;
  float hz = terrain(p.xz + vec2(0.0, e), 4) - h0;
  vec3 n = normalize(vec3(-hx, e, -hz));
  float ndl = dot(n, uLandSun);
  float sh = 1.0, st = 0.4;
  vec3 sp = vec3(p.x, h0 + 0.05, p.z);
  for (int i = 0; i < 26; i++){
    vec3 r = sp + uLandSun * st;
    float hh = terrain(r.xz, 3);
    sh = min(sh, clamp(8.0 * (r.y - hh) / st, 0.0, 1.0));
    st += 0.25 + st * 0.1;
    if (sh < 0.01 || r.y > 16.0) break;
  }
  float lit = smoothstep(0.02, 0.12, ndl) * sh;
  // snow: on the upper faces, reaching down the gullies in tongues, its edge broken by the rock
  float sn = tn(p.xz * 0.22) * 0.75 + tn(p.xz * 0.75 + 7.0) * 0.3;
  float snow = smoothstep(uSnow - 0.25, uSnow + 0.25, h0 + sn * 1.1) * smoothstep(0.28, 0.46, n.y + sn * 0.05);
  snow = max(snow, smoothstep(uSnow + 1.4, uSnow + 2.6, h0) * smoothstep(0.12, 0.32, n.y));
  const float rd = 0.9;
  float avg = 0.25 * (terrain(p.xz + vec2(rd, 0.0), 3) + terrain(p.xz - vec2(rd, 0.0), 3) +
                      terrain(p.xz + vec2(0.0, rd), 3) + terrain(p.xz - vec2(0.0, rd), 3));
  float relief = clamp((h0 - avg) * 2.0, -1.0, 1.0);

  // skylight: higher and up-facing shadow planes are lighter and bluer
  float up = smoothstep(0.1, 0.95, n.y);
  float alt = smoothstep(uSea.x + 1.0, uSnow + 3.0, h0);
  vec3 rockL = toLin(P_rockLit);
  vec3 rockS = toLin(P_rockSh) * mix(0.9, 1.08, up);
  vec3 snowL = toLin(P_snowLit);
  vec3 snowS = mix(toLin(P_snowSh), toLin(P_snowShUp), clamp(up * 0.6 + alt * 0.5, 0.0, 1.0));
  vec3 col = mix(mix(rockS, rockL, lit), mix(snowS, snowL, lit), snow);
  col *= 1.0 + relief * 0.05 * (1.0 - lit);

  // aerial perspective, and the sunlit haze of the sea swallowing the foot of the range
  float hzA = 0.08 + (1.0 - exp(-t * 0.0042));
  float low = 1.0 - smoothstep(uSea.x, uSea.x + 9.0, h0);
  hzA = clamp(hzA + low * low * 0.95 + uMood.z, 0.0, 1.0);
  // the air in front of the range is the sky's own colour, cool and light, warming only at the foot
  vec3 hazeC = mix(skyCol(vec2(w.x, max(w.y, 0.0) * 0.75)), toLin(P_haze), 0.45 * low * low + 0.08);
  return mix(col, hazeC, hzA);
}

/* ---------- the cloud sea ---------- */
float seaH(vec2 q, float fp){
  vec2 p = q * uSea.z * vec2(0.74, 1.22);
  float swell = tn(q * 0.035 + vec2(5.3, 1.7));
  p += vec2(tn(q * 0.06), tn(q * 0.06 + 9.1)) * 0.16;
  float big = dome(vec3(p * 0.43 + vec2(0.17, 0.53), 0.91));
  float w1 = 1.0 - smoothstep(0.3, 0.75, fp);
  float w2 = 1.0 - smoothstep(0.13, 0.32, fp);
  float w3 = 1.0 - smoothstep(0.055, 0.14, fp);
  float d = mix(0.36, dome(vec3(p, 0.37)), w1) * 0.42 + big * 0.2;
  // long rows of billows, wide across and shallow in depth: they still read near the horizon
  float wr = 1.0 - smoothstep(1.4, 3.2, fp);
  d += (mix(0.5, dome(vec3(q.x * 0.0125 + 0.21 + q.y * 0.003, q.y * 0.07 + 0.47, 0.61)), wr) - 0.5) * 0.4;
  d += mix(0.3, dome(vec3(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.27 + vec2(0.31, 0.67), 0.71)), w2) * 0.36;
  d += mix(0.3, dome(vec3(mat2(0.6, 0.8, -0.8, 0.6) * p * 5.3 + vec2(0.63, 0.21), 0.13)), w3) * 0.2;
  // fields of billows and calmer stretches between them
  float calm = smoothstep(-0.25, 0.35, tn(q * 0.045 + vec2(1.9, 7.3)));
  return uSea.x + swell * 0.6 + (d - 0.5) * uSea.y * (0.8 + 0.35 * swell) * mix(0.45, 1.0, calm);
}
vec3 seaHaze(vec2 w){ return mix(skyCol(vec2(w.x, 0.0)), toLin(P_haze), 0.3); }
float gFpK;
float seaHit(vec3 ro, vec3 rd){
  if (rd.y > -0.0005) return -1.0;
  float top = uSea.x + uSea.y * 0.6;
  float t = max(0.5, (ro.y - top) / -rd.y), prevT = t;
  for (int i = 0; i < 112; i++){
    vec3 p = ro + rd * t;
    float dh = p.y - seaH(p.xz, t * gFpK * 2.0);
    if (dh < 0.0){
      float a = prevT, b = t;
      for (int j = 0; j < 6; j++){
        float m = 0.5 * (a + b);
        vec3 q = ro + rd * m;
        if (q.y - seaH(q.xz, m * gFpK * 2.0) < 0.0) b = m; else a = m;
      }
      return b;
    }
    prevT = t;
    // grazing rays skim the billow tops: a minimum step relative to distance keeps them moving
    t += max(dh / -rd.y * 0.6, 0.022 * t);
    if (t > 160.0) break;
  }
  return 1000.0;
}
vec3 seaShade(vec3 p, float t, vec2 w){
  float fp = t * gFpK;
  float e = max(0.03, fp * 0.6);
  float h0 = seaH(p.xz, fp);
  vec3 n = normalize(vec3(-(seaH(p.xz + vec2(e, 0.0), fp) - h0), e, -(seaH(p.xz + vec2(0.0, e), fp) - h0)));
  float sh = 1.0, hc = seaH(p.xz, 0.4) + 0.04;
  for (int i = 1; i <= 6; i++){
    float s = 0.07 * float(i * i);
    vec3 q = vec3(p.x, hc, p.z) + uSeaSun * s;
    sh = min(sh, clamp((q.y - seaH(q.xz, 0.4)) / s * 3.0 + 0.3, 0.0, 1.0));
  }
  float ndl = dot(n, uSeaSun);
  float lit = smoothstep(-0.1, 0.5, ndl) * sh;
  float rel = clamp((h0 - uSea.x) / uSea.y + 0.5, 0.0, 1.0);
  vec3 litC = mix(P_seaLit, P_seaLit2, smoothstep(0.3, 0.9, ndl));
  vec3 shC = mix(P_seaShLo, P_seaShHi, smoothstep(0.05, 0.8, rel));
  vec3 col = mix(shC, litC, smoothstep(0.05, 0.8, lit));
  col = mix(col, P_clRim, (1.0 - lit) * smoothstep(0.45, 0.95, rel) * 0.35);
  // the near sea is left soft and simple: detail belongs to the focal point, not the foreground
  float near = 1.0 - smoothstep(4.0, 16.0, t);
  col = mix(col, mix(litC, P_seaShHi, 0.25), near * 0.3);
  vec3 c = toLin(col);
  c *= 1.0 + uMood.w;
  float hz = 1.0 - exp(-t * 0.0065);
  hz = max(hz, smoothstep(110.0, 190.0, t));
  return mix(c, seaHaze(w), clamp(hz, 0.0, 1.0));
}

/* ---------- the far sea, painted as rows of billow tops ---------- */
// Beyond the near sea the billows are painted the way the eye reads them there: receding rows of
// rounded tops at an even spacing in depth, so the rows crowd toward the horizon and the tops
// shrink with perspective. Each top is lit along its sunward crown and turns a blue face toward us
// (the sun is ahead and to the left); the troughs between the rows lie in their shade.
#define ROW_DZ 2.4
#define ROW_A 2.9
float rowHash(float j, float i){ return hash12(vec2(j * 37.0 + 11.0, i * 3.0 + 5.0)); }
// the top of row j at x: the highest of the domes over x; dome = (offset from its centre, radius, height)
float rowTop(float j, float x, out vec3 dome){
  float X = x + rowHash(j, -7.0) * 97.0;
  float ci = floor(X / ROW_A);
  // calm stretches and fields of bigger billows
  float field = 0.75 + 0.45 * smoothstep(-0.3, 0.4, tn(vec2(X * 0.021, j * 0.09) + vec2(4.1, 2.3)));
  float best = 0.0; dome = vec3(0.0, 1.0, 0.0);
  for (int k = -1; k <= 1; k++){
    float i = ci + float(k);
    float h1 = rowHash(j, i), h2 = rowHash(j + 0.31, i), h3 = rowHash(j + 0.67, i);
    float c = (i + 0.5 + (h1 - 0.5) * 0.55) * ROW_A;
    float r = ROW_A * (0.5 + 0.3 * h2);
    float hd = r * (0.5 + 0.25 * h3) * field;
    float u = (X - c) / r;
    float f = hd * sqrt(max(0.0, 1.0 - u * u));
    if (f > best){ best = f; dome = vec3(X - c, r, hd); }
  }
  return best;
}
// march the rows from depth z0; returns t of the hit (or -1) and the hit's dome and row
float seaRowsHit(vec3 ro, vec3 rd, float z0, out vec3 dome, out float row, out float trough){
  float tBase = (uSea.x - ro.y) / rd.y;
  trough = 0.0; row = -1.0;
  float j0 = ceil(z0 / ROW_DZ);
  for (int k = 0; k < 90; k++){
    float j = j0 + float(k);
    float z = (j + (rowHash(j, 0.5) - 0.5) * 0.5) * ROW_DZ;
    float t = z / rd.z;
    if (t > tBase){ trough = 1.0; return tBase; }
    vec3 p = ro + rd * t;
    float f = rowTop(j, p.x, dome);
    if (p.y < uSea.x + f){ row = j; return t; }
    if (t > 230.0) break;
  }
  return -1.0;
}
vec3 seaRowsShade(vec3 ro, vec3 rd, float t, vec3 dome, float trough, vec2 w, float pix){
  vec3 p = ro + rd * t;
  vec3 litC, shC;
  shC = mix(P_seaShLo, P_seaShHi, 0.45);
  vec3 col;
  if (trough > 0.5){
    col = mix(P_seaShLo, P_seaShHi, 0.85);
  } else {
    float nx = dome.x / dome.y, ny = clamp((p.y - uSea.x) / max(dome.z, 1e-3), 0.0, 1.0);
    float nz = -sqrt(max(0.0, 1.0 - nx * nx - ny * ny));
    vec3 n = normalize(vec3(nx / dome.y, ny / max(dome.z, 1e-3), nz / dome.y));
    // stated for the rows: their tops take the light, the faces turned toward us are in shade
    float ndl = dot(n, normalize(vec3(uSeaSun.x * 0.45, uSeaSun.y, uSeaSun.z)));
    litC = mix(P_seaLit, P_seaLit2, smoothstep(0.3, 0.8, ndl));
    // the face turned toward us: lighter near the top (skylight), deeper toward the trough
    shC = mix(P_seaShLo, P_seaShHi, 0.35 + 0.65 * smoothstep(0.0, 0.9, ny));
    col = mix(shC, litC, smoothstep(-0.02, 0.14, ndl));
    // a light-filled rim where the face turns over into the lit crown
    col = mix(col, P_clRim, smoothstep(0.6, 0.95, ny) * (1.0 - smoothstep(-0.02, 0.14, ndl)) * 0.4);
  }
  // when the rows crowd closer than a few pixels they read as one bright, finely lined field
  float z = t * rd.z;
  float gapPx = (CAMH - uSea.x) * FOC * ROW_DZ / (z * z) / pix;
  vec3 avg = mix(mix(P_seaLit, P_seaLit2, 0.4), mix(P_seaShHi, P_seaShLo, 0.25), 0.28);
  col = mix(avg, col, smoothstep(1.2, 4.5, gapPx));
  vec3 c = toLin(col);
  c *= 1.0 + uMood.w;
  float hz = 1.0 - exp(-t * 0.0065);
  hz = max(hz, smoothstep(110.0, 190.0, t));
  return mix(c, seaHaze(w), clamp(hz, 0.0, 1.0));
}

vec4 landLayer(vec2 w, float pix){
  if (w.y > 2.9) return vec4(0.0);
  vec3 ro = vec3(0.0, CAMH, 0.0);
  vec3 rd = normalize(vec3(w.x / FOC, w.y / FOC, 1.0));
  gFpK = (pix / FOC) / max(-rd.y, 0.004);
  float tS = seaHit(ro, rd);
  float tMax = tS > 0.0 ? min(tS, 200.0) : 200.0;
  float t = 1.0, prevT = t, minR = 1e3, tMin = 0.0;
  for (int i = 0; i < 160; i++){
    vec3 p = ro + rd * t;
    float dh = p.y - terrain(p.xz, 4);
    if (dh < 0.0){
      float a = prevT, b = t;
      for (int j = 0; j < 6; j++){
        float m = 0.5 * (a + b);
        vec3 q = ro + rd * m;
        if (q.y - terrain(q.xz, 5) < 0.0) b = m; else a = m;
      }
      return vec4(landShade(ro + rd * b, b, w), 1.0);
    }
    float r = dh / t;
    if (r < minR){ minR = r; tMin = t; }
    prevT = t;
    t += max(dh * 0.5, 0.004 * t);
    if (t > tMax || p.y > 17.0) break;
  }
  if (tS > 0.0){
    // the near sea is the field of billows; from uRowsZ on it is painted as rows
    vec3 dome; float row, trough;
    float zS = tS > 999.0 ? 1e4 : tS * rd.z;
    float zR = uRowsZ;
    if (zS < zR) return vec4(seaShade(ro + rd * tS, tS, w), 1.0);
    float tR = seaRowsHit(ro, rd, zR, dome, row, trough);
    vec3 cR = tR > 0.0 ? seaRowsShade(ro, rd, tR, dome, trough, w, pix) : seaHaze(w);
    // a short blend where the two meet
    if (zS < zR + 8.0 && tS < 999.0) cR = mix(seaShade(ro + rd * tS, tS, w), cR, smoothstep(zR, zR + 8.0, zS));
    return vec4(cR, 1.0);
  }
  float cov = 1.0 - smoothstep(0.0, pix / FOC * 1.4, minR);
  if (cov <= 0.0) return vec4(0.0);
  return vec4(landShade(ro + rd * tMin, tMin, w), cov);
}

void main(){
  vec2 fc = gl_FragCoord.xy + uOrigin;
  vec2 uv = fc / uFull;
  vec2 w = vec2((uv.x - 0.5) * uAspect * uSpan, (uv.y - uHz) * uSpan);
  float pix = uSpan / uFull.y;

  vec3 col = skyCol(w);
  col = mix(col, seaHaze(w), smoothstep(0.35, 0.0, w.y) * 0.85);
  float paint = 0.0;
  vec4 land = landLayer(w, pix);
  // the clouds stand in front of the range (it is four times farther away) and fade into the
  // sea at their foot, so they are laid over the land, not hidden by it
  vec4 c = w.y > -0.06 ? cloudLayer(fc, w, pix) : vec4(0.0);
  if (land.a < 1.0){
    // air close to a cloud is lit by it: a faint halo softens the cut-out
    col = mix(col, toLin(P_halo), max(gHalo, exp(-gMinD / 0.07) * 0.08) * (1.0 - c.a));
  }
  col = mix(col, land.rgb, land.a);
  col = col * (1.0 - c.a) + c.rgb;
  paint = max(c.a, land.a);

  // the valley fades into the page
  col = mix(col, toLin(P_bg), smoothstep(uFade + 1.7, uFade, w.y));

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  frag = vec4(col, paint);
}`;

// Structure tensor of the scene (Sobel), for the brush direction.
const TENSOR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 o;
vec3 at(ivec2 p, ivec2 m){ return texelFetch(uSrc, clamp(p, ivec2(0), m), 0).rgb; }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 m = textureSize(uSrc, 0) - 1;
  vec3 tl = at(p + ivec2(-1, 1), m), t = at(p + ivec2(0, 1), m), tr = at(p + ivec2(1, 1), m);
  vec3 l = at(p + ivec2(-1, 0), m), r = at(p + ivec2(1, 0), m);
  vec3 bl = at(p + ivec2(-1, -1), m), b = at(p + ivec2(0, -1), m), br = at(p + ivec2(1, -1), m);
  vec3 sx = (tr + 2.0 * r + br - tl - 2.0 * l - bl) * 0.25;
  vec3 sy = (tl + 2.0 * t + tr - bl - 2.0 * b - br) * 0.25;
  o = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uSigma;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 m = textureSize(uSrc, 0) - 1;
  int R = int(ceil(uSigma * 2.5));
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int k = -32; k <= 32; k++){
    if (k < -R || k > R) continue;
    float w = exp(-float(k * k) / (2.0 * uSigma * uSigma));
    acc += w * texelFetch(uSrc, clamp(p + ivec2(uDir) * k, ivec2(0), m), 0);
    ws += w;
  }
  o = acc / ws;
}`;

// Anisotropic Kuwahara filter with polynomial sector weights (Kyprianidis et al.).
const PAINT = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uTfm;
uniform vec2 uPad;
uniform float uRadius;
uniform float uHard;
uniform float uMix;
uniform vec2 uOrigin;   // this canvas inside the composition, in pixels from the bottom-left
uniform vec2 uFull;
uniform vec3 uFrame;    // aspect, horizon, span
uniform float uStars;
uniform float uGrain;   // strength of the brush grain laid along the strokes
out vec4 o;

float hash12(vec2 p){
  uvec2 v = uvec2(ivec2(p) + 32768);
  v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u; v.x += v.y * 1664525u;
  return float(v.x & 65535u) / 65535.0;
}

float vnoise(vec2 q){
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main(){
  vec2 size = vec2(textureSize(uSrc, 0));
  vec2 fc = gl_FragCoord.xy + uPad;
  vec2 uv = fc / size;
  vec4 src = texture(uSrc, uv);

  vec3 g = texture(uTfm, uv).xyz;
  float d = sqrt(max(0.0, g.y * g.y - 2.0 * g.x * g.y + g.x * g.x + 4.0 * g.z * g.z));
  float l1 = 0.5 * (g.y + g.x + d), l2 = 0.5 * (g.y + g.x - d);
  vec2 tv = vec2(l1 - g.x, -g.z);
  vec2 t = length(tv) > 0.0 ? normalize(tv) : vec2(0.0, 1.0);
  float phi = atan(t.y, t.x);
  float A = (l1 + l2 > 0.0) ? (l1 - l2) / (l1 + l2) : 0.0;

  float radius = uRadius;
  float a = radius * clamp((1.0 + A) / 1.0, 0.1, 2.0);
  float b = radius * clamp(1.0 / (1.0 + A), 0.1, 2.0);
  float cp = cos(phi), sp = sin(phi);
  mat2 SR = mat2(0.5 / a, 0.0, 0.0, 0.5 / b) * mat2(cp, -sp, sp, cp);
  float mx = sqrt(a * a * cp * cp + b * b * sp * sp);
  float my = sqrt(a * a * sp * sp + b * b * cp * cp);
  // large radii are sampled on a coarser grid; the result is a smooth average either way
  float st = max(1.0, radius / 9.0);
  int nx = int(ceil(mx / st)), ny = int(ceil(my / st));

  float zeta = 2.0 / radius;
  const float zc = 0.58;
  float eta = (zeta + cos(zc)) / (sin(zc) * sin(zc));

  vec4 m[8]; vec3 s[8];
  for (int k = 0; k < 8; k++){ m[k] = vec4(0.0); s[k] = vec3(0.0); }
  for (int j = -40; j <= 40; j++){
    if (j < -ny || j > ny) continue;
    for (int i = -40; i <= 40; i++){
      if (i < -nx || i > nx) continue;
      vec2 off = vec2(float(i), float(j)) * st;
      vec2 v = SR * off;
      if (dot(v, v) > 0.25) continue;
      vec3 c = texture(uSrc, (fc + off) / size).rgb;
      float w[8]; float sum = 0.0, z, vxx, vyy;
      vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
      v = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -v.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -v.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, v.x + vyy); w[7] = z * z; sum += w[7];
      float gw = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
      for (int k = 0; k < 8; k++){ float wk = w[k] * gw; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
    }
  }
  vec4 acc = vec4(0.0);
  for (int k = 0; k < 8; k++){
    if (m[k].w <= 0.0) continue;
    vec3 mu = m[k].rgb / m[k].w;
    vec3 v2 = abs(s[k] / m[k].w - mu * mu);
    float sig = v2.r + v2.g + v2.b;
    float wk = 1.0 / (1.0 + pow(uHard * 1000.0 * sig, 4.0));
    acc += vec4(mu * wk, wk);
  }
  vec3 painted = acc.w > 0.0 ? acc.rgb / acc.w : src.rgb;
  vec3 col = mix(src.rgb, painted, uMix);
  // brush grain: fine noise smeared along the stroke direction, sized in composition units so
  // every resolution gets the same strokes; only on painted forms, strongest where they are flat
  if (uGrain > 0.0 && src.a > 0.0) {
    float cell = uFull.y * 0.0012;
    vec2 fp = gl_FragCoord.xy + uOrigin;
    vec2 dir = t * cell * 1.3;
    float g = 0.0;
    for (int k = -5; k <= 5; k++) g += vnoise((fp + dir * float(k)) / cell);
    g = g / 11.0 - 0.5;
    col *= 1.0 + g * uGrain * src.a * (0.6 + 0.4 * A);
  }
  // stars, after the paint so the brush cannot wipe them out; only in open sky
  if (uStars > 0.0) {
    vec2 fp = gl_FragCoord.xy + uOrigin;
    float wy = (fp.y / uFull.y - uFrame.y) * uFrame.z;
    float cell = uFull.y * 0.011;
    vec2 g = fp / cell, id = floor(g), f = fract(g);
    float h = hash12(id + 11.0);
    if (h > 0.93) {
      vec2 at = vec2(hash12(id + vec2(5.0, 1.0)), hash12(id + vec2(1.0, 9.0))) * 0.7 + 0.15;
      float r = length((f - at) * cell) / max(0.6, uFull.y * 0.00055);
      float lum = exp(-r * r * 1.4) * mix(0.25, 1.0, (h - 0.93) / 0.07);
      col += vec3(0.93, 0.96, 1.0) * lum * uStars * (1.0 - src.a) * smoothstep(0.8, 4.5, wy);
    }
  }
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

/* ====================================================================== noise */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (v, n) => ((v % n) + n) % n;

// 3D: r = gradient noise (period P), g = Worley F1 (C cells), both tileable
function noiseVolume(N = 64, P = 8, C = 4, seed = 7) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(P * P * P * 3);
  for (let i = 0; i < P * P * P; i++) {
    let x, y, z, l;
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
    l = Math.sqrt(l); g[i * 3] = x / l; g[i * 3 + 1] = y / l; g[i * 3 + 2] = z / l;
  }
  const pts = new Float32Array(C * C * C * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = 0.15 + rnd() * 0.7;
  const out = new Float32Array(N * N * N * 2);
  let o = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * P, fy = (y / N) * P, fz = (z / N) * P;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const u = fade(tx), v = fade(ty), w = fade(tz);
    let acc = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const gi = (wrap(ix + dx, P) + wrap(iy + dy, P) * P + wrap(iz + dz, P) * P * P) * 3;
      const d = g[gi] * (tx - dx) + g[gi + 1] * (ty - dy) + g[gi + 2] * (tz - dz);
      acc += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    const wx = (x / N) * C, wy = (y / N) * C, wz = (z / N) * C;
    const cx = Math.floor(wx), cy = Math.floor(wy), cz = Math.floor(wz);
    let f1 = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const pi = (wrap(cx + i, C) + wrap(cy + j, C) * C + wrap(cz + k, C) * C * C) * 3;
      const px = cx + i + pts[pi] - wx, py = cy + j + pts[pi + 1] - wy, pz = cz + k + pts[pi + 2] - wz;
      const dd = px * px + py * py + pz * pz;
      if (dd < f1) f1 = dd;
    }
    out[o++] = acc * 1.6;
    out[o++] = Math.sqrt(f1);
  }
  return out;
}

// 2D tileable gradient noise, period P lattice cells across N texels
function noisePlane(N = 512, P = 32, seed = 3) {
  const rnd = mulberry32(seed);
  const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = ((x + 0.5) / N) * P, fy = ((y + 0.5) / N) * P;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const u = fade(tx), v = fade(ty);
    const dot = (i, j) => { const k = wrap(ix + i, P) + wrap(iy + j, P) * P; return gx[k] * (tx - i) + gy[k] * (ty - j); };
    const a = dot(0, 0), b = dot(1, 0), c = dot(0, 1), d = dot(1, 1);
    out[y * N + x] = (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.414;
  }
  return out;
}

/* ====================================================================== lights */

// A light is a sun direction and a palette. Colours are display-space sRGB, 0 to 1.
export const LIGHTS = {
  // Late-October morning: low sun from the upper left, warm light, clear blue shadows.
  morning: {
    sun: [-0.62, 0.62, -0.42],
    seaSun: [-0.7, 0.42, 0.3],
    landSun: [-0.85, 0.5, 0.12],
    glow: [-9.5, 6.8, 0.58, 0.42],
    mood: [0, 0, 0, 0],
    pal: {
      skyZen: [0.42, 0.62, 0.89], skyMid: [0.68, 0.81, 0.955], skyHor: [0.935, 0.955, 0.975],
      skyGlow: [1.0, 0.975, 0.93], skyBand: [1.0, 0.955, 0.9],
      clLit: [0.98, 0.962, 0.935], clLit2: [1.0, 0.99, 0.968], clHalf: [0.93, 0.893, 0.855],
      clShUp: [0.76, 0.81, 0.9], clShDn: [0.64, 0.7, 0.82], clRefl: [0.86, 0.85, 0.835], clRim: [0.86, 0.91, 0.98],
      seaLit: [0.975, 0.952, 0.92], seaLit2: [1.0, 0.988, 0.965], seaShLo: [0.64, 0.74, 0.88], seaShHi: [0.78, 0.85, 0.95],
      rockLit: [0.87, 0.85, 0.84], rockSh: [0.6, 0.68, 0.84],
      snowLit: [1.0, 0.965, 0.915], snowSh: [0.66, 0.75, 0.91], snowShUp: [0.78, 0.85, 0.97],
      haze: [0.985, 0.97, 0.94], bg: [246 / 255, 248 / 255, 251 / 255], halo: [0.985, 0.97, 0.94],
    },
  },
  // A starting point for night plates: a high moon from the upper left, a deep blue sky with a
  // few stars, clouds and snow lit cool. Tune per plate; keep it light enough for white glass.
  night: {
    sun: [-0.5, 0.75, -0.4],
    seaSun: [-0.7, 0.55, 0.1],
    glow: [-9.0, 1.5, 0.3, 0.55],
    mood: [0.85, 0.05, 0.05, 0],
    pal: {
      skyZen: [0.13, 0.2, 0.4], skyMid: [0.24, 0.33, 0.56], skyHor: [0.5, 0.57, 0.74],
      skyGlow: [0.56, 0.62, 0.8], skyBand: [0.62, 0.64, 0.78],
      clLit: [0.76, 0.8, 0.91], clLit2: [0.84, 0.87, 0.95], clHalf: [0.6, 0.63, 0.78],
      clShUp: [0.42, 0.5, 0.7], clShDn: [0.3, 0.36, 0.55], clRefl: [0.48, 0.52, 0.68], clRim: [0.62, 0.69, 0.86],
      seaLit: [0.66, 0.71, 0.85], seaLit2: [0.74, 0.79, 0.91], seaShLo: [0.36, 0.43, 0.62], seaShHi: [0.5, 0.57, 0.76],
      rockLit: [0.45, 0.5, 0.63], rockSh: [0.24, 0.3, 0.46],
      snowLit: [0.8, 0.85, 0.95], snowSh: [0.45, 0.53, 0.72], snowShUp: [0.55, 0.63, 0.83],
      haze: [0.58, 0.64, 0.79], bg: [246 / 255, 248 / 255, 251 / 255], halo: [0.6, 0.66, 0.83],
    },
  },
};

/* ====================================================================== compositions */

// World units: composition height = span, horizon at y = 0, x centred.
// Cloud lobes are [x, y, r] on the screen plane at the cloud's depth z.
// Peaks are [screen x, screen height, distance, screen radius, aretes, phase, gully depth, wobble].

// The same tower and massif appear in every framing, scaled and placed: one world. The tower's
// design (TOWER) lives in frames.js, because the hero's layout reads its silhouette.
/** The tower centred at x, scaled by k (k = 1 in the desktop frame). */
export const tower = (x, k = 1) => ({
  z: 14, haze: 0.0, base: -0.8, jitter: 0, designed: true, billow: 0.045 * k, crown: 3.4 * k, crownAmp: 0.35, halo: 1, cx: x,
  lobes: TOWER.map(([lx, ly, r, g = 0, lvl = 0, dz]) => [x + lx * k, ly * k, r * k, g, lvl, dz === undefined ? undefined : dz * k]),
});
// The Hisor range as it is seen from Dushanbe: a long wall with a double summit, stepping
// down toward the valley on the right.
const MASSIF = [
  [0, 1.55, 62, 1.5, 3, 0.9, 0.16, 1.0], [1.05, 1.42, 63, 1.35, 3, 1.9, 0.16, 1.0],
  [-1.3, 1.1, 64, 1.6, 3, 2.4, 0.18, 1.0], [-2.7, 0.8, 66, 1.8, 3, 0.3, 0.18, 1.0],
  [2.2, 1.12, 65, 1.4, 3, 1.1, 0.18, 1.0], [3.3, 0.86, 67, 1.4, 3, 2.7, 0.18, 1.0],
  [4.4, 0.55, 69, 1.3, 3, 0.6, 0.18, 1.0], [5.4, 0.3, 71, 1.2, 3, 1.6, 0.18, 1.0],
];
/** The massif with its main summit at x, scaled by k. */
export const massif = (x, k = 1) => MASSIF.map(([sx, sh, d, sr, ...rest]) => [x + sx * k, sh * k, d, sr * k, ...rest]);
// Distant cumulus resting on the far sea, for depth.
export const farCloud = (x, k = 1, haze = 0.32) => ({
  z: 24, haze, base: -0.3, jitter: 0.5 * k, billow: 0.06 * k, crown: 0.9 * k,
  lobes: [[0, 0.5, 0.9, 0.3], [0.95, 0.4, 0.75, 0.2], [0.4, 1.3, 0.68, 0.8], [-0.45, 1.25, 0.55, 0.8]].map(([lx, ly, r, g]) => [x + lx * k, ly * k, r * k, g]),
});

// Desktops and tablets: one wide frame. hero.js slides and scales it so the tower stands clear
// of the copy at every width, the massif on the far left; most of the frame below the horizon is
// cloud sea under the product.
const desktop = {
  ...FRAMES.desktop,
  light: 'morning',
  snow: 5.6,
  fade: -7.0,
  sea: [-2.2, 1.5, 0.12],
  paint: 0.0034,
  term: 0.8,
  bias: -0.08,
  midK: 0.3,
  clouds: [tower(...FRAMES.desktop.tower)],
  rough: 1.4,
  peaks: massif(-6.0),
};

// Phones: a tall frame and its own framing. The tower rises on the right from the horizon to
// just under the buttons, its lit side toward the copy, crown whole; the massif stands whole on
// the left.
const phone = {
  ...FRAMES.phone,
  light: 'morning',
  snow: 5.2,
  fade: -12.6,
  sea: [-2.2, 1.5, 0.12],
  paint: 0.0026,
  term: 0.8,
  bias: -0.08,
  midK: 0.3,
  glowAt: [-5.2, 9.5],
  landHaze: -0.14,
  clouds: [tower(...FRAMES.phone.tower)],
  peaks: massif(-2.2, 0.95),
};

export const COMPOSITIONS = { desktop, phone };

/* ====================================================================== cumulus growth */

function growCloud(c, rnd, sun) {
  // a lobe is [x, y, r, g, lvl]: lvl 0 is a designed mass (it casts the big shadows), 1 a lump on
  // a mass's outline, 2 a small billow; g is how much small billowing the lobe sprouts
  // designed lobes keep their depth (dz, optional), so lumps stay on their mass's outline
  const L0 = c.lobes.map(([x, y, r, g = 0, lvl = 0, dz]) => Object.assign([x, y, c.z + (dz ?? (c.designed ? 0 : (rnd() * 2 - 1) * c.jitter)), r], { g, lvl }));
  const all = L0.slice();
  const buried = (q, list) => list.some((o) => o !== q && Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) + q[3] * 0.55 < o[3]);
  const spawn = (parents, count, rmin, rmax, sunBias, lift) => {
    const out = [];
    for (const P of parents) {
      const n = Math.round(count * P.g);
      for (let j = 0; j < n; j++) {
        let dx = rnd() * 2 - 1, dy = rnd() * 1.6 - 0.45 + lift, dz = -(rnd() * (lift ? 0.6 : 1.1) + 0.05);
        dx += sun[0] * sunBias; dy += sun[1] * sunBias;
        const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        if (dy < -0.3) continue;
        // small billows crowd the sunlit top, not the shaded flank
        if (dx > 0.35 && dy < 0.55) continue;
        const r = P[3] * (rmin + rnd() * (rmax - rmin));
        const d = P[3] - r * (0.35 + rnd() * 0.3);
        const q = Object.assign([P[0] + dx * d, P[1] + dy * d, P[2] + dz * d, r], { g: P.g, lvl: 2 });
        if (q[1] - r * 0.5 < c.base) continue;
        if (buried(q, all) || buried(q, out)) continue;
        out.push(q);
      }
    }
    all.push(...out);
    return out;
  };
  const S = spawn(L0, 20, 0.24, 0.42, 0.35, 0);
  spawn(S, 14, 0.28, 0.48, 0.7, 0.35);
  return all;
}

const norm3 = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

function packComposition(comp, light, fullW, fullH) {
  const rnd = mulberry32(11);
  const sun = norm3(light.sun);
  const lobes = [], attrs = [], attrs2 = [], attrs3 = [], big = [], bigBase = [];
  for (const c of comp.clouds) {
    const grown = growCloud(c, rnd, sun);
    const ms = grown.filter((l) => l.lvl === 0);
    const x0 = Math.min(...ms.map((l) => l[0] - l[3])), x1 = Math.max(...ms.map((l) => l[0] + l[3]));
    const y0 = Math.max(c.base, Math.min(...ms.map((l) => l[1] - l[3]))), y1 = Math.max(...ms.map((l) => l[1] + l[3]));
    const cx = c.cx ?? (x0 + x1) / 2;
    for (const l of grown) {
      lobes.push(...l);
      attrs.push(c.haze, c.base, c.billow ?? 0.05, c.crown ?? c.base + 1.5);
      attrs2.push(c.halo ?? 0.6, l.lvl ?? 0, cx, c.crownAmp ?? 1);
      attrs3.push((y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, c.z);
    }
    for (const l of grown) if (l.lvl === 0 && bigBase.length < 32) { big.push(...l); bigBase.push(c.base); }
  }
  const n = lobes.length / 4;
  // bin lobes into screen tiles so each pixel only marches the lobes under it
  const GX = 48, GY = 32;
  const wx = (px) => (px / fullW - 0.5) * comp.aspect * comp.span;
  const wy = (py) => (py / fullH - comp.hz) * comp.span;
  const cells = new Uint32Array(GX * GY * 4), idx = [];
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const x0 = wx((i / GX) * fullW), x1 = wx(((i + 1) / GX) * fullW);
    const y0 = wy((j / GY) * fullH), y1 = wy(((j + 1) / GY) * fullH);
    const view = [];
    for (let k = 0; k < n; k++) {
      const x = lobes[k * 4], y = lobes[k * 4 + 1], r = lobes[k * 4 + 3] + 0.14;
      const nx = Math.max(x0, Math.min(x, x1)), ny = Math.max(y0, Math.min(y, y1));
      if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) view.push(k);
    }
    const o = (j * GX + i) * 4;
    cells[o] = idx.length; cells[o + 1] = Math.min(view.length, 160); idx.push(...view.slice(0, 160));
  }
  const FOC = 10, CAMH = 1;
  const peaks = [], peakB = [];
  for (const [sx, sh, dist, sr, k, ph, gd, wb] of comp.peaks) {
    peaks.push((sx * dist) / FOC, dist, CAMH + (sh * dist) / FOC, (sr * dist) / FOC);
    peakB.push(k, ph, gd, wb);
  }
  return { lobes, attrs, attrs2, attrs3, n, big, bigBase, nb: bigBase.length, cells, GX, GY, idx, peaks, peakB, np: comp.peaks.length, sun };
}

/* ====================================================================== capability */

/**
 * Whether this device should bake the sky live, or keep the baked still.
 * The still is the product on phones, low-end devices, data savers and software GL.
 */
export function liveBakeAllowed() {
  try {
    if (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 759.98px)').matches) return { ok: false, why: 'small or touch screen' };
    const nav = navigator;
    if (nav.connection && nav.connection.saveData) return { ok: false, why: 'save data' };
    if (matchMedia('(prefers-reduced-data: reduce)').matches) return { ok: false, why: 'reduced data' };
    if (nav.deviceMemory && nav.deviceMemory < 4) return { ok: false, why: 'low memory' };
    if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return { ok: false, why: 'few cores' };
  } catch (e) { /* treat unknowns as capable; the GPU gates below still apply */ }
  return { ok: true };
}

/** Renderer name for a context, used to refuse software rasterisers. */
function rendererName(gl) {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) { return ''; }
}
export const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

/* ====================================================================== renderer */

/**
 * Render `comp` into `canvas` (WebGL2). The canvas may be a crop of a larger frame:
 *   full:   [w, h] size of the whole composition in device pixels (default: the canvas)
 *   origin: [x, y] offset of the canvas inside it, in pixels from the bottom-left
 *   light:  a LIGHTS entry or name (default: the composition's light)
 *   allowSoftware: render even on a software rasteriser (offline bakes only)
 *   gate:   { firstStripMs, totalMs } abort when the first strip shows the bake will be slow
 * Returns a job { cancel, pause, resume, gl, done } or null when WebGL2 or float targets
 * are unavailable. `done` resolves with the bake time, or rejects with a reason
 * ('software', 'slow', 'lost', 'cancelled').
 */
export function bakeSky(canvas, comp, opts = {}) {
  const { strips = 24, budget = 14, full, origin = [0, 0], allowSoftware = false, gate = null, onProgress } = opts;
  const light = typeof opts.light === 'object' ? opts.light : LIGHTS[opts.light || comp.light || 'morning'];
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  if (!allowSoftware && SOFTWARE_GL.test(rendererName(gl))) {
    const job = { cancel() {}, pause() {}, resume() {}, gl, done: Promise.reject(new Error('software')) };
    job.done.catch(() => {});
    return job;
  }
  if (!gl.getExtension('EXT_color_buffer_float')) return null;

  const fullW = full ? full[0] : canvas.width, fullH = full ? full[1] : canvas.height;
  const W = canvas.width, H = canvas.height;
  // the paint filter reaches past the canvas edge, so the scene is rendered with a margin
  const radius = Math.max(1.5, (comp.paint ?? 0.0045) * fullH);
  const sigma = Math.max(1, radius * 0.33);
  const pad = Math.ceil(radius * 2 + sigma * 2.5 + 3);
  const SW = W + pad * 2, SH = H + pad * 2;

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const program = (src) => {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
    const cache = {};
    return { p, u: (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
  };
  const P = { scene: program(SCENE), tensor: program(TENSOR), blur: program(BLUR), paint: program(PAINT) };

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const texture = (unit, target, setup, filter, wrapMode) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, t);
    setup();
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrapMode);
    if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, wrapMode);
    return t;
  };
  const target = (unit, internal, format, type) => {
    const t = texture(unit, gl.TEXTURE_2D, () => gl.texImage2D(gl.TEXTURE_2D, 0, internal, SW, SH, 0, format, type, null), gl.LINEAR, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, unit };
  };

  // scene inputs
  const N3 = 64;
  texture(0, gl.TEXTURE_3D, () => gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG16F, N3, N3, N3, 0, gl.RG, gl.FLOAT, noiseVolume(N3)), gl.LINEAR, gl.REPEAT);
  const N2 = 512;
  texture(1, gl.TEXTURE_2D, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, N2, N2, 0, gl.RED, gl.FLOAT, noisePlane(N2)), gl.LINEAR, gl.REPEAT);
  const pk = packComposition(comp, light, fullW, fullH);
  texture(2, gl.TEXTURE_2D, () => {
    const data = new Float32Array(pk.n * 16);
    data.set(pk.lobes, 0); data.set(pk.attrs, pk.n * 4); data.set(pk.attrs2, pk.n * 8); data.set(pk.attrs3, pk.n * 12);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, pk.n, 4, 0, gl.RGBA, gl.FLOAT, data);
  }, gl.NEAREST, gl.CLAMP_TO_EDGE);
  texture(3, gl.TEXTURE_2D, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, pk.GX, pk.GY, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, pk.cells), gl.NEAREST, gl.CLAMP_TO_EDGE);
  texture(4, gl.TEXTURE_2D, () => {
    const IW = 2048, IH = Math.max(1, Math.ceil(pk.idx.length / IW));
    const data = new Uint32Array(IW * IH); data.set(pk.idx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, IW, IH, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, data);
  }, gl.NEAREST, gl.CLAMP_TO_EDGE);

  // render targets: the scene, the structure tensor and its blurred copies
  const T = {
    // half float: an 8-bit scene bands on smooth gradients and the brush turns the steps into ridges
    scene: target(5, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
    tfmA: target(6, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
    tfmB: target(7, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
  };

  const S = P.scene, u = S.u;
  gl.useProgram(S.p);
  ['uNoise', 'uNoise2', 'uLobes', 'uCells', 'uIdx'].forEach((n, i) => gl.uniform1i(u(n), i));
  gl.uniform2f(u('uGrid'), pk.GX, pk.GY);
  gl.uniform2f(u('uOrigin'), origin[0] - pad, origin[1] - pad);
  gl.uniform2f(u('uFull'), fullW, fullH);
  gl.uniform1f(u('uAspect'), comp.aspect);
  gl.uniform1f(u('uHz'), comp.hz);
  gl.uniform1f(u('uSpan'), comp.span);
  gl.uniform4fv(u('uPeaks'), new Float32Array(pk.peaks.length ? pk.peaks : [0, 0, 0, 0]));
  gl.uniform4fv(u('uPeakB'), new Float32Array(pk.peakB.length ? pk.peakB : [0, 0, 0, 0]));
  gl.uniform1i(u('uNP'), pk.np);
  gl.uniform4fv(u('uBig'), new Float32Array(pk.big.length ? pk.big : [0, 0, 0, 0]));
  gl.uniform1fv(u('uBigBase'), new Float32Array(pk.bigBase.length ? pk.bigBase : [0]));
  gl.uniform1i(u('uNB'), pk.nb);
  gl.uniform1f(u('uSnow'), comp.snow);
  gl.uniform1f(u('uFade'), comp.fade);
  gl.uniform3f(u('uSea'), ...comp.sea);
  gl.uniform3f(u('uSun'), ...pk.sun);
  gl.uniform3f(u('uSeaSun'), ...norm3(light.seaSun || light.sun));
  gl.uniform3f(u('uLandSun'), ...norm3(light.landSun || light.sun));
  gl.uniform1f(u('uRough'), comp.rough ?? 1);
  gl.uniform1f(u('uRowsZ'), comp.rowsZ ?? 15);
  // a narrow frame may pull the glow's centre in so the light from the upper left still reads
  gl.uniform4f(u('uGlow'), ...(comp.glowAt ? [...comp.glowAt, light.glow[2], light.glow[3]] : light.glow));
  const mood = (light.mood || [0, 0, 0, 0]).slice();
  mood[2] += comp.landHaze ?? 0; // a framing may thin the air in front of the range
  gl.uniform4f(u('uMood'), ...mood);
  gl.uniform1f(u('uTerm'), comp.term ?? 0.5);
  gl.uniform1f(u('uBias'), comp.bias ?? -0.06);
  gl.uniform1f(u('uMidK'), comp.midK ?? 0.16);
  gl.uniform1f(u('uTex'), comp.tex ?? 1);
  gl.uniform3fv(u('uPal'), new Float32Array(PAL.flatMap((k) => light.pal[k] || [1, 0, 1])));

  // passes, each drawn in horizontal strips from the top down
  const passes = [
    { prog: P.scene, out: T.scene, w: SW, h: SH, rows: Math.max(4, Math.round(SH / strips)), set: () => {} },
    { prog: P.tensor, out: T.tfmA, w: SW, h: SH, rows: SH, set: (q) => gl.uniform1i(q.u('uSrc'), T.scene.unit) },
    { prog: P.blur, out: T.tfmB, w: SW, h: SH, rows: SH, set: (q) => { gl.uniform1i(q.u('uSrc'), T.tfmA.unit); gl.uniform2f(q.u('uDir'), 1, 0); gl.uniform1f(q.u('uSigma'), sigma); } },
    { prog: P.blur, out: T.tfmA, w: SW, h: SH, rows: SH, set: (q) => { gl.uniform1i(q.u('uSrc'), T.tfmB.unit); gl.uniform2f(q.u('uDir'), 0, 1); gl.uniform1f(q.u('uSigma'), sigma); } },
    {
      prog: P.paint, out: null, w: W, h: H, rows: Math.max(8, Math.round(H / 6)),
      set: (q) => {
        gl.uniform1i(q.u('uSrc'), T.scene.unit); gl.uniform1i(q.u('uTfm'), T.tfmA.unit);
        gl.uniform2f(q.u('uPad'), pad, pad); gl.uniform1f(q.u('uRadius'), radius);
        gl.uniform1f(q.u('uHard'), comp.hard ?? 8); gl.uniform1f(q.u('uMix'), comp.paintMix ?? 1);
        gl.uniform2f(q.u('uOrigin'), origin[0], origin[1]); gl.uniform2f(q.u('uFull'), fullW, fullH);
        gl.uniform3f(q.u('uFrame'), comp.aspect, comp.hz, comp.span); gl.uniform1f(q.u('uStars'), (light.mood || [0])[0]);
        gl.uniform1f(q.u('uGrain'), comp.grain ?? 0.05);
      },
    },
  ];

  gl.enable(gl.SCISSOR_TEST);
  let pi = 0, y = passes[0].h, rows = passes[0].rows, fence = null, issued = 0;
  let cancelled = false, paused = false, looping = false, lost = false, firstStrip = true;
  const t0 = performance.now();
  let resolve, reject;
  const done = new Promise((res, rej) => { resolve = res; reject = rej; });
  done.catch(() => {});
  const fail = (why) => { if (!cancelled) { cancelled = true; reject(new Error(why)); } };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; fail('lost'); }, { once: true });

  const begin = () => {
    const ps = passes[pi];
    gl.useProgram(ps.prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ps.out ? ps.out.fb : null);
    gl.viewport(0, 0, ps.w, ps.h);
    ps.set(ps.prog);
  };
  const issue = () => {
    const ps = passes[pi];
    const y0 = Math.max(0, y - rows);
    gl.scissor(0, y0, ps.w, y - y0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    issued = performance.now();
    y = y0;
  };
  const tick = () => {
    if (cancelled || lost) { looping = false; return; }
    if (fence) {
      if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) { requestAnimationFrame(tick); return; }
      gl.deleteSync(fence); fence = null;
      const took = performance.now() - issued;
      const ps = passes[pi];
      if (firstStrip && gate) {
        firstStrip = false;
        // the first strip measures this GPU: project the whole bake and give up if it is slow
        const done1 = passes[0].h - y;
        const projected = (took / Math.max(1, done1)) * passes[0].h * 1.6;
        if (took > gate.firstStripMs || projected > gate.totalMs) { fail('slow'); return; }
      }
      if (ps.rows !== ps.h) rows = Math.max(4, Math.min(ps.h, Math.round(rows * Math.min(2, Math.max(0.5, budget / Math.max(took, 1))))));
      onProgress && onProgress((pi + 1 - y / ps.h) / passes.length);
      if (y <= 0) {
        pi++;
        if (pi >= passes.length) {
          looping = false;
          gl.disable(gl.SCISSOR_TEST);
          resolve(performance.now() - t0);
          return;
        }
        y = passes[pi].h;
        rows = passes[pi].rows;
        begin();
      }
    }
    if (paused) { looping = false; return; }
    issue();
    requestAnimationFrame(tick);
  };
  const run = () => { if (!looping && !cancelled) { looping = true; requestAnimationFrame(tick); } };
  begin();
  run();

  return {
    gl,
    done,
    lobes: pk.n,
    cancel: () => { if (!cancelled) { cancelled = true; reject(new Error('cancelled')); } },
    pause: () => { paused = true; },
    resume: () => { paused = false; run(); },
    /** Free the GPU memory and the context; the canvas keeps nothing after this. */
    release: () => {
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* already gone */ }
    },
  };
}
