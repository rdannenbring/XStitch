import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Custom plugin to copy manifest.json to dist
const copyManifest = () => {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const manifestPath = resolve(__dirname, 'manifest.json');
      const distPath = resolve(__dirname, 'dist', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        fs.copyFileSync(manifestPath, distPath);
        console.log('Manifest copied to dist/');
      }
    }
  };
};

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/monaco-editor/min/vs',
          dest: 'monaco'
        },
        {
          src: 'notification.css',
          dest: '.'
        },
        {
          src: 'icons',
          dest: '.'
        }
      ]
    }),
    copyManifest()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        preview: resolve(__dirname, 'preview.html'),
        background: resolve(__dirname, 'background.ts'),
        content: resolve(__dirname, 'content.ts'),
        inject: resolve(__dirname, 'inject.js'),
        options: resolve(__dirname, 'options.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});