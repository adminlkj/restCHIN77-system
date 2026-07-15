
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

---
Task ID: pos-cycles-separation
Agent: main (Z.ai Code)
Task: فصل دورات البيع الثلاث + الخصومات + إصلاح الحالة + إكمال الإيصال

Work Log:
- أضفت فرض تفرّد رقم الفاتورة في createSalesInvoice (منع التكرار)
- أعدت كتابة approveSalesInvoice لتحديد الحالة تلقائياً:
  * نقدي (payments تغطي الإجمالي): PAID + paidAmount=الإجمالي
  * منصة/آجل (لا دفع): APPROVED + paidAmount=0
- أزلت تحديث الحالة المباشر من POS (كان ممنوعاً من الخادم)
- أضفت منع اجتماع "زبون نقدي" + "منصة" في handlePrintReceipt
- في بيع المنصة: clientName = اسم المنصة (لا "زبون نقدي")
- أضفت تتبع cashReceived (النقد المستلم) منفصلاً عن paidAmount
- paidAmount = min(total, cashReceived) — لا يُخزّن > الإجمالي
- change = cashReceived - total (يظهر في POS + الإيصال)
- أضفت نظام الخصومات الثلاثي:
  * خصم على الصنف (item.discount لكل وحدة) — UI في سلة POS
  * خصم العميل (%) — تلقائي من customer.discountPercentage
  * خصم يدوي على الفاتورة (مبلغ/نسبة) — UI مع toggle
  * الترتيب: خصم الأصناف → خصم العميل → خصم يدوي → الضريبة على الصافي
- أضفت saleType (DINE_IN/TAKEAWAY/DIRECT_DELIVERY/PLATFORM/CREDIT)
- أضفت شارات نوع البيع في شاشة الإيصالات (عمود جديد "النوع")
- أعدت كتابة الإيصال الحراري:
  * المجموع قبل الخصومات
  * خصومات الأصناف / خصم العميل / خصم إضافي (أسطر منفصلة)
  * القاعدة الخاضعة للضريبة
  * طرق الدفع المدمجة
  * المستلم من الزبون + الباقي للزبون (للنقدي)
  * شارة نوع البيع في الترويسة والتذييل
  * اسم المنصة + العمولة (للمنصة)
- lint: 0، build: نجح (index-D1jey2VV.js)
- commit: 6dad947، push: ناجح
- Render نشر index-D1jey2VV.js

التحقق الفعلي على Render:
- فاتورة نقدية INV-CASH-1784119062:
  * status=PAID ✓ (ليس APPROVED)
  * paidAmount=115 ✓ (= الإجمالي)
  * JE: 1111 Dr=115 (صندوق) / 4100 Cr=100 / 2160 Cr=15 — متوازن ✓
- فاتورة منصة INV-PLAT-TEST-1:
  * status=APPROVED ✓ (ليس PAID — ذمة)
  * paidAmount=0 ✓ (آجلة)
- فاتورة مكررة INV-CASH-TEST-001: رُفضت ("مستخدم بالفعل") ✓
- شاشة الإيصالات تعرض شارات: صالة / منصة (جاهز) ✓
- الإيصال يعرض: النوع (صالة)، طرق الدفع (نقداً 115)، المستلم (120)، الباقي (5) ✓

Stage Summary:
- كل الـ 12 ملاحظة نُفّذت:
  1. فصل زبون نقدي عن منصة ✓
  2. النقدي = PAID (ليس APPROVED) ✓
  3. الحالة تتطابق مع المدفوع ✓
  4. المدفوع لا يتجاوز الإجمالي (cashReceived منفصل) ✓
  5. تفرّد رقم الفاتورة ✓
  6. شارات نوع البيع ✓
  7. الخصومات (صنف/عميل/يدوي) ✓
  8. طرق الدفع في الإيصال ✓
  9. المستلم والباقي ✓
  10. منصة = APPROVED (ذمة) وليس PAID ✓
  11. فصل العميل النقدي عن المسجل عن المنصة ✓
  12. إكمال الإيصال (كل البيانات) ✓


---
Task ID: clean-equipment
Agent: general-purpose
Task: Clean Equipment.jsx for restaurant equipment

