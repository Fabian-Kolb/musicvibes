import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The desktop app loads the build from file://, hence relative asset paths.
// The content security policy is only added to the build: the dev server needs inline scripts.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'vibsync-csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
    },
  ],
});
