import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  root: path.resolve(__dirname, 'storefront-src'),
  build: {
    outDir: '../dist-marketing',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'storefront-src/marketing-main.tsx'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'storefront-src'),
      '@bhojan/location-core': path.resolve(__dirname, 'packages/location-core/src/index.ts'),
      '@bhojan/voice-core': path.resolve(__dirname, 'packages/voice-core/src/index.ts'),
      '@bhojan/storefront-design-system': path.resolve(__dirname, 'storefront-src/design-system'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      'react-router-dom': path.resolve(__dirname, 'node_modules/react-router-dom'),
      'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
      clsx: path.resolve(__dirname, 'node_modules/clsx'),
      'tailwind-merge': path.resolve(__dirname, 'node_modules/tailwind-merge'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: '/index.html',
      },
      manifest: {
        name: 'BhojanOS',
        short_name: 'BhojanOS',
        description: 'The Operating System for Food Businesses',
        theme_color: '#070504',
        background_color: '#070504',
        display: 'standalone',
      },
    }),
  ],
});
