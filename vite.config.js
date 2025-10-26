import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  
  build: {
    target: 'esnext',
    sourcemap: true,
    modulePreload: false,
    outDir: 'dist',
    rollupOptions: {
      external: ['leaflet'],
      output: {
        format: 'iife',
        name: 'GPXmap',
        generatedCode: {
          constBindings: true
        },
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        globals: {
          leaflet: 'L'
        }
      }
    },
    // Set as normal application build instead of library
    lib: false
  },

  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'examples/gc*.js',
          dest: 'examples'
        },
        {
          src: 'index.html',
          dest: '.',
          transform: (content) => {
            return content
              .toString()
              .replace(/<script.*?src="\/src\/main.ts".*?>/, '<script src="./assets/index.js">')
              .replace('<%= version %>', pkg.version);
          }
        }
      ]
    })
  ]
});
