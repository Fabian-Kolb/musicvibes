// GLSL for the visualizer. Palette colours blend through soft weights, no particles.
// Three styles share one program: Minimal (soft colour clouds on a dark ground),
// Flächen (one flowing full-screen gradient), Glas (lit 3D liquid surface).

export const VS = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

export const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uT, uZoom, uWarp, uSharp, uGlass, uShimmer, uDepth, uHue, uRipAge, uRipAmp, uSat;
uniform vec3 uCol[5];
// 0 = Glas, 1 = Minimal, 2 = Flächen.
uniform float uStyle, uSize, uCount;
uniform vec3 uBg;
// Glints (Minimal, Flächen): x/z = id of the latest and the previous hi-hat, y/w = their
// age in seconds. uGlintAmt = strength per hit, uTwinkle = background twinkle (highs).
uniform vec4 uGlint;
uniform float uGlintAmt, uTwinkle;
// Symmetry: 0 off, 1 mirror, 2 four-way, 3 kaleidoscope with uSymN segments.
uniform float uSym, uSymN, uSymRot;
// Feedback (MilkDrop technique): the previous frame, pushed outward and turned
// slightly, is blended under the new one, so colours leave trails.
uniform sampler2D uPrev;
uniform float uTrail, uFbZoom, uFbRot;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
const mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * snoise(p); p = R * p; a *= 0.5; } return s; }
float fbm4(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * snoise(p); p = R * p; a *= 0.5; } return s; }

// Set by Minimal and Flächen, added after the trails.
float glint = 0.0;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// One layer of glints: one possible point per grid cell, each with its own place,
// colour share and timing. Every hi-hat lights a fresh handful of points that flare
// and fade; the previous hit's points fade out underneath, so fast hats overlap.
float glints(vec2 p, float t) {
  vec2 id = floor(p);
  float g = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      float h = hash12(c);
      float h2 = hash12(c + 19.7);
      float hitA = step(0.9, fract(h * 13.7 + uGlint.x * 0.618034)) * exp(-uGlint.y * 5.0);
      float hitB = step(0.9, fract(h * 13.7 + uGlint.z * 0.618034)) * exp(-uGlint.w * 5.0);
      float hit = max(hitA, hitB) * uGlintAmt * (0.6 + 0.4 * h2);
      // A few points also twinkle on their own while the highs are up.
      float tw = pow(max(0.0, sin(t * (1.5 + 2.5 * h2) + h * 50.0)), 16.0) * step(0.85, h2) * uTwinkle;
      float a = max(hit, 0.6 * tw);
      if (a < 0.003) continue;
      vec2 d = p - (c + 0.15 + 0.7 * vec2(h, h2));
      float r2 = dot(d, d);
      // Bright core, soft halo, faint four-point star.
      g += a * (exp(-r2 * 60.0) + 0.35 * exp(-r2 * 9.0)
        + 0.12 * (exp(-abs(d.x) * 30.0 - abs(d.y) * 4.0) + exp(-abs(d.y) * 30.0 - abs(d.x) * 4.0)));
    }
  }
  return g;
}

// Highs in Minimal and Flächen: glints of light on the colour, like sun on water.
// Measured in plain screen space (not the warped one, which would stretch them into
// streaks) and added after the trails in main(), so they stay crisp points.
float glintAmount(vec2 p, float t) {
  if (uGlintAmt + uTwinkle < 0.005) return 0.0;
  vec2 q = p + vec2(t * 0.04, -t * 0.025);
  return 1.4 * (glints(q * 5.0, t) + 0.5 * glints(q * 9.0 + 3.1, t + 7.0));
}

vec2 warp(vec2 p, float t) {
  vec2 q = vec2(fbm3(p + vec2(0.0, t * 0.55)), fbm3(p + vec2(5.2, 1.3) - vec2(t * 0.45, 0.0)));
  vec2 r = vec2(fbm3(p + uWarp * q + vec2(1.7, 9.2) + t * 0.32), fbm3(p + uWarp * q + vec2(8.3, 2.8) - t * 0.38));
  return p + uWarp * r;
}

