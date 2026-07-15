
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

---
Task ID: prod-audit-1
Agent: main (Z.ai Code)
Task: التدقيق النهائي لنظام المطعم المنشور على restchin77-system.onrender.com

Work Log:
- تم تصحيح الرابط: https://restchin77-system.onrender.com (الصحيح، وليس binaa-system-1)
- فحص الواجهة المنشورة فعلياً: title="نظام إدارة المطاعم - إيصالات حرارية"، bundle=index-BMHOx-6X.js
- التحقق من الـ bundle: BranchSetting ×6، إعدادات الفروع ×3، mockBackend ×0 (نظام مطعم نظيف)
- تسجيل الدخول بحساب المالك (fysl71443@gmail.com) ناجح
- الواجهة الرئيسية تعرض: إدارة الفروع مع فرع "الفرع الرئيسي" (BR-0001، الرياض، هاتف 0133300199)
- التنقل يعمل: لوحة المبيعات، نقطة البيع، الطلبات، معدات المطعم، المشتريات، المصروفات، الموارد البشرية، المالية، الخدمات، التقارير، الزبائن، المستخدمون، المخازن، الإعدادات

Stage Summary:
- النظام المنشور فعلياً هو نظام المطعم المُحدّث (النشر سليم على الرابط الصحيح)
- فرع واحد موجود (الفرع الرئيسي) لكن طاولاته = 0 (مشكلة: يجب أن تُنشأ طاولات افتراضية)
- سأتابع التدقيق الكامل عبر agent-browser


---
Task ID: prod-audit-2
Agent: main (Z.ai Code)
Task: إصلاح الأخطاء المكتشفة في التدقيق النهائي للـ POS

Work Log:
- فحص فعلي للنظام المنشور على restchin77-system.onrender.com (الرابط الصحيح)
- تسجيل الدخول ناجح، النشر محدّث (bundle=index-BMHOx-6X.js، نظام مطعم)
- تنفيذ دورة POS كاملة: طاولة → أصناف → دفع → طباعة (نجحت)
- اكتشاف BUG #1 (محاسبي جسيم): buildSalesInvoiceJE يستخدم ذمم العملاء (1121) دائماً حتى للنقدي
  - السبب: force-push إلى origin/main رجّع نسخة قديمة من postOperation/entry.ts
  - الفاتورة INV-2026-7135 النقدية أنشأت قيداً: 1121 Dr=120.75 (خطأ)
- إصلاح BUG #1: إعادة كتابة buildSalesInvoiceJE لتكون payment-method-aware:
  - نقدي: مدين = الصندوق/البنك/البطاقة حسب طريقة الدفع
  - منصة: مدين = مستحقات المنصات (1115) مع partyType=PLATFORM
  - آجل: مدين = ذمم العملاء (1121)
  - دفع متعدد: دمج نفس الطريقة في سطر واحد
  - تحقق توازن: throw إذا المدين ≠ الإجمالي
- إصلاح approveSalesInvoice: استخراج payments/isPlatformSale من invoice.notes
- اكتشاف BUG #2: الإيصال يكرر طرق الدفع (نقداً 105 + نقداً 15.75 كسطرين)
- إصلاح BUG #2: ThermalReceiptDocument يدمج طرق الدفع المتكررة
- اكتشاف BUG #3: POS يستخدم Select بدون بحث ذكي
- إصلاح BUG #3: استبدال Select بـ searchable combobox (اسم/جوال/خصم)
- اكتشاف BUG #4: لا يمكن إضافة عميل نقدي جديد من POS
- إصلاح BUG #4: إضافة QuickAddCashCustomerDialog (اسم/جوال/خصم ثابت)
- اكتشاف BUG #5: بحث Clients.jsx لا يشمل الهاتف
- إصلاح BUG #5: بحث ذكي بالاسم/الكود/الهاتف مع tail-match
- التحقق المنطقي: 5 اختبارات لـ buildSalesInvoiceJE (كلها نجحت)
- lint: 0 أخطاء، build: نجح (bundle=index-BlFBbeQ9.js)
- commit: 9daecdb

Stage Summary:
- جميع الإصلاحات محلياً ومُلتزمة
- BLOCKER: مفتاح SSH الأصلي ضاع (session reset حذف /home/z/.ssh/)
- توليد مفتاح جديد ممكن لكن يحتاج إضافته لـ GitHub (يتطلب تدخل المستخدم)
- الإصلاحات غير منشورة على Render بعد