Work Log:
- أزلت من emptyForm حقول البناء الثقيل: plateNumber (رقم اللوحة)، dailyRate/monthlyRate/hourlyRate (أسعار التأجير). أضفت بدلاً منها حقل location (مكان المعدة داخل المطعم).
- أعدت كتابة save() لإزالة parseFloat على dailyRate/monthlyRate/hourlyRate، مع الإبقاء على purchaseCost و currentValue و year.
- أعدت كتابة remove(): استبدلت الفحوصات الثلاثة لـ RentalContract + RentalInvoice + OperatingHours بفحص واحد لـ MaintenanceRecord (base44.entities.MaintenanceRecord.filter({ equipmentId })) — مع رسالة "لا يمكن حذف معدة لها سجلات صيانة". هذا يحافظ على مرجع الصيانة فقط.
- عرّفت ثابتاً محلياً RESTAURANT_EQUIPMENT_STATUS يُنشأ بتصفية EQUIPMENT_STATUS (المستورد من src/lib دون تعديله) لحذف حالة RENTED من كل واجهات الاختيار/العرض. السجلات القديمة ذات status=RENTED (إن وُجدت) تُعرض كـ IN_USE عبر fallback.
- حدّثت عناوين الواجهة: العنوان "المعدات" → "معدات المطعم" / "Restaurant Equipment"، والعنوان الفرعي "إدارة أسطول المعدات والآليات" → "إدارة معدات المطعم وأجهزته (كاشير، طابعات حرارية، ثلاجات، فريزر، فرن، خلاطات، ماكينة قهوة)".
- حدّثت عنوان TableToolbar إلى "معدات المطعم" / "Restaurant Equipment".
- نظّفت أعمدة الجدول: حذفت عمود "رقم اللوحة" وعمود "سعر يومي"، وأضفت عمود "الموقع" / "Location". أصبح عدد الأعمدة 7 (كان 8)، مع تحديث colSpan والـ skeleton rows.
- نظّفت exportColumns: حذفت plateNumber و dailyRate، أضفت location و serialNumber.
- نظّفت حقول النموذج: حذفت plateNumber/dailyRate/monthlyRate/hourlyRate، أضفت location. غيّرت تسمية "السنة" → "سنة الصنع" / "Year".
- وسّعت محرّك البحث ليشمل serialNumber و location (بالإضافة إلى code و name).
- أزلت زر "مركز العمل" (Workspace) ورابط الاسم القابل للنقر ودالة openWorkspace واستيراد ArrowUpRight — لأن equipment-workspace مُصنّف ضمن مجموعة rental في permissions.js ويرتبط بمفاهيم التأجير.
- أزلت setEquipmentContext و setActiveItem من تفكيك useStore (لم تعُد تُستخدم بعد حذف openWorkspace).
- أزلت استيراد formatCurrency غير المستخدم بعد حذف عمود السعر اليومي.
- حافظت على: اسم الكيان base44.entities.Equipment، جميع عمليات CRUD (list/create/update/delete/filter)، دالة nextCodeFromList مع البادئة 'EQP'، الحقول المتوافقة مع مطعم (code, name, nameAr, type, brand, model, year, serialNumber, purchaseDate, purchaseCost, currentValue, notes, status)، الـ ConfirmDialog، التوفّر ثنائي اللغة عبر t().
- لم ألمس أي ملف في src/lib/ (EQUIPMENT_STATUS يبقى كما هو؛ التصفية تتم محلياً في الصفحة فقط).
- لم ألمس Equipment.jsonc ولا أي ملف كيان آخر.
- لم ألمس EquipmentMaintenance.jsx ولا أي صفحة أخرى.
- lint: 0 أخطاء و 0 تحذيرات على src/pages/Equipment.jsx (eslint exit 0).

Stage Summary:
- Equipment.jsx أصبحت سجلّاً نقياً لمعدات المطعم: كاشير، طابعات حرارية، ثلاجات، فريزر، فرن، خلاطات، ماكينة قهوة... لا توجد أي إشارة لأسطول المعدات/الآليات أو رقم لوحة أو سعر تأجير أو ساعات تشغيل أو موقع بناء.
- جميع عمليات CRUD تعمل دون تغيير في اسم الكيان أو واجهة API.
- حذف معدة يُحجب فقط عند وجود سجلات صيانة (MaintenanceRecord) — لا فحوصات لعقود الإيجار أو الفواتير أو ساعات التشغيل.
- حالة RENTED محذوفة من كل واجهات الاختيار والعرض، مع fallback آمن إلى IN_USE للسجلات القديمة.
- حقل location جديد لتسجيل مكان المعدة داخل المطعم (المطبخ/الكاشير/الصالة...).
- الكود ثنائي اللغة بالكامل عبر t()، ومرّر eslint بنجاح.


---
Task ID: clean-expenses
Agent: general-purpose
Task: تنظيف صفحة المصروفات من مفاهيم البناء (مشروع/معدات/عقد/موقع)

Work Log:
- قرأت worklog.md وملفّي src/pages/Expenses.jsx و src/components/expenses/ExpenseDialog.jsx، وفحصت src/lib/utils-binaa.js (للقراءة فقط — لم أُعدّله) للتأكد من EXPENSE_TYPES و EXPENSE_CATEGORIES وقيم accountRole (EXPENSE_PROJECT, EXPENSE_EQUIPMENT, EXPENSE_EMPLOYEE, EXPENSE_GOVERNMENT, EXPENSE_ADMIN, EXPENSE_GENERAL) المتوافقة مع businessEngine.js و postOperation/entry.ts.

