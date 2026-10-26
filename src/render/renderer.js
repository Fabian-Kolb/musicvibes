import { VS, FS, PS, UNIFORMS, PRESENT_UNIFORMS } from './shaders';

// WebGL2 renderer: one pass draws the colour field into a texture (blended with the
// previous frame for trails), a second pass presents it with tone mapping and flash.
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let prog, present, U = {}, PU = {};
  let targets = [], cur = 0, halfFloat = false, lost = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function link(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function init() {
    halfFloat = !!gl.getExtension('EXT_color_buffer_float');
    prog = link(FS);
    present = link(PS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    U = {};
    UNIFORMS.forEach((n) => { U[n] = gl.getUniformLocation(prog, n === 'uCol' ? 'uCol[0]' : n); });
    PU = {};
    PRESENT_UNIFORMS.forEach((n) => { PU[n] = gl.getUniformLocation(present, n); });
    targets = [];
  }
  function makeTargets(w, h) {
    targets.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
    targets = [0, 1].map(() => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb, w, h };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // After a driver reset or standby the context comes back empty: rebuild everything.
  const onLost = (e) => { e.preventDefault(); lost = true; };
  const onRestored = () => { init(); lost = false; };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  init();

  // scale: fraction of the device pixels to render. The look is soft, so 0.6 is
  // indistinguishable from full resolution and four times cheaper.
  function resize(scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(canvas.clientWidth * dpr * scale));
    const h = Math.max(2, Math.round(canvas.clientHeight * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function render(p) {
    if (lost || gl.isContextLost()) return;
    const W = canvas.width, H = canvas.height;
    if (!targets.length || targets[0].w !== W || targets[0].h !== H) makeTargets(W, H);
    const dst = targets[cur], src = targets[1 - cur];

    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(U.uPrev, 0);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTrail, p.trail);
    gl.uniform1f(U.uFbZoom, p.fbZoom);
    gl.uniform1f(U.uFbRot, p.fbRot);
    gl.uniform1f(U.uT, p.flow);
    gl.uniform1f(U.uZoom, p.zoom);
    gl.uniform1f(U.uWarp, p.warp);
    gl.uniform1f(U.uSharp, p.sharp);
    gl.uniform1f(U.uGlass, p.glass);
    gl.uniform1f(U.uShimmer, p.shimmer);
    gl.uniform4f(U.uGlint, p.glintId, p.glintAge, p.glintPrevId, p.glintPrevAge);
    gl.uniform1f(U.uGlintAmt, p.glintAmt);
    gl.uniform1f(U.uTwinkle, p.twinkle);
    gl.uniform1f(U.uDepth, p.depth);
    gl.uniform1f(U.uHue, p.hue);
    gl.uniform1f(U.uRipAge, p.ripAge);
    gl.uniform1f(U.uRipAmp, p.ripAmp);
    gl.uniform1f(U.uSat, p.sat);
    gl.uniform1f(U.uStyle, p.style);
    gl.uniform1f(U.uSize, p.size);
    gl.uniform1f(U.uCount, p.count);
    gl.uniform3fv(U.uBg, p.bg);
    gl.uniform1f(U.uSym, p.sym);
    gl.uniform1f(U.uSymN, p.symN);
    gl.uniform1f(U.uSymRot, p.symRot);
    gl.uniform3fv(U.uCol, p.colors);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(present);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(PU.uImg, 0);
    gl.uniform2f(PU.uRes, W, H);
    gl.uniform1f(PU.uBright, p.bright);
    gl.uniform1f(PU.uFlash, p.flash);
    gl.uniform1f(PU.uVignette, p.vignette);
    gl.uniform3fv(PU.uFlashCol, p.flashCol);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    cur = 1 - cur;
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    targets.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
    targets = [];
    gl.deleteProgram(prog);
    gl.deleteProgram(present);
  }

  return { render, resize, destroy, isLost: () => lost };
}