// Soft colour field: softmax of distances to five drifting colour anchors.
vec3 field(vec2 w, float t) {
  float e[5];
  float mx = -1e9;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = 0.95 * vec2(sin(t * (0.31 + fi * 0.07) + fi * 1.9), cos(t * (0.27 + fi * 0.05) + fi * 2.7));
    vec2 d = w - c;
    e[i] = -dot(d, d) * uSharp;
    mx = max(mx, e[i]);
  }
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int i = 0; i < 5; i++) {
    float wt = exp(e[i] - mx);
    acc += uCol[i] * wt;
    ws += wt;
  }
  return acc / ws;
}

vec3 hueRot(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float height(vec2 w, float t) { return fbm4(w * 0.85 + vec2(t * 0.11, -t * 0.07)); }

vec2 symmetry(vec2 uv) {
  if (uSym < 0.5) return uv;
  float c = cos(uSymRot), s = sin(uSymRot);
  uv = mat2(c, -s, s, c) * uv;
  if (uSym < 1.5) {
    uv.x = abs(uv.x);
  } else if (uSym < 2.5) {
    uv = abs(uv);
  } else {
    float seg = 6.2831853 / uSymN;
    float a = mod(atan(uv.y, uv.x), seg);
    a = abs(a - 0.5 * seg);
    uv = length(uv) * vec2(cos(a), sin(a));
  }
  return uv;
}

// Style "Glas": warped liquid with a lit 3D surface (refraction, gloss, sparkles).
vec3 glassStyle(vec2 uv, float t, inout vec2 jit) {
  vec2 p = uv * uZoom * 0.72;
  vec2 w = warp(p, t);
  float h = height(w, t);
  const float E = 0.012;
  float hx = height(w + vec2(E, 0.0), t);
  float hy = height(w + vec2(0.0, E), t);
  vec2 grad = vec2(hx - h, hy - h) / E;
  vec3 n = normalize(vec3(-grad * 0.24 * uGlass, 1.0));
  vec3 col = field(w + n.xy * 0.32 * uGlass, t * 0.8);
  col = hueRot(col, uHue);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  // Deep troughs fall toward black: gives the liquid depth and the club its dark.
  float shade = smoothstep(-0.55, 0.45, h);
  col *= mix(uDepth, 1.1, shade * shade);
  vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
  float fres = pow(1.0 - n.z, 2.0);
  col += vec3(1.0) * spec * uGlass * (0.45 + uShimmer * 0.5) + col * fres * uGlass * 1.4;
  float sp = snoise(w * 9.0 + t * 2.3);
  col += smoothstep(0.9, 0.99, sp) * uShimmer * 0.3 * shade;
  jit = 0.0025 * vec2(snoise(w * 2.0 + t), snoise(w * 2.0 - t + 3.1));
  return col;
}

// Style "Minimal": a few large, soft colour clouds drifting on a dark ground.
// Flat 2D, no lighting. Noise bends the space so the clouds never read as circles;
// where they overlap the colours mix like watercolour.
vec3 minimalStyle(vec2 uv, float t) {
  // Measure against the shorter screen side so portrait screens look the same.
  float m = min(uRes.x, uRes.y);
  uv *= uRes.y / m;
  vec2 ext = 0.5 * uRes / m;
  float wob = 0.07 + 0.13 * uWarp;
  vec2 q = uv + wob * vec2(snoise(uv * 1.2 + vec2(t * 0.21, 1.7)), snoise(uv * 1.2 + vec2(5.1, -t * 0.18)));
  vec3 acc = vec3(0.0);
  float ws = 0.0, ws2 = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= uCount) break;
    vec2 c = ext * vec2(0.8 * sin(t * (0.21 + fi * 0.045) + fi * 2.1), 0.65 * cos(t * (0.17 + fi * 0.05) + fi * 1.3));
    float s = uSize * (0.75 + 0.5 * fract(fi * 0.618));
    vec2 d = (q - c) * vec2(1.0, 1.0 + 0.4 * sin(fi * 1.7 + t * 0.3));
    float wt = exp(-dot(d, d) / (s * s));
    // Squared weights: each cloud keeps its own colour, mixing happens in the band between.
    acc += uCol[i % 5] * wt * wt;
    ws += wt;
    ws2 += wt * wt;
  }
  vec3 col = acc / max(ws2, 1e-6);
  // Harder music draws firmer edges; calm music stays hazy.
  float k = clamp((uSharp - 3.2) / 3.0, 0.0, 1.0);
  float cover = smoothstep(mix(0.12, 0.25, k), mix(0.9, 0.6, k), ws);
  glint = glintAmount(uv, t) * cover;
  return mix(uBg, col, cover);
}