التغييرات على src/components/expenses/ExpenseTypePicker.jsx (تعديل طفيف لدعم التصفية):
- أضفت prop اختياري `types = EXPENSE_TYPES` (افتراضي لكامل القائمة للحفاظ على التوافق مع أي مستدعٍ آخر)، واستبدلت `EXPENSE_TYPES.map` بـ `types.map` داخل العرض. وثّقت السبب في تعليق عربي. لم أحذف أيقونات Building2/Truck من الـ ICONS map كي يبقى المكون متوافقاً مع أي مستدعٍ قديم.

التغييرات على src/components/expenses/ExpenseDialog.jsx:
- أضفت ثابتين محليّين:
  * `HIDDEN_EXPENSE_TYPES = ['PROJECT', 'EQUIPMENT']` — الأنواع الخاصة بالبناء المحجوبة عن الواجهة.
  * `RESTAURANT_EXPENSE_TYPES = EXPENSE_TYPES.filter(t => !HIDDEN_EXPENSE_TYPES.includes(t.key))` — قائمة مُصدَّرة تضم فقط: EMPLOYEE, GOVERNMENT, ADMIN, COMPANY.
- أضفت `LEGACY_TYPE_DISPLAY_FALLBACK = { PROJECT: 'COMPANY', EQUIPMENT: 'ADMIN' }` ودالة مُصدَّرة `getRestaurantExpenseType(key)` تُسقط أي نوع بناء قديم إلى نوع مطعمي للعرض فقط (دون تغيير القيمة المخزّنة). هذا يحافظ على التوافق مع قيم accountRole في src/lib (EXPENSE_PROJECT/EXPENSE_EQUIPMENT تبقى كما هي في البيانات).
- مرّرت `types={RESTAURANT_EXPENSE_TYPES}` إلى ExpenseTypePicker لإخفاء PROJECT/EQUIPMENT من شاشة اختيار النوع.
- حذفت تماماً الكتلتين الديناميكيتين لـ `project` و `equipment` (كانتا تعرضان اختيار المشروع واختيار المعدات). أبقيت الكتلتين الديناميكيتين `employee` (لمصروف الموظف) و `govEntity` (لمصروف الجهة الحكومية) لأنهما مطعميتان (الرواتب تُدار في HR، والرسوم الحكومية مطعمية: الزكاة والبلدية والغذاء والدواء). أصبح الفحص يعتمد على `originalTypeDef.fields` (تعريف النوع الأصلي) لكي تظل السجلات القديمة قابلة للتحرير دون فقد فئاتها.
- حدّثت placeholder لـ govEntity من "مثل: البلدية، الجوازات..." إلى "مثل: الزكاة والضريبة، البلدية، الغذاء والدواء...".
- حذفت `projects`, `equipment`, `subcontractors` من props الدالة. أبقيت `employees` فقط (تُستخدم في الكتلة الديناميكية لموظف).
- عرض النوع (شارة typeDef ولقب النافذة) أصبح يستخدم `getRestaurantExpenseType` بحيث يُعرض السجل القديم من نوع PROJECT كـ "مصروف شركة / Company Expense" ونوع EQUIPMENT كـ "مصروف إداري / Administrative Expense".
- تعليق عام مُوضِّح أنواع البناء المحجوبة وعلاقتها بـ postOperation/entry.ts.

التغييرات على src/pages/Expenses.jsx:
- حذفت استيراد `EXPENSE_TYPES, getExpenseType` من utils-binaa (لم يعُد يُستخدم). أبقيت `EXPENSE_CATEGORIES, formatCurrency, formatDate, t`.
- استوردت `RESTAURANT_EXPENSE_TYPES, getRestaurantExpenseType` من ExpenseDialog.
- حذفت من `empty`: projectId, projectName, equipmentId, equipmentName, subcontractorId, subcontractorName. أبقيت: employeeId, employeeName, govEntity.
- حذفت من تفكيك useStore: `activeProjectId, activeProjectName` (لم يعُد يُستخدم).
- حذفت state وloading لـ: projects, equipment, subcontractors. أبقيت: items, employees, accounts.
- ضيّقت `Promise.all` في `load()` من 6 نداءات إلى 3: Expense.list + Employee.list + ChartAccount.list. لا نداء لـ Project/Equipment/Subcontractor بعد الآن.
- بسّطت `buildDefaultForm` إلى `{ ...empty }` (كانت تضبط expenseType=PROJECT عند وجود activeProjectId — مفهوم بناء).
- ضيّقت `refs` من `{ projects, equipment, employees, subcontractors }` إلى `{ employees }` فقط. التحققت أن businessEngine._buildExpensePayload يتحمّل غياب المفاتيح برجوع nameOf إلى القيمة المخزّنة (فارغة) دون أخطاء — مرّت eslint والبناء.
- في `exportColumns`: عمود "مرتبط بـ" أصبح `r.employeeName || r.govEntity || ''` (كان `r.projectName || r.equipmentName || r.employeeName || r.subcontractorName || r.govEntity`).
- عمود "النوع" في exportColumns والجدول أصبح يستخدم `getRestaurantExpenseType(...)` بدل `getExpenseType(...)` لعرض السجلات القديمة بالأنواع المطعمية المعاد تعيينها.
- في الجدول: `linked = item.employeeName || item.govEntity || '—'` (كان يشمل projectName/equipmentName/subcontractorName).
- فلتر "النوع" في شريط الأدوات أصبح يعتمد على `RESTAURANT_EXPENSE_TYPES.map(...)` بدل `EXPENSE_TYPES.map(...)` — فلا تظهر خيارات PROJECT/EQUIPMENT.
- حدّثت عنوان الصفحة من "المصروفات العامة / General Expenses" إلى "المصروفات / Expenses"، والعنوان الفرعي من "تسجيل ومتابعة المصروفات التشغيلية / Track operational expenses" إلى "تسجيل ومتابعة مصروفات المطعم / Track restaurant expenses"، واسم ملف التصدير في TableToolbar إلى "المصروفات / Expenses".
- حذفت props غير المستخدمة من `<ExpenseDialog>`: projects, equipment, subcontractors. أبقيت: employees, expenseAccounts, cashAccounts.

