import { defineConfig } from 'vite';
import { viteSingleFile } from "vite-plugin-singlefile"
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { createHtmlPlugin } from 'vite-plugin-html';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  
  build: {
    target: 'esnext',
    // modulePreload: false,
    // rollupOptions: {
    //   output: {
    //     format: "umd",
    //     inlineDynamicImports: true,
    //     entryFileNames: 'assets/[name].js',
    //     assetFileNames: 'assets/[name].[ext]'
    //   }
    // }
  },

  plugins: [
    createHtmlPlugin({
      minify: false,
      inject: {
        data: {
          version: pkg.version
        }
      }
    }),
    viteSingleFile(),
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
