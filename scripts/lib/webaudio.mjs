// What the browser's AnalyserNode does, in plain JavaScript, so the tests can feed the
// app's analysis the same spectra it gets in the app: Blackman window, FFT scaled by
// 1/N, smoothing over time on the magnitudes, output in dB (Web Audio spec 1.1.8).

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function createAnalyser({ fftSize = 4096, smoothing = 0.25, sampleRate = 48000 } = {}) {
  const N = fftSize;
  const win = new Float64Array(N);
  for (let n = 0; n < N; n++) win[n] = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / N) + 0.08 * Math.cos((4 * Math.PI * n) / N);
  const mag = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N);
  return {
    fftSize: N,
    sampleRate,
    frequencyBinCount: N / 2,
    // Spectrum of the fftSize samples that end just before index `end` of `pcm`.
    getFloatFrequencyData(out, pcm, end) {
      for (let n = 0; n < N; n++) {
        const i = end - N + n;
        re[n] = (i >= 0 && i < pcm.length ? pcm[i] : 0) * win[n];
        im[n] = 0;
      }
      fftInPlace(re, im);
      for (let k = 0; k < N / 2; k++) {
        mag[k] = smoothing * mag[k] + (1 - smoothing) * (Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N);
        out[k] = mag[k] > 0 ? 20 * Math.log10(mag[k]) : -Infinity;
      }
    },
  };
}
