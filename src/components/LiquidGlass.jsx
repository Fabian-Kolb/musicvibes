import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

// Module-private LRU cache for optical displacement maps & 2x Hi-DPI specular rims.
const MAX_CACHE = 64;
const ASSET_CACHE = new Map();

function buildGlassAssets(w, h, r, effBezel, effStrength, surface, doRefract) {
  if (typeof document === 'undefined') return null;

  const cx = w / 2;
  const cy = h / 2;
  const bx = cx - r;
  const by = cy - r;
  const sdf = (px, py) => {
    const qx = Math.abs(px - cx) - bx;
    const qy = Math.abs(py - cy) - by;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };

  const safeBezel = Math.max(1, effBezel);
  const mag = surface === 'dense' ? 0.03 : 0.14 * Math.min(1, 100 / Math.min(w, h));

  // 1. Optical displacement map (R = X offset, G = Y offset) for SVG feDisplacementMap.
  let dispUrl = null;
  if (doRefract) {
    const scale = w * h > 80000 ? 0.5 : 1;
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const disp = document.createElement('canvas');
    disp.width = dw;
    disp.height = dh;
    const dc = disp.getContext('2d');
    if (dc) {
      const di = dc.createImageData(dw, dh);
      const vecs = new Float32Array(dw * dh * 2);
      let maxMag = 0;

      for (let y = 0; y < dh; y++) {
        const py = ((y + 0.5) / dh) * h;
        const rowOff = y * dw;
        for (let x = 0; x < dw; x++) {
          const px = ((x + 0.5) / dw) * w;
          const d = -sdf(px, py);
          let vx = 0;
          let vy = 0;
          if (d > 0) {
            const t = Math.min(1, d / safeBezel);
            const rim = Math.pow(1 - t, 2.2);
            const gx = sdf(px + 0.5, py) - sdf(px - 0.5, py);
            const gy = sdf(px, py + 0.5) - sdf(px, py - 0.5);
            const gl = Math.hypot(gx, gy) || 1;
            vx = (-gx / gl) * rim + ((cx - px) / cx) * mag;
            vy = (-gy / gl) * rim + ((cy - py) / cy) * mag;
            const len = Math.hypot(vx, vy);
            if (len > maxMag) maxMag = len;
          }
          const idx = (rowOff + x) * 2;
          vecs[idx] = vx;
          vecs[idx + 1] = vy;
        }
      }

      const invMax = 127 / (maxMag || 1);
      const total = dw * dh;
      for (let i = 0; i < total; i++) {
        const k = i * 4;
        di.data[k] = 128 + Math.round(vecs[i * 2] * invMax);
        di.data[k + 1] = 128 + Math.round(vecs[i * 2 + 1] * invMax);
        di.data[k + 2] = 128;
        di.data[k + 3] = 255;
      }
      dc.putImageData(di, 0, 0);
      dispUrl = disp.toDataURL('image/png');
    }
  }

  // 2. 2x Hi-DPI directional specular rim (soft exponential light from top-left,
  //    weaker exit glint bottom-right — no hard 1-px line).
  const S2 = 2;
  const sw = w * S2;
  const sh = h * S2;
  const specCanvas = document.createElement('canvas');
  specCanvas.width = sw;
  specCanvas.height = sh;
  const sc = specCanvas.getContext('2d');
  if (sc) {
    const si = sc.createImageData(sw, sh);
    const Lx = -0.8;
    const Ly = -0.6;
    const padBezel = safeBezel + 2;
    const rimEnd = Math.exp(-safeBezel / 2.4);
    const invRimRange = 1 / (1 - rimEnd);
    const glowEnd = Math.exp(-safeBezel / 10);
    const invGlowRange = 0.32 / (1 - glowEnd);

    for (let y = 0; y < sh; y++) {
      const py = (y + 0.5) / S2;
      const inVertInterior = py > padBezel && py < h - padBezel;
      let xInset = padBezel;
      if (inVertInterior && (py < r || py > h - r)) {
        const distY = Math.min(py, h - py);
        const dy = r - distY;
        const innerR = r - padBezel;
        xInset = innerR > 0 && dy < innerR ? r - Math.sqrt(innerR * innerR - dy * dy) : r;
      }
      const skipEnd = inVertInterior ? Math.floor((w - xInset) * S2) - 1 : -1;

      for (let x = 0; x < sw; x++) {
        const px = (x + 0.5) / S2;
        if (inVertInterior && px > xInset && px < w - xInset) {
          if (skipEnd > x) x = skipEnd;
          continue;
        }
        const d = -sdf(px, py);
        if (d > -0.8 && d < safeBezel) {
          const gx = sdf(px + 0.5, py) - sdf(px - 0.5, py);
          const gy = sdf(px, py + 0.5) - sdf(px, py - 0.5);
          const gl = Math.hypot(gx, gy) || 1;
          const nx = gx / gl;
          const ny = gy / gl;
          const facing = nx * Lx + ny * Ly;
          const dd = Math.max(0, d);
          const rim = Math.max(0, (Math.exp(-dd / 2.4) - rimEnd) * invRimRange);
          const glow = Math.max(0, (Math.exp(-dd / 10) - glowEnd) * invGlowRange);
          const dir =
            Math.pow(Math.max(0, facing), 1.6) +
            Math.pow(Math.max(0, -facing), 1.6) * 0.6 +
            0.10;
          let a = Math.min(1, (rim * 0.8 + glow) * dir);
          if (d < 0) a *= Math.max(0, 1 + d / 0.8);
          const k = (y * sw + x) * 4;
          si.data[k] = 255;
          si.data[k + 1] = 255;
          si.data[k + 2] = 255;
          si.data[k + 3] = Math.round(a * 255);
        }
      }
    }
    sc.putImageData(si, 0, 0);
  }

  return {
    dispUrl,
    specCanvas,
    sR: effStrength * 1.0,
    sG: effStrength * 0.965,
    sB: effStrength * 0.93,
  };
}

