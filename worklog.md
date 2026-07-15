
---
Task ID: branch-settings-restore
Agent: main (Z.ai Code)
Task: إصلاح اختفاء إعدادات الفروع + حذف mock backend نهائياً + النشر على Render

Work Log:
- فحص النظام المنشور فعلياً على Render (https://binaa-system-1.onrender.com) عبر API
- اكتشاف جوهري: النسخة المنشورة على Render هي نظام المقاولات القديم (title="بِنَاء - نظام إدارة المقاولات"، bundle=index-DENhrDKz.js)
- اكتشاف جوهري: force-push إلى origin/main (commit edf6605 "Clean repo") حذف BranchSettingsCard.jsx ورجّع Settings.jsx + branchSettings.js لنسخ قديمة
- استعادة package.json (كان مكسوراً — لا scripts ولا deps)
- إنشاء base44/entities/BranchSetting.jsonc (كان مفقوداً)
- حذف تعليق mock backend من AuthContext.jsx
- استعادة 4 ملفات من فرع backup-diverged: BranchSettingsCard.jsx, Settings.jsx, branchSettings.js, Branches.jsx
- إعادة بناء dist: التحقق من الـ bundle (BranchSetting ×6, إعدادات الفروع ×3, طاولات ×23, mockBackend ×0)
- تحديث .gitignore لاستبعاد restaurant-system/, skills/, .zscripts/, next-env.d.ts
- lint: 0 أخطاء
- commit: ff93a8a
- push إلى origin/main: ناجح (تحقق عبر ls-remote)
- اختبار API على Render: إنشاء فرع اختبار + BranchSetting ناجح (الخادم يدعم الكيان)
- Render frontend لم يُعد البناء بعد (~9 دقائق) — auto-deploy قد يكون معطّلاً

Stage Summary:
- الكود على GitHub (origin/main @ ff93a8a) صحيح وكامل
- الـ API على Render يدعم BranchSetting (متحقق بالاختبار)
- المتبقي: إعادة بناء Render للواجهة (يتطلب تدخل المستخدم في Render dashboard لتفعيل auto-deploy أو trigger manual deploy)
- mock backend محذوف نهائياً من الكود
- جميع إصلاحات إعدادات الفروع مستعادة وملتزمة ومدفوعة
