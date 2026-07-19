// ═══════════════════════════════════════════════════════════════════════
// Seed Script — يُنشئ بيانات تجريبية لاختبار دورة البيع في بيئة تطوير.
//
// الاستخدام:
//   1. أقلع النظام (npm start) + تأكد من DATABASE_URL.
//   2. شغّل: node scripts/seed-dev.mjs
//
// يُنشئ: فرع تجريبي + طاولات + قائمة طعام + عملاء + مورد + مستخدم كاشير.
// آمن: يتخطى ما هو موجود (idempotent).
// ═══════════════════════════════════════════════════════════════════════

const API_BASE = process.env.SEED_API_BASE || 'http://localhost:10000';
const OWNER_EMAIL = process.env.SYSTEM_OWNER_EMAIL || 'fysl71443@gmail.com';
const OWNER_PASSWORD = process.env.SYSTEM_OWNER_PASSWORD || 'admin';

// عميل HTTP بسيط (لا نعتمد على fetch المكوّن — يعمل في Node 18+).
async function api(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login() {
  console.log(`🔐 تسجيل دخول كمالك: ${OWNER_EMAIL}`);
  const result = await api('/api/auth/login', 'POST', { email: OWNER_EMAIL, password: OWNER_PASSWORD });
  // base44 client يخزّن الرمز محلياً؛ هنا نعيده للسكربت.
  return result.access_token || result.token;
}

async function upsertEntity(entityName, filter, payload, token, label) {
  // ابحث عن موجود، فإن وُجد حدّثه، وإلا أنشئه.
  const existing = await api(`/api/entities/${entityName}/filter`, 'POST', { query: filter, limit: 1 }, token).catch(() => []);
  if (existing && existing.length > 0) {
    console.log(`   ✓ ${label} موجود بالفعل (${existing[0].id})`);
    return existing[0];
  }
  const created = await api(`/api/entities/${entityName}/create`, 'POST', payload, token);
  console.log(`   + ${label} أُنشئ (${created.id})`);
  return created;
}

async function main() {
  console.log('🚀 بدء زرع البيانات التجريبية...\n');

  if (typeof fetch === 'undefined') {
    console.error('❌ هذا السكربت يتطلب Node.js 18+ (مع fetch عام).');
    process.exit(1);
  }

  const token = await login();

  // 1) فرع تجريبي
  console.log('\n📍 إنشاء الفرع التجريبي...');
  const branch = await upsertEntity('Project', { name: 'الفرع الرئيسي' }, {
    name: 'الفرع الرئيسي',
    nameEn: 'Main Branch',
    code: 'BR-01',
    status: 'ACTIVE',
  }, token, 'الفرع الرئيسي');

  // 2) طاولات (10 طاولات)
  console.log('\n🪑 إنشاء الطاولات...');
  for (let i = 1; i <= 10; i++) {
    await upsertEntity('Table', { branchId: branch.id, tableId: `tbl_seed_${i}` }, {
      branchId: branch.id,
      tableId: `tbl_seed_${i}`,
      name: `طاولة ${i}`,
      seats: i <= 4 ? 2 : (i <= 8 ? 4 : 6),
      status: 'AVAILABLE',
      sortOrder: i,
    }, token, `طاولة ${i}`);
  }

  // 3) أقسام قائمة الطعام
  console.log('\n📂 إنشاء أقسام القائمة...');
  const categories = [
    { name: 'المقبلات', nameEn: 'Appetizers', sortOrder: 1 },
    { name: 'المشروبات', nameEn: 'Beverages', sortOrder: 2 },
    { name: 'الوجبات الرئيسية', nameEn: 'Main Dishes', sortOrder: 3 },
    { name: 'الحلويات', nameEn: 'Desserts', sortOrder: 4 },
  ];
  const categoryIds = {};
  for (const c of categories) {
    const cat = await upsertEntity('MenuCategory', { name: c.name, isActive: true }, {
      ...c, isActive: true,
    }, token, c.name);
    categoryIds[c.name] = cat.id;
  }

  // 4) أصناف القائمة
  console.log('\n🍔 إنشاء أصناف القائمة...');
  const items = [
    { name: 'برجر لحم', nameEn: 'Beef Burger', code: 'ITM-001', categoryId: categoryIds['الوجبات الرئيسية'], salePrice: 35, unitCost: 18, itemType: 'MENU', isActive: true },
    { name: 'بيتزا مارجريتا', nameEn: 'Margherita Pizza', code: 'ITM-002', categoryId: categoryIds['الوجبات الرئيسية'], salePrice: 45, unitCost: 22, itemType: 'MENU', isActive: true },
    { name: 'شاورما دجاج', nameEn: 'Chicken Shawarma', code: 'ITM-003', categoryId: categoryIds['الوجبات الرئيسية'], salePrice: 15, unitCost: 7, itemType: 'MENU', isActive: true },
    { name: 'بطاطس مقلية', nameEn: 'French Fries', code: 'ITM-004', categoryId: categoryIds['المقبلات'], salePrice: 12, unitCost: 4, itemType: 'MENU', isActive: true },
    { name: 'حمص', nameEn: 'Hummus', code: 'ITM-005', categoryId: categoryIds['المقبلات'], salePrice: 14, unitCost: 5, itemType: 'MENU', isActive: true },
    { name: 'كولا', nameEn: 'Cola', code: 'ITM-006', categoryId: categoryIds['المشروبات'], salePrice: 6, unitCost: 2, itemType: 'MENU', isActive: true },
    { name: 'عصير برتقال', nameEn: 'Orange Juice', code: 'ITM-007', categoryId: categoryIds['المشروبات'], salePrice: 10, unitCost: 4, itemType: 'MENU', isActive: true },
    { name: 'شاي', nameEn: 'Tea', code: 'ITM-008', categoryId: categoryIds['المشروبات'], salePrice: 5, unitCost: 1, itemType: 'MENU', isActive: true },
    { name: 'كنافة', nameEn: 'Kunafa', code: 'ITM-009', categoryId: categoryIds['الحلويات'], salePrice: 18, unitCost: 8, itemType: 'MENU', isActive: true },
    { name: 'تشيز كيك', nameEn: 'Cheesecake', code: 'ITM-010', categoryId: categoryIds['الحلويات'], salePrice: 22, unitCost: 10, itemType: 'MENU', isActive: true },
  ];
  for (const it of items) {
    await upsertEntity('InventoryItem', { code: it.code }, it, token, it.name);
  }

  // 5) عملاء
  console.log('\n👥 إنشاء العملاء...');
  await upsertEntity('Client', { name: 'عميل نقدي افتراضي' }, {
    code: 'CL-001', name: 'عميل نقدي افتراضي', isCash: true, status: 'ACTIVE', discountPercentage: 0,
  }, token, 'عميل نقدي');
  await upsertEntity('Client', { name: 'أحمد محمد' }, {
    code: 'CL-002', name: 'أحمد محمد', phone: '0501234567', isCash: false, status: 'ACTIVE', discountPercentage: 10,
  }, token, 'عميل مسجّل 10%');

  // 6) مورد
  console.log('\n🏪 إنشاء مورد...');
  await upsertEntity('Supplier', { name: 'مورد المواد الغذائية' }, {
    code: 'SUP-001', name: 'مورد المواد الغذائية', status: 'ACTIVE',
  }, token, 'مورد');

  // 7) منصة توصيل
  console.log('\n🛵 إنشاء منصة توصيل...');
  await upsertEntity('DeliveryPlatform', { name: 'هنقرستيشن (تجريبي)' }, {
    name: 'هنقرستيشن (تجريبي)',
    commissionRate: 10,
    commissionVatRate: 0.15,
    settlementMethod: 'NET',
    isActive: true,
  }, token, 'منصة توصيل');

  // 8) مخزن
  console.log('\n🏬 إنشاء مخزن...');
  await upsertEntity('Warehouse', { name: 'المخزن الرئيسي' }, {
    name: 'المخزن الرئيسي', code: 'WH-01', isActive: true,
  }, token, 'مخزن');

  console.log('\n✅ اكتمل زرع البيانات التجريبية.');
  console.log('   يمكنك الآن اختبار دورة البيع:');
  console.log('   - افتح الفرع الرئيسي → طاولة 1 → POS');
  console.log('   - أضف أصنفاً → ادفع → اعتمد الفاتورة');
  console.log('   - تحقّق من القيد في ميزان المراجعة.');
}

main().catch(e => {
  console.error('\n❌ فشل الزرع:', e.message);
  if (e.data) console.error('   تفاصيل:', JSON.stringify(e.data));
  process.exit(1);
});