القواعد الملتزَم بها:
- لم ألمس src/lib/ إطلاقاً (utils-binaa.js, businessEngine.js, postingEngine.js, standardChart.js كما هي).
- لم أغيّر اسم الكيان ولا واجهات API: `base44.entities.Expense` (list/create/update/delete/filter) و`base44.entities.JournalEntry` و`base44.entities.Employee` و`base44.entities.ChartAccount` كما هي.
- أبقيت نداءات OperationEngine.createExpense / updateExpense (مع refs مختصرة)، ودالة العكس reverse()، ودالة الحذف remove()، وConfirmDialog، والـ search/filterType/filterCat.
- أبقيت ثنائية اللغة عبر t() في كل النصوص الجديدة والمعدَّلة.
- قيم accountRole في src/lib (EXPENSE_PROJECT, EXPENSE_EQUIPMENT, EXPENSE_GENERAL, EXPENSE_ADMIN, EXPENSE_EMPLOYEE, EXPENSE_GOVERNMENT) تبقى دون تغيير — فقط لم تعُد تُختار من الواجهة للأنواع المحجوبة. السجلات القديمة بالأنواع PROJECT/EQUIPMENT تُعرض بـ COMPANY/ADMIN للقراءة فقط وتُحفظ قيمها الأصلية عند التحديث.

التحقق:
- eslint على الملفات الثلاثة (Expenses.jsx, ExpenseDialog.jsx, ExpenseTypePicker.jsx): exit 0 (0 أخطاء، 0 تحذيرات).
- vite build: نجح (bundle index-S73srD7F.js، 2723 modules، 10.56s).
- فحص bundle: مصطلحات البناء "مصروف مشروع/مصروف عقد/مصروف موقع" غائبة كلياً. "مصروف معدة" و "مصروف طلب" لا تزال موجودة كقيم حرفية في utils-binaa.js (محظور تعديلها) لكنها محجوبة عن كل واجهات الاختيار والعرض بفضل RESTAURANT_EXPENSE_TYPES وgetRestaurantExpenseType.

Stage Summary:
- صفحة المصروفات أصبحت مطعمية بالكامل في الواجهة: لا اختيار مشروع/معدات/عقد/موقع/BOQ، لا تحميل لكيانات Project/Equipment/Subcontractor.
- أنواع المصروفات الظاهرة للإنشاء الجديد: مصروف موظف، مصروف حكومي، مصروف إداري، مصروف شركة (عمومي) — مع فئات مطعمية متاحة لكل نوع (إيجار/كهرباء/مياه/صيانة/مستهلكات/خدمات/مكتبية/ضيافة/سفر/رواتب/رسوم حكومية/تراخيص/تأمين/أخرى).
- السجلات القديمة بالأنواع PROJECT/EQUIPMENT تُعرض بأمان كـ "مصروف شركة"/"مصروف إداري" ولا تنكسر عند التحرير (يُحترم originalTypeDef للفئات والحقول الديناميكية المتبقية).
- العمليات الحسابية والقيد المحاسبي (OperationEngine → postOperation) تعمل دون تغيير في العقد.
- لم يُلمس أي ملف في src/lib/.


---
Task ID: clean-projects-dashboard
Agent: general-purpose
Task: تنظيف صفحات الطلبات (Projects.jsx) ولوحة المبيعات (Dashboard.jsx) ومراكز التكلفة (CostCenters.jsx) من بقايا مفاهيم البناء

Work Log:
- قرأت worklog.md لفهم العمل السابق (تنظيف Equipment.jsx و Expenses.jsx بنفس النمط: إزالة المفاهيم البنائية مع الإبقاء على الكيان/CRUD/OperationEngine).

