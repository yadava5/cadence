import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: [
      'react-resizable-panels',
      'react-dropzone',
      '@radix-ui/react-toggle',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Point @shared to the typed shared package source for dev
      '@shared': fileURLToPath(
        new URL('./packages/shared/src', import.meta.url)
      ),
    },
  },
  build: {
    // Enable minification and tree-shaking
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      // A circular manual chunk fails the build. It is not a style issue.
      //
      // rollup exits 0 while printing "Circular chunk: radix-core ->
      // radix-extended -> radix-core" and writes a bundle whose chunks import
      // each other — and when one side needs a value from the other during
      // evaluation, that bundle throws before React mounts and every route
      // renders blank. @radix-ui/react-slot 1.3.3 did exactly that: it ships
      // esbuild keep-names wrappers, and the helper lived in the other chunk.
      // CI's Build job asks only whether rollup exited 0, and no CI job or
      // Vercel build step loads the bundle it writes. The e2e suite does load
      // it — that is what caught this one — but CI does not run e2e. This
      // step can, at build time, for free.
      //
      // Only CIRCULAR_CHUNK is promoted. Everything else goes to vite's own
      // handler unchanged, chunk-size warnings included.
      onwarn(warning, defaultHandler) {
        if (warning.code === 'CIRCULAR_CHUNK') {
          throw new Error(
            `${warning.message}\n` +
              'Refusing to emit a bundle whose manual chunks import each ' +
              'other: the evaluation order is not guaranteed, so the app can ' +
              'render blank while the build still exits 0. Move the shared ' +
              'package into the chunk that imports it.'
          );
        }
        defaultHandler(warning);
      },
      output: {
        // Optimize chunk strategy for lazy loading
        manualChunks: {
          // Core React dependencies (loaded on initial page)
          react: ['react', 'react-dom'],

          // Router and state management (loaded on initial page)
          'react-router': ['react-router-dom'],
          'state-management': ['zustand', '@tanstack/react-query'],

          // UI component libraries (split by usage frequency)
          //
          // react-slot and react-primitive are listed HERE, with the components
          // that import them. dialog/popover/tooltip depend on slot and all
          // five depend on primitive, while alert-dialog (radix-extended)
          // depends on dialog — so leaving either of those two shared packages
          // on the radix-extended side makes the two chunks import each other.
          // Rollup says exactly that ("Circular chunk: radix-core ->
          // radix-extended -> radix-core"), and from slot 1.3.3 the cycle is
          // fatal rather than untidy: the package ships esbuild keep-names
          // wrappers now, so radix-core evaluates first and calls the
          // not-yet-initialised `__name` helper that landed in the other chunk
          // — "TypeError: q is not a function", and the whole app renders
          // blank. Anything added to radix-extended that a radix-core package
          // imports will do it again; the chunks must stay a one-way edge.
          'radix-core': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-tabs',
            '@radix-ui/react-slot',
            '@radix-ui/react-primitive',
          ],
          'radix-extended': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-label',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-switch',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-icons',
          ],

          // Calendar functionality (lazy loaded when needed)
          calendar: [
            '@fullcalendar/react',
            '@fullcalendar/core',
            '@fullcalendar/daygrid',
            '@fullcalendar/timegrid',
            '@fullcalendar/list',
            '@fullcalendar/interaction',
          ],

          // NLP and smart input (lazy loaded)
          nlp: ['chrono-node', 'compromise'],

          // Analytics visualization (lazy loaded)
          analytics: ['recharts'],

          // Emoji picker (lazy loaded)
          emoji: ['@emoji-mart/react', '@emoji-mart/data', 'emoji-mart'],

          // Rich text editor (lazy loaded)
          editor: ['pell', 'rangy'],

          // PDF viewer (lazy loaded)
          pdf: ['pdfjs-dist'],

          // Drag and drop (lazy loaded)
          dnd: ['react-dnd', 'react-dnd-html5-backend', '@dnd-kit/core'],

          // Animation library (lazy loaded)
          animation: ['framer-motion', '@use-gesture/react'],

          // Utility libraries
          utils: [
            'date-fns',
            'date-fns-tz',
            'uuid',
            'clsx',
            'class-variance-authority',
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Local Express backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
