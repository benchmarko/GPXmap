import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { createHtmlPlugin } from 'vite-plugin-html';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/GPXmap/',

  plugins: [
    createHtmlPlugin({
      inject: {
        data: {
          version: pkg.version
        }
      }
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'examples/gc*.js',
          dest: 'examples'
        }
      ]
    })
  ]
});