التغييرات على src/pages/Projects.jsx:
- emptyForm: حذفت حقول البناء الثلاثة: location (موقع الإنشاء)، contractValue (قيمة العقد)، projectType (نوع مشروع البناء). أبقيت: code, name, nameAr, clientId, clientName, startDate, endDate, status, description.
- حذفت ثابت PROJECT_TYPES بالكامل (كان: CONSTRUCTION/RENTAL/BOTH مع تسميات مخفّفة "Restaurant/Rental/Both" — العنصر CONSTRUCTION بنفسه بقايا بناء).
- openEdit: بسّطته إلى `{ ...emptyForm, ...item }` (كان يضيف `contractValue: item.contractValue || ''`).
- save: حذفت `contractValue: parseFloat(form.contractValue) || 0` من حمولة البيانات المرسَلة للكيان. أبقيت منطق nextCodeFromList + clientName من الزبون المختار.
- remove: حذفت 6 فحوصات كيانات بنائية من Promise.all: Contract, BOQItem, ProgressBilling, ChangeOrder, ProjectDocument, ContractItem. أبقيت 5 فحوصات مطعمية: SalesInvoice (إيصالات)، PurchaseOrder (مشتريات)، Expense (مصروفات)، WorkOrder، DailyReport. هذا يمنع أخطاء "entity not found" عند الحذف ويُبقي الحماية على المعاملات المرتبطة بالطلب.
- exportColumns: حذفت عمودي "النوع/Type" و"قيمة العقد/Contract Value". أبقيت: الكود، اسم الطلب، الزبون، الحالة، تاريخ البدء (5 أعمدة بدل 7).
- رأس الجدول: حذفت عمودي "النوع" و"قيمة العقد" (من 8 أعمدة إلى 6).
- جسم الجدول: حذفت خلية شارة النوع (pt) وخلية قيمة العقد (formatCurrency). حذفت متغير `pt` المحلي. حدّثت skeleton rows من length:8 إلى length:6، وcolSpan من 8 إلى 6 لحالة "لا توجد طلبات".
- التذييل: حذفت سطر "إجمالي قيمة العقود / Total contract value" مع reduce على contractValue. أبقيت عدّاد الطلبات فقط.
- بانر المعلومات: حدّثت النص من "لعرض العقود والإيصالات والمصروفات والمستندات" إلى "لعرض الإيصالات والمصروفات والمستندات" (إزالة كلمة "العقود/contracts").
- نموذج الحوار: حذفت 3 حقول إدخال: "الموقع/Location"، "قيمة العقد/Contract Value"، "نوع الطلب/Order Type" (مع Select الخاص به). النموذج الآن: كود، اسم، اسم عربي، زبون، تاريخ بدء، تاريخ انتهاء، حالة، وصف.
- حدّثت العنوان الفرعي من "إدارة طلبات المطاعم والتنفيذ / Manage restaurant and execution orders" إلى "إدارة طلبات المطعم والفروع / Manage restaurant orders and branches" (إزالة كلمة "التنفيذ/execution" البنائية).
- أضفت تعليقين توضيحيين عربيين فوق emptyForm وفوق checks في remove() لتوثيق ما حُذف ولماذا.
- حذفت استيراد formatCurrency غير المستخدم بعد إزالة جميع استدعاءاته. أبقيت: t, formatDate, PROJECT_STATUS, nextCodeFromList.
- حافظت على: الكيان base44.entities.Project (list/create/update/delete/filter)، validate('PROJECT', form)، canTransition('PROJECT', ...) من workflowEngine، openWorkspace → setActiveItem('project-workspace') (فتح الطلب → مركز العمل → POS/Tables)، nextCodeFromList(items, 'PRJ')، Project.filter في load()، Client.list، الـ ConfirmDialog، TableToolbar، البحث وفلتر الحالة، توفّر ثنائي اللغة عبر t()، صلاحيات usePermissions('projects').
- حالة 'PLANNING' الافتراضية في emptyForm تُترجم تلقائياً عبر PROJECT_STATUS في utils-binaa.js إلى "قيد التحضير/Preparing" — ليست مصطلحاً بنائياً ظاهراً للمستخدم.

التغييرات على src/pages/Dashboard.jsx:
- فحص كامل: اللوحة كانت بالفعل مطعمية بالكامل (لا KPIs/widget بنائية). تتضمن: مبيعات اليوم، عدد الإيصالات، متوسط الإيصال، طاولات نشطة، إجمالي الإيرادات، طاولات مشغولة، أصناف القائمة، الأكثر مبيعاً، طرق الدفع، مبيعات الفروع، أحدث الإيصالات، إجراءات سريعة (POS/Tables/Branches/Receipts/Customers/Reports).
- تنظيف: حذفت `activeProjectName` من تفكيك useStore (كانت مُستوردة بلا استخدام — بقايا التخطيط البنائي القديم الذي كان يعرض اسم المشروع النشط).
- تنظيف: حذفت استيراد useAuth و `const { user } = useAuth()` (كانت user غير مستخدمة — تحذير lint سابق).
- حافظت على: activeProjectId (يُستخدم في getBranchTableStats و useEffect dependency)، load() مع SalesInvoice.list + InventoryItem.filter + Project.filter({ status: 'ACTIVE' }) (Project = Branch هنا)، branchRevenue المبني على inv.projectName (اسم الفرع من الفاتورة)، جميع KPIs/Widgets المطعمية.

