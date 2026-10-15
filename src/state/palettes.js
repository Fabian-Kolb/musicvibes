export const PALETTES = [
  { id: 'neon', name: 'Neon Club', cols: ['#ff2bd6', '#00e5ff', '#6a00ff', '#ff2f6d', '#00ffb3'] },
  { id: 'sunset', name: 'Sunset', cols: ['#ff6a00', '#ff2e63', '#ffc93c', '#b4009e', '#ff8f6b'] },
  { id: 'ocean', name: 'Ocean', cols: ['#0047ff', '#00d4ff', '#00ffc8', '#3b1cff', '#0a8bff'] },
  { id: 'aurora', name: 'Aurora', cols: ['#21ff9a', '#00c2ff', '#9d4dff', '#ff4fd8', '#1affd5'] },
  { id: 'lava', name: 'Lava', cols: ['#ff1e00', '#ff8a00', '#ffd000', '#c4002f', '#6d00a8'] },
  { id: 'matrix', name: 'Matrix', cols: ['#00ff66', '#00cc44', '#33ff88', '#008833', '#b6ff3b'] },
  { id: 'mono', name: 'Mono', cols: ['#7a2bff', '#b58cff', '#4a12d6', '#9b5cff', '#2d0b8f'] },
];

export const CUSTOM_PALETTE = 'custom';

export function paletteColors(settings) {
  if (settings.palette === CUSTOM_PALETTE) return settings.customColors;
  return (PALETTES.find((p) => p.id === settings.palette) || PALETTES[0]).cols;
}

export function hexToRgb(h) {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