function getGlassAssets(w, h, radius, bezel, strength, surface, doRefract) {
  const r =
    radius === 'pill'
      ? Math.min(w, h) / 2
      : Math.max(0, Math.min(Number(radius) || 0, w / 2, h / 2));
  const effBezel =
    bezel ??
    (surface === 'dense' ? 24 : Math.min(22, Math.max(9, Math.round(Math.min(w, h) * 0.28))));
  const effStrength =
    strength ??
    (surface === 'dense' ? 36 : Math.min(48, Math.max(18, Math.round(effBezel * 2.15))));
  const key = `${w}x${h}x${Math.round(r)}x${effBezel}x${effStrength}x${surface}x${doRefract ? 1 : 0}`;

  const hit = ASSET_CACHE.get(key);
  if (hit) {
    ASSET_CACHE.delete(key);
    ASSET_CACHE.set(key, hit);
    return hit;
  }

  const built = buildGlassAssets(w, h, r, effBezel, effStrength, surface, doRefract);
  if (!built) return null;
  if (ASSET_CACHE.size >= MAX_CACHE) {
    const oldest = ASSET_CACHE.keys().next().value;
    ASSET_CACHE.delete(oldest);
  }
  ASSET_CACHE.set(key, built);
  return built;
}

function assignRef(target, node) {
  if (typeof target === 'function') return target(node);
  if (target && typeof target === 'object') target.current = node;
  return undefined;
}

export default function LiquidGlass({
  as = 'div',
  className = '',
  surface = 'clear',
  radius = 'pill',
  bezel,
  strength,
  refract = true,
  interactive = false,
  pressed = false,
  style,
  children,
  ref,
  ...rest
}) {
  const Tag = as;
  const rawId = useId();
  const filterId = 'lg-' + rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const elRef = useRef(null);
  const specRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const needsMeasure = surface !== 'subtle';
  const doRefract = Boolean(refract && surface !== 'subtle');

  const mergedRef = useCallback(
    (node) => {
      elRef.current = node;
      const cleanup = assignRef(ref, node);
      if (typeof cleanup === 'function') {
        return () => {
          elRef.current = null;
          cleanup();
        };
      }
      return undefined;
    },
    [ref],
  );

  useEffect(() => {
    if (!needsMeasure) return undefined;
    const el = elRef.current;
    if (!el) return undefined;

    const update = (rawW, rawH) => {
      if (rawW < 8 || rawH < 8) return;
      const w = Math.max(16, Math.round(rawW / 2) * 2);
      const h = Math.max(16, Math.round(rawH / 2) * 2);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry?.borderBoxSize?.[0];
      if (box && (box.inlineSize > 0 || box.blockSize > 0)) {
        update(box.inlineSize, box.blockSize);
      } else {
        update(el.offsetWidth, el.offsetHeight);
      }
    });
    ro.observe(el, { box: 'border-box' });
    return () => ro.disconnect();
  }, [as, needsMeasure]);

  const assets = useMemo(() => {
    if (!needsMeasure || size.w < 8 || size.h < 8) return null;
    return getGlassAssets(size.w, size.h, radius, bezel, strength, surface, doRefract);
  }, [needsMeasure, size.w, size.h, radius, bezel, strength, surface, doRefract]);

  useEffect(() => {
    const canvas = specRef.current;
    if (!canvas || !assets?.specCanvas) return;
    const src = assets.specCanvas;
    if (canvas.width !== src.width || canvas.height !== src.height) {
      canvas.width = src.width;
      canvas.height = src.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0);
  }, [assets, needsMeasure]);

  const rootProps = as === 'button' && !rest.type ? { type: 'button', ...rest } : rest;
  const classes = `lg lg-${surface}${doRefract ? ' lg-refract' : ' lg-flat'}${interactive ? ' lg-interactive' : ''}${pressed ? ' lg-pressed' : ''}${className ? ' ' + className : ''}`;
  const radiusVal = radius === 'pill' ? '999px' : `${radius}px`;
  const hasFilter = Boolean(doRefract && assets?.dispUrl);

  return (
    <Tag
      ref={mergedRef}
      className={classes}
      style={{ '--lg-r': radiusVal, ...style }}
      {...rootProps}
    >
      {hasFilter && (
        <svg width="0" height="0" className="lg-svg" aria-hidden="true" focusable="false">
          <filter
            id={filterId}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={size.w}
            height={size.h}
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={assets.dispUrl}
              x="0"
              y="0"
              width={size.w}
              height={size.h}
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={assets.sR}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dR"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={assets.sG}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dG"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={assets.sB}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dB"
            />
            <feColorMatrix
              in="dR"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="cR"
            />
            <feColorMatrix
              in="dG"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="cG"
            />
            <feColorMatrix
              in="dB"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="cB"
            />
            <feComposite in="cR" in2="cG" operator="arithmetic" k2="1" k3="1" result="rg" />
            <feComposite in="rg" in2="cB" operator="arithmetic" k2="1" k3="1" result="rgb" />
            <feGaussianBlur in="rgb" stdDeviation={surface === 'dense' ? 0.3 : 0.45} />
          </filter>
        </svg>
      )}
      <span
        className="lg-lens"
        aria-hidden="true"
        style={hasFilter ? { '--lg-filter': `url(#${filterId})` } : undefined}
      />
      <span className="lg-tint" aria-hidden="true" />
      {needsMeasure && <canvas ref={specRef} className="lg-spec" aria-hidden="true" />}
      <span className="lg-content">{children}</span>
    </Tag>
  );
}