التغييرات على src/pages/CostCenters.jsx:
- فحص كامل: كل التسميات الظاهرة للمستخدم كانت بالفعل مطعمية: العنوان "تحليل أقسام المطعم / Restaurant Section Analysis"، العنوان الفرعي "الإيراد والتكلفة والهامش لكل قسم مطعم (طلب)"، رأس الجدول "قسم المطعم / Restaurant Section"، exportColumns "قسم المطعم / Restaurant Section"، رسالة الفراغ "لا توجد بيانات أقسام مطاعم".
- التغيير الوحيد: حدّثت التعليق البرمجي على رأس الدالة من "// تحليل مراكز التكلفة: إيراد وتكلفة وهامش لكل مركز (مشروع)." إلى "// تحليل أقسام المطعم: إيراد وتكلفة وهامش لكل قسم (طلب/فرع). الكيان Project يُستخدم كقسم مطعم." — لإزالة كلمة "مشروع" من التعليق ومواءمته مع التسميات الظاهرة.
- حافظت على: الكيان base44.entities.Project.list (يُستخدم كقسم/فرع)، buildCostCenterAnalysis من src/lib/ledgerEngine (لم يُلمس)، JournalEntry.list و ChartAccount.list، KPIs (إجمالي الإيرادات/التكاليف/الهامش)، فلتر الفترة (from/to)، exportColumns الـ9 أعمدة، الجدول بـ7 أعمدة + صف الإجمالي.

القواعد الملتزَم بها:
- لم ألمس src/lib/ إطلاقاً (utils-binaa.js, validationEngine.js, workflowEngine.js, ledgerEngine.js, store.js, AuthContext.jsx كما هي).
- validationEngine.js لـ PROJECT: يتحقق فقط من code + name + (endDate >= startDate). إزالة contractValue/projectType/location لا تُسقط أي تحقق.
- لم أُغيّر اسم الكيان ولا واجهات API: base44.entities.Project (list/create/update/delete/filter) و base44.entities.Client.list و base44.entities.SalesInvoice/PurchaseOrder/Expense/WorkOrder/DailyReport.filter (في remove) كما هي.
- لم ألمس أي ملف كيان في base44/entities/ (Project.jsonc وغيرها كما هي).
- أبقيت OperationEngine يعمل: لا نداءات OperationEngine في Projects.jsx أصلاً (الحفظ مباشر عبر base44.entities.Project). Dashboard لا يستخدم OperationEngine. CostCenters يستخدم buildCostCenterAnalysis (دالة تحليل قراءة فقط).
- أبقيت تدفق "فتح الطلب → مركز العمل → POS/Tables": openWorkspace(item) → setProjectContext + setClientContext + setActiveItem('project-workspace').
- أبقيت ثنائية اللغة عبر t() في كل النصوص الجديدة والمعدَّلة (تعليقات التوثيق عربية فقط لأنها داخلية).
- أبقيت canTransition من workflowEngine لمنع انتقالات الحالة غير المسموحة.
- أبقيت usePermissions('projects') لصلاحيات canCreate/canEdit/canDelete.

التحقق:
- eslint على الملفات الثلاثة (Projects.jsx, Dashboard.jsx, CostCenters.jsx): exit 0 (0 أخطاء، 0 تحذيرات).
- vite build: نجح (bundle index-t2JYikAo.js، 2723 modules، 9.75s).
- فحص bundle: "قيمة العقد" ×0، "Contract Value" ×0، "PROJECT_TYPES"/"projectType" ×0، "إجمالي قيمة العقود"/"Total contract value" ×0، "مدير مشروع"/"project manager" ×0.
- فحص شفرة Projects.jsx: لا أي استدعاء لـ formatCurrency، ولا أي مرجع لـ contractValue/projectType/PROJECT_TYPES/BOQItem/ProgressBilling/ChangeOrder/ContractItem/ProjectDocument خارج تعليقات التوثيق.

Stage Summary:
- صفحة الطلبات (Projects.jsx) أصبحت نقية مطعمية: لا موقع بناء، لا قيمة عقد، لا نوع مشروع بناء، لا فحوصات كيانات بنائية عند الحذف، لا عمود نوع/قيمة عقد في الجدول أو التصدير، لا حقل إدخال لقيمة العقد/الموقع/النوع في النموذج، لا تذييل "إجمالي قيمة العقود". الكيان Project يبقى كـ "طلب/فرع" مع CRUD كامل وتدفق فتح مركز العمل.
- لوحة المبيعات (Dashboard.jsx) كانت بالفعل مطعمية بالكامل — نظّفت فقط بقايا التخطيط البنائي القديم (activeProjectName غير المستخدم) واستيراد useAuth/user غير المستخدم.
- صفحة أقسام المطعم (CostCenters.jsx) كانت بالفعل معاد تسميتها بالكامل في الواجهة — نظّفت فقط التعليق البرمجي الذي كان لا يزال يشير إلى "مشروع".
- جميع القيود احتُرمت: لا لمس src/lib/، لا تغيير أسماء كيانات/واجهات API، CRUD و OperationEngine يعملان، ثنائية اللغة محفوظة.


