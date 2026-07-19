# Runbook — دليل إقلاع وتشغيل نظام مطعم RestCHIN77

> هذا المستند يصف كيف تُقلع النظام محلياً وللإنتاج. وُضع لأن النظام يتطلب
> قاعدة بيانات PostgreSQL + بيانات اعتماد Base44 — لا يمكن تشغيله بلاها.

---

## 1. المتطلبات

| المتطلب | الإصدار | السبب |
|---|---|---|
| Node.js | ≥ 18 | تشغيل الخادم + بناء الواجهة |
| PostgreSQL | ≥ 13 | قاعدة البيانات الرئيسية |
| Base44 CLI | latest | إدارة كيانات/دوال Base44 (اختياري محلياً) |

## 2. الإقلاع للإنتاج (Render — موصى به)

`render.yaml` مُهيّأ بالفعل. الخطوات:

1. ارفع المستودع لـ GitHub (تم: `adminlkj/restCHIN77-system`).
2. على [Render Dashboard](https://dashboard.render.com) → New → Blueprint → اربط المستودع.
3. سيُنشئ Render:
   - `binaa-postgres` (قاعدة بيانات PostgreSQL مُدارة).
   - `binaa-system` (خدمة ويب Node).
4. متغيرات البيئة تُحقن تلقائياً من `render.yaml`:
   - `DATABASE_URL` ← من قاعدة البيانات المُنشأة.
   - `JWT_SECRET` ← يُولَّد عشوائياً.
   - `NODE_ENV=production`.
5. عند أول إقلاع، يُنشئ `server/db.js` الجداول تلقائياً (`CREATE TABLE IF NOT EXISTS`).
6. أنشئ المالك الأول عبر `SYSTEM_OWNER_EMAIL` + `SYSTEM_OWNER_PASSWORD` (متغيرات بيئية).

### متغيرات بيئية إضافية موصى بها
| المتغير | القيمة الافتراضية | الغرض |
|---|---|---|
| `SYSTEM_OWNER_EMAIL` | `fysl71443@gmail.com` | بريد مالك النظام (له صلاحية مطلقة) |
| `SYSTEM_OWNER_PASSWORD` | — | كلمة مرور المالك الأول |
| `JWT_SECRET` | مُولّد | توقيع رموز المصادقة |
| `EMAIL_*` | — | خدمة البريد لاستعادة كلمة المرور |

## 3. الإقلاع المحلي (للتطوير)

### المتطلبات الإضافية
- PostgreSQL محلي مثبّت، أو Docker:
  ```bash
  docker run --name binaa-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=binaa -p 5432:5432 -d postgres:15
  ```

### الخطوات
1. أنشئ `.env.local` في جذر المشروع:
   ```bash
   DATABASE_URL=postgresql://postgres:dev@localhost:5432/binaa
   JWT_SECRET=local-dev-secret-change-me
   SYSTEM_OWNER_EMAIL=owner@example.com
   SYSTEM_OWNER_PASSWORD=owner-pass-123
   NODE_ENV=development
   ```
2. ثبّت الاعتماديات:
   ```bash
   npm install
   ```
3. شغّل الخادم + الواجهة معاً:
   ```bash
   npm start          # الخادم على :10000 (أو PORT)
   # في طرفية أخرى:
   npm run dev        # Vite على :5173
   ```
4. افتح `http://localhost:5173`.

### فحص صحة الإقلاع
- `GET /api/health` يجب أن يُرجع 200.
- `GET /api/auth/me` بدون رمز → 401 (متوقع).
- سجّل الدخول بـ `SYSTEM_OWNER_EMAIL` / `SYSTEM_OWNER_PASSWORD`.

## 4. التشخيص الشائع

| العَرَض | السبب المحتمل | الحل |
|---|---|---|
| `PostgreSQL connection is missing` | `DATABASE_URL` غير معرّفة | اضبط `.env.local` أو متغير Render |
| `relation "app_users" does not exist` | أول إقلاع لم يُهيّئ الجداول | `server/db.js` يُهيّئها تلقائياً؛ أعد التشغيل |
| الواجهة تُحمّل لكن `/api/*` يفشل 404 | الخادم غير مشغّل أو Vite proxy مفقود | شغّل `npm start` + تحقق `vite.config.js` |
| بيانات اعتماد Base44 مفقودة | الكيانات تُخزَّن في PostgreSQL المحلي بلا Base44 | النظام يعمل بلا Base44 للاختبار المحلي |
| `EADDRINUSE :10000` | منفذ مشغول | اضبط `PORT=10001` |

## 5. النسخ الاحتياطي

- قاعدة البيانات: استخدم `pg_dump` يومياً.
- مرفقات الملفات (`/uploads`): انسخها دورياً.

## 6. التحديث

```bash
git pull origin main
npm install            # إن تغيّرت الاعتماديات
npm run build          # بناء الإنتاج
# على Render: إعادة نشر تلقائية عند push إلى main
```

## 7. فحص ما قبل النشر (Pre-deploy checklist)

- [ ] `npm run lint` يجتاز (0 أخطاء)
- [ ] `npm run build` ينجح
- [ ] فحص البنية عبر esbuild (0 أخطاء) — تم في كل commit
- [ ] `.env` الإنتاجي يحوي `DATABASE_URL` + `JWT_SECRET`
- [ ] نسخة احتياطية من قاعدة البيانات القديمة
