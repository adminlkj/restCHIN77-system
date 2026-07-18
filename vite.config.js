import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  // sourcemaps لتسهيل تشخيص أخطاء الإنتاج (TDZ, etc.) — خرائط المصدر
  // تُظهر اسم الملف والسطر الأصلي بدلاً من الاسم المُختصَر (مثل te → invoiceTotals).
  build: {
    sourcemap: true,
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    // إعدادات HMR لتعمل عبر الـ gateway (Caddy على المنفذ 81)
    // بدون هذه الإعدادات، قد يفشل الـ HMR websocket في بيئة الـ sandbox.
    hmr: {
      // استخدم نفس الأصل (origin) الذي يُحمّل منه الـ client
      overlay: true,
      // السماح بالاتصال عبر الـ proxy
      clientPort: undefined,
      protocol: 'ws',
      host: 'localhost',
      port: 3000,
    },
    // السماح بطلات الـ proxy
    fs: {
      strict: false,
    },
    // تأكد من أن الـ assets تُقدّم بشكل صحيح
    origin: 'http://localhost:3000',
  },
});