---
Task ID: clean-sales-clients-stockmovements
Agent: general-purpose
Task: تنظيف صفحات إيصالات البيع (SalesInvoices.jsx) والعملاء (Clients.jsx) والحركات المخزنية (StockMovements.jsx) من بقايا مفاهيم البناء

Work Log:
- قرأت worklog.md لفهم النمط المتّبع في التنظيف السابق (clean-equipment، clean-expenses، clean-projects-dashboard): إزالة المفاهيم البنائية مع الإبقاء على الكيان/CRUD/OperationEngine/ثنائية اللغة.

التغييرات على src/pages/SalesInvoices.jsx:
- empty: حذفت حقلي `progressBillingId` و `certificateNo` (مفاهيم البناء: المستخلصات ورقم الشهادة). أبقيت: invoiceNo, invoiceType, projectId, projectName, clientId, clientName, date, dueDate, subtotal, vatRate, paidAmount, status, description, notes.
- حذفت state وloading لـ: `certificates` (المستخلصات) و `contracts` (العقود). أبقيت: items, projects, clients, printInvoice.
- ضيّقت `Promise.all` في `load()` من 5 نداءات إلى 3: SalesInvoice.list + Project.list + Client.list. لا نداء لـ ProgressBilling أو Contract بعد الآن — كانا كيانات بنائية محذوفة.
- أعدت كتابة `openPrint(item)` لتعيين الفاتورة مباشرة (كانت تبحث عن العقد المرتبط بالمشروع وتضيف contractNo قبل الطباعة — منطق بنائي للعقود لم يعُد له معنى).
- حذفت كامل حساب `approvedCerts = certificates.filter(...)` (المستخلصات المعتمدة للمشروع المختار).
- حذفت كتلة التحقق من المستخلصات في `save()`: كانت تتطلب (1) اختيار طلب لإيصال الصالة، (2) وجود مستخلص معتمد لهذا الطلب، (3) ربط الإيصال بمستخلص معتمد عبر progressBillingId. كل هذا المنطق البنائي محذوف. أبقيت فقط التحققين العامّين: وجود invoiceNo + clientId، و dueDate >= date.
- حدّثت `onValueChange` لحقل اختيار الطلب (Project) لإزالة إعادة ضبط `progressBillingId: '', certificateNo: ''` عند تغيير الطلب. أبقيت ضبط projectId/projectName وانتقال clientId/clientName من بيانات الطلب.
- حذفت كامل كتلة واجهة اختيار المستخلص المعتمد (Select مع approvedCerts + رسالتا "اختر الطلب أولاً" و"لا يوجد مستخلص معتمد" + حقل subtotal المُعبأ من المستخلص). كانت تظهر فقط عند `invoiceType === 'CONSTRUCTION'` (= صالة).
- حذفت علامة النجمة الشرطية من عنوان حقل الطلب (`{form.invoiceType === 'CONSTRUCTION' ? ' *' : ''}`) — لم تعُد الضرورة إلزامية بعد إزالة فحص المستخلص. أصبح العنوان مجرد "الطلب / Order".
- حدّثت تعليق `buildDefaultForm` من "تطبيق سياق المشروع/العميل..." إلى "تطبيق سياق الطلب/الزبون..." (إزالة كلمة "المشروع" البنائية من التعليق).
- حدّثت تعليق `openPrint` من "إثراء الفاتورة برقم العقد المرتبط بمشروعها قبل الطباعة." إلى "معاينة وطباعة الإيصال.".
- حافظت على: شارة نوع البيع (saleType badge column) بكامل منطقها (DINE_IN/TAKEAWAY/DIRECT_DELIVERY/PLATFORM/CREDIT) مع قراءة JSON من notes وعرض شارة ملوّنة لكل نوع، الكيان base44.entities.SalesInvoice (list/create/update/delete + filter في reverse)، base44.entities.Project.list (كسياق فرع/طلب)، base44.entities.Client.list، نداءات OperationEngine (createSalesInvoice, updateSalesInvoice, approveSalesInvoice)، دالة reverse() مع JournalEntry، الثابت TYPES (CONSTRUCTION=صالة، SERVICE=توصيل، RENTAL=حجز — مطعمي)، TableToolbar، ConfirmDialog، ReceiptPrintDialog، بحث وفلتر الحالة، KPIs (محصل/معلق)، ثنائية اللغة عبر t()، صلاحيات usePermissions.