// Style "Flächen": the whole screen is one slowly flowing colour gradient.
vec3 flatStyle(vec2 uv, float t) {
  vec2 p = uv * uZoom * 0.6;
  vec2 w = p + 0.4 * uWarp * vec2(fbm3(p * 0.7 + vec2(0.0, t * 0.2)), fbm3(p * 0.7 + vec2(4.1, -t * 0.17)));
  vec3 col = field(w, t * 0.7);
  // Broad dark valleys keep contrast; flat, not lit.
  float v = smoothstep(-0.7, 0.7, snoise(w * 0.55 + vec2(t * 0.08, -t * 0.05)));
  glint = glintAmount(uv, t) * mix(0.4, 1.0, v);
  return col * mix(0.22, 1.0, v);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv = symmetry(uv);
  float len = length(uv);

  // Kick shockwave: a ring that travels outward and fades (style Glas only).
  float rip = sin((len - uRipAge * 0.9) * 22.0) * exp(-uRipAge * 3.2) * uRipAmp * smoothstep(0.0, 0.2, len);
  uv += (uv / max(len, 1e-3)) * rip * 0.02;

  float t = uT;
  vec2 jit = vec2(0.0);
  vec3 col;
  if (uStyle < 0.5) {
    col = glassStyle(uv, t, jit);
  } else {
    col = uStyle < 1.5 ? minimalStyle(uv, t) : flatStyle(uv, t);
    col = hueRot(col, uHue);
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
  }
  col = max(col, 0.0);

  // Feedback: sample last frame slightly zoomed toward the centre, rotated and nudged
  // along the flow, then blend it under the new colours.
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 c = suv - 0.5;
  c.x *= uRes.x / uRes.y;
  float ca = cos(uFbRot), sa = sin(uFbRot);
  c = mat2(ca, -sa, sa, ca) * c / uFbZoom;
  c += jit;
  c.x /= uRes.x / uRes.y;
  vec3 prev = texture(uPrev, c + 0.5).rgb;
  col = mix(col, prev, uTrail);
  // Glints take the colour they sit on, brightened toward white.
  col += mix(col * 1.5 + 0.08, vec3(1.0), 0.6) * glint;
  o = vec4(col, 1.0);
}`;

// Present pass: brightness, vignette, strobe flash, tone mapping, dithering.
export const PS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uImg;
uniform vec2 uRes;
uniform float uBright, uFlash, uVignette;
uniform vec3 uFlashCol;
void main() {
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 col = texture(uImg, suv).rgb * uBright;
  vec2 c = suv - 0.5;
  c.x *= uRes.x / uRes.y;
  col *= 1.0 - uVignette * smoothstep(0.55, 1.3, length(c));
  col = 1.0 - exp(-col * 1.6);
  col = mix(col, uFlashCol, uFlash);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

export const UNIFORMS = ['uRes', 'uT', 'uZoom', 'uWarp', 'uSharp', 'uGlass', 'uShimmer', 'uDepth', 'uHue',
  'uRipAge', 'uRipAmp', 'uSat', 'uCol', 'uStyle', 'uSize', 'uCount', 'uBg', 'uSym', 'uSymN', 'uSymRot',
  'uPrev', 'uTrail', 'uFbZoom', 'uFbRot', 'uGlint', 'uGlintAmt', 'uTwinkle'];
export const PRESENT_UNIFORMS = ['uImg', 'uRes', 'uBright', 'uFlash', 'uVignette', 'uFlashCol'];