---
Task ID: platform-settlements
Agent: main (Z.ai Code)
Task: نظام كشف حساب المنصات التلقائي + التسوية المحاسبية

Work Log:
- استخدمت مفتاح SSH المقدّم من المستخدم للدفع لـ GitHub
- أنشأت base44/entities/DeliveryPlatform.jsonc (كان مفقوداً): commissionRate, commissionVatRate, commissionMethod, vatOnCommissionEnabled, settlementAccountCode
- أنشأت base44/entities/PlatformSettlement.jsonc: settlementNo, platformId, periodFrom/To, totalSales, totalCommission, commissionVat, netPayable, settledAmount, paymentMethod, referenceNo, invoiceIds
- أضفت حقول المنصة لـ SalesInvoice.jsonc: platformId, platformName, platformCommission, platformCommissionVat, isPlatformSale, manualDiscount, deliveryFee
- عدّلت buildSalesInvoiceJE في postOperation/entry.ts لمبيعات المنصات:
  * مدين: ذمم المنصة (1115) بالصافي = total - commission - commissionVat
  * مدين: مصروف العمولة (5231)
  * مدين: ضريبة العمولة المدفوعة (1140)
  * دائن: إيرادات المبيعات (4100/4300) + ضريبة المبيعات (2160)
- أضفت operation PLATFORM_SETTLEMENT في postOperation:
  * مدين: البنك/الصندوق (settledAmount)
  * دائن: ذمم المنصة (1115) — يخفّض الذمة
- أضفت createPlatformSettlement + Validation rules
- أضفت OperationEngine.createPlatformSettlement في businessEngine.js
- أعدت كتابة DeliveryPlatforms.jsx:
  * تحميل التسويات مع المنصات والفواتير
  * كشف حساب تلقائي: revenue/commission/commissionVat/net/paid/pending (لا إدخال يدوي)
  * نافذة تسوية حقيقية تعرض ملخص الكشف + نموذج (تاريخ/مبلغ/طريقة/حساب/مرجع)
  * التسوية تنشئ PlatformSettlement + قيد JE عبر OperationEngine
- التحقق المنطقي: قيد المنصة متوازن (115 = 95.16 + 17.25 + 2.59 = 100 + 15)
- lint: 0 أخطاء، build: نجح (bundle=index-CieP5Ha7.js)
- commit: 4d1ba04، push: ناجح
- Render auto-deploy: نشر index-CieP5Ha7.js

التحقق الفعلي على Render (عبر API):
- إنشاء منصة هنقرستيشن (PL-0001, commission 15%): نجح
- إنشاء فاتورة منصة (INV-PLAT-TEST-1, 100+15 VAT=115, commission=17.25, commissionVat=2.59): نجح
- اعتماد الفاتورة → قيد JE مُرحّل:
  * 1115 Dr=95.16 (ذمم المنصة, partyType=PLATFORM) ✓
  * 5231 Dr=17.25 (مصروف عمولة) ✓
  * 1140 Dr=2.59 (ضريبة عمولة مدفوعة) ✓
  * 4300 Cr=100 (إيرادات الخدمات) ✓
  * 2160 Cr=15 (ضريبة مبيعات) ✓
  * متوازن: 115 = 115 ✓
- إنشاء تسوية (SET-PL-16103847, 95.16, BANK_TRANSFER): نجح → قيد JE:
  * 1112 Dr=95.16 (البنك) ✓
  * 1115 Cr=95.16 (إخفاض ذمة المنصة) ✓
  * متوازن: 95.16 = 95.16 ✓
- رصيد ذمم المنصة (1115) بعد التسوية = 0.00 (مغلق بالكامل) ✓

التحقق في الواجهة (agent-browser):
- صفحة المنصات → تبويب "كشوفات المنصات" تعرض:
  * هنقرستيشن: 1 طلب | إيرادات 115 | عمولة 17.25 | صافي 95.16 | مسدّد 95.16 | معلّق 0.00 ✓
- زر "تسوية" disabled عند المعلّق=0 (لا تسوية زائدة) ✓

Stage Summary:
- نظام كشف حساب المنصات يعمل بكامله على Render (مُتحقق فعلياً)
- الفاتورة هي المصدر، الكشف يُبنى تلقائياً، التسوية تخفّض الذمة تدريجياً
- العمولة وضريبتها تُسجّلان محاسبياً عند البيع (لا انتظار للتحصيل)
- التسوية تنشئ قيداً حقيقياً (لا patch مباشر)