التغييرات على src/pages/Clients.jsx:
- حذفت `base44.entities.Contract.filter({ clientId: deleteId })` من Promise.all في `remove()`. الكيان Contract محذوف من النظام (مفهوم بنائي).
- أضفت تعليقاً توثيقياً "// الكيانات البنائية (Contract, RentalContract) محذوفة — لا فحص لها هنا." لتوضيح سبب عدم وجود الفحوصات.
- حدّثت رسالة الخطأ من "لا يمكن حذف عميل له فواتير أو تحصيلات أو عقود / Cannot delete a client with invoices, payments or contracts" إلى "لا يمكن حذف عميل له فواتير أو تحصيلات / Cannot delete a client with invoices or payments" (إزالة كلمة "عقود / contracts").
- أبقيت فحصَي SalesInvoice و ClientPayment فقط (كيانات مطعمية موجودة).
- ملاحظة: RentalContract لم يكن موجوداً أصلاً في الفحوصات (كان Contract فقط) — لكن وثّقت المحذوفين معاً في التعليق.
- حافظت على: الكيان base44.entities.Client (list/create/update/delete)، البحث الذكي (الاسم/الكود/رقم الجوال مع مطابقة آخر الأرقام)، PartyStatementSection لعرض الكشوفات والتحصيل، SmartEntityCard، TableToolbar، ConfirmDialog، ثنائية اللغة، تبويب "بيانات العملاء / الكشوفات والتحصيل".

التغييرات على src/pages/StockMovements.jsx:
- فحص كامل: لم أجد أي مصطلح بنائي ظاهر للمستخدم. كل المراجع لـ "Project" هي:
  * اسم الكيان `base44.entities.Project.list` (يُستخدم كسياق فرع/طلب — مُبقّى حسب القواعد).
  * متغير state `projects` (مصفوفة عرض).
  * حقل الكيان `projectName` (يُعرض كلون من بيانات الحركة بدون تسمية بنائية).
- الواجهة تستخدم "الطلب" / "Order" لكل السياقات المتعلقة بالمشروع (مثلاً: "الطلب (يُحمّل عليه المصروف) / Order (charged)" في نموذج صرف المخزون). هذا متوافق مع القاعدة "Project = branch context — keep as الطلب/Order".
- لا تغييرات مطلوبة. الملف نظيف بالفعل.

القواعد الملتزَم بها:
- لم ألمس src/lib/ إطلاقاً (businessEngine.js, postingEngine.js, utils-binaa.js كما هي).
- لم أُغيّر اسم أي كيان ولا واجهات API: base44.entities.SalesInvoice / Project / Client / ClientPayment / JournalEntry (في reverse) — كلها كما هي.
- أبقيت نداءات OperationEngine (createSalesInvoice, updateSalesInvoice, approveSalesInvoice) تعمل دون تغيير في العقد.
- أبقيت شارة نوع البيع (saleType badge) بكاملها كما أُضيفت في المهمة السابقة (6dad947).
- أبقيت ثنائية اللغة عبر t() في كل النصوص (تعليقات التوثيق عربية فقط).
- لم ألمس أي ملف كيان في base44/entities/.

التحقق:
- eslint على الملفات الثلاثة (SalesInvoices.jsx, Clients.jsx, StockMovements.jsx): exit 0 (0 أخطاء، 0 تحذيرات).
- vite build: نجح (bundle index-DDO1OiBe.js، 2723 modules، 10.70s).
- فحص شفرة SalesInvoices.jsx: لا أي مرجع لـ progressBillingId / certificateNo / approvedCerts / Contract.list / ProgressBilling.list / contractNo / certificate / مستخلص خارج التعليقات.
- فحص شفرة Clients.jsx: لا أي نداء لـ base44.entities.Contract (فقط إشارة تعليق توثيقي للمحذوف).
- فحص bundle: "المستخلص المعتمد" ×0، "progressBillingId" ×0، "approvedCerts" ×0.

Stage Summary:
- صفحة إيصالات البيع (SalesInvoices.jsx) أصبحت نقية مطعمية: لا ربط بمستخلصات، لا بحث عن عقود، لا واجهة اختيار شهادة معتمدة، لا تحقق إلزامي بوجود طلب للصالة. النموذج يحتوي فقط على: رقم الإيصال، نوع الإيصال (صالة/توصيل/حجز)، الزبون، الطلب (اختياري كسياق فرع)، التاريخ، تاريخ الاستحقاق، المبلغ قبل الضريبة، نسبة الضريبة، مبلغ الضريبة (محسوب)، الإجمالي (محسوب)، المبلغ المدفوع، الحالة، الوصف، الملاحظات. شارة نوع البيع (saleType) محفوظة بالكامل في عمود الجدول.
- صفحة العملاء (Clients.jsx): حذف عميل يُحجب فقط عند وجود فواتير بيع أو تحصيلات — لا فحص للعقود (Contract) المحذوفة. رسالة الخطأ محدّثة لتعكس الفحوصات الفعلية.
- صفحة الحركات المخزنية (StockMovements.jsx): كانت نظيفة بالفعل — لا تغييرات. حقل projectId مُبقّى كسياق فرع/طلب مع تسمية "الطلب" مطعمية في كل الواجهة.
- جميع القيود احتُرمت: لا لمس src/lib/، لا تغيير أسماء كيانات/واجهات API، CRUD و OperationEngine يعملان، شارة saleType محفوظة، ثنائية اللغة محفوظة.