---
Task ID: platform-settlement-methods
Agent: main (Z.ai Code)
Task: مرونة طرق التسوية (NET/GROSS) + عرض محاسبي صحيح للكشف

Work Log:
- أضفت settlementMethod (NET/GROSS) لمخطط DeliveryPlatform
- NET (افتراضي): المنصة تخصم العمولة قبل التحويل
  * قيد الفاتورة: مدين 1115 (الصافي) + 5231 (عمولة) + 1140 (ض.عمولة)
  * قيد التسوية: مدين بنك / دائن 1115 (نقدي فقط)
- GROSS: المنصة تحوّل بالإجمالي ثم تصدر فاتورة عمولة
  * قيد الفاتورة: مدين 1115 (الإجمالي كاملاً)، لا عمولة بعد
  * قيد التسوية: مدين بنك (الصافي) + 5231 (عمولة) + 1140 (ض.عمولة) / دائن 1115 (الإجمالي)
- approveSalesInvoice يحمل settlementMethod من سجل المنصة
- createPlatformSettlement يبني القيد حسب الطريقة
- عرض الكشف محاسبياً صحيح:
  * salesPreTax (الإيراد قبل الضريبة) — وليس الإجمالي
  * salesVat (ضريبة المبيعات) منفصلة
  * salesTotal (الإجمالي شامل الضريبة)
  * commission + commissionRate% (النسبة مع المبلغ)
  * commissionVat (ضريبة العمولة)
  * net (الصافي = إجمالي - عمولة - ض.عمولة)
  * paid (المحصل من التسويات)
  * pending (المتبقي = صافي - محصل)
- بطاقات ملخص: 8 بطاقات (طلبات/قبل الضريبة/ض.مبيعات/إجمالي/عمولات/ض.عمولات/صافي/متبقي)
- جدول الكشوفات: 11 عمود بشارة طريقة التسوية
- نموذج المنصة: حقول commissionVatRate, commissionMethod, settlementMethod, settlementAccountCode
- إصلاح: استيراد Select المفقود (كان يكسر الصفحة)
- lint: 0، build: نجح، commit: 6e9ead9، push: ناجح
- Render نشر index-C-plOqWC.js

التحقق الفعلي على Render:
- إنشاء منصة جاهز (GROSS, 15% عمولة): نجح
- فاتورة GROSS (200+30=230, عمولة 34.5, ض.عمولة 5.18):
  * قيد الفاتورة: 1115 Dr=230 / 4300 Cr=200 + 2160 Cr=30 (متوازن، لا عمولة) ✓
- تسوية GROSS (cash 190.32):
  * قيد التسوية: 1112 Dr=190.32 + 5231 Dr=34.5 + 1140 Dr=5.18 / 1115 Cr=230 (متوازن) ✓
  * رصيد 1115 (جاهز) = 0.00 بعد التسوية ✓
- الواجهة تعرض:
  * جاهز GROSS: 3 طلبات | مبيعات قبل الضريبة 505 | ض.مبيعات 75.75 | إجمالي 580.75 | عمولة 89.70 (15%) | ض.عمولة 13.47 | صافي 477.59 | محصل 190.32 | متبقي 287.27 ✓
  * هنقرستيشن NET: 1 طلب | مبيعات قبل الضريبة 100 | ض.مبيعات 15 | إجمالي 115 | عمولة 17.25 (15%) | ض.عمولة 2.59 | صافي 95.16 | محصل 95.16 | متبقي 0.00 ✓
- بطاقات الملخص: طلبات 4 | قبل الضريبة 605 | ض.مبيعات 90.75 | إجمالي 695.75 | عمولات 106.95 | ض.عمولات 16.06 | صافي 572.75 | متبقي 287.27 ✓

Stage Summary:
- كل الملاحظات المحاسبية المُقدّمة نُفّذت:
  1. مرونة طرق التسوية (NET/GROSS) في اتفاقية المنصة ✓
  2. عرض الإيراد قبل الضريبة + الضريبة + الإجمالي ✓
  3. عرض نسبة العمولة بجانب المبلغ ✓
  4. ملخص شامل في رأس الكشف ✓
  5. المجاميع تُحسب دائماً من الفواتير والتسويات (لا تخزين) ✓
- كلتا الطريقتين متوازنتان ومُتحقق منهما على Render
