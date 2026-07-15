// ═══════════════════════════════════════════════════════════════════════
// Mock Backend — طبقة تخزين محلية تُمكّن النظام من العمل بالكامل
// دون الحاجة لخادم Base44. تُخزّن كل البيانات في localStorage.
//
// عند توفر خادم حقيقي لاحقاً، يكفي حذف هذا الملف واستعادة base44Client.js
// الأصلي. كل الـ APIs متطابقة.
// ═══════════════════════════════════════════════════════════════════════

const TOKEN_KEY = 'binaa-auth-token';
const DB_KEY = 'restaurant-mock-db';
const SESSION_KEY = 'restaurant-mock-session';

// ─── قاعدة البيانات المحلية ───────────────────────────────────────────────
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // قاعدة بيانات أولية فارغة — تُملأ بالبيانات الأولية في seed()
  return { users: [], entities: {}, registrationRequests: [] };
}

function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch { /* ignore */ }
}

// ─── مستخدم مالك النظام الافتراضي ──────────────────────────────────────────
const OWNER_USER = {
  id: 'user-owner-001',
  email: 'fysl71443@gmail.com',
  full_name: 'فيصل المالك',
  role: 'admin',
  appRole: 'OWNER',
  isActive: true,
  allowedModules: null, // '*' — صلاحية مطلقة
  modulePermissions: null,
  created_date: new Date().toISOString(),
};

// ─── المصادقة (Auth) ───────────────────────────────────────────────────────
function authLogin(email, password) {
  // كلمات المرور المقبولة للمالك
  const ownerPasswords = ['faisal.11223344', 'admin', '123456'];
  const isOwner = email.toLowerCase() === OWNER_USER.email;
  if (isOwner && ownerPasswords.includes(password)) {
    const token = 'mock-token-' + Date.now();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem('restaurant-logged-out'); // امسح علم الخروج
    const db = loadDB();
    // تأكد أن المالك موجود في قاعدة البيانات
    if (!db.users.find(u => u.email === OWNER_USER.email)) {
      db.users.push({ ...OWNER_USER });
      saveDB(db);
    }
    // ابدأ جلسة
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: OWNER_USER.id, token }));
    return { access_token: token, user: { ...OWNER_USER } };
  }
  // أي مستخدم آخر مسجّل — أي كلمة مرور تعمل في وضع المعاينة
  const db = loadDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.isActive);
  if (user) {
    const token = 'mock-token-' + Date.now() + '-' + user.id;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem('restaurant-logged-out'); // امسح علم الخروج
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, token }));
    return { access_token: token, user: { ...user } };
  }
  const err = new Error('بيانات الدخول غير صحيحة');
  err.status = 401;
  throw err;
}

function authMe() {
  // إن سجّل المستخدم خروجه صراحةً، لا يُعاد تسجيل دخوله تلقائياً.
  if (localStorage.getItem('restaurant-logged-out') === 'true') {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  const sessionRaw = localStorage.getItem(SESSION_KEY);
  if (!sessionRaw) {
    // تلقائياً سجّل دخول المالك لتسهيل المعاينة (المرة الأولى فقط)
    const db = loadDB();
    if (!db.users.find(u => u.email === OWNER_USER.email)) {
      db.users.push({ ...OWNER_USER });
      saveDB(db);
    }
    const token = 'mock-token-auto-' + Date.now();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: OWNER_USER.id, token }));
    return { ...OWNER_USER };
  }
  try {
    const session = JSON.parse(sessionRaw);
    const db = loadDB();
    const user = db.users.find(u => u.id === session.userId);
    if (user) return { ...user };
  } catch { /* ignore */ }
  // fallback: المالك
  return { ...OWNER_USER };
}

function authLogout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.setItem('restaurant-logged-out', 'true');
}

// ─── عمليات الكيانات (CRUD) ───────────────────────────────────────────────
function getCollection(db, entityName) {
  if (!db.entities[entityName]) db.entities[entityName] = [];
  return db.entities[entityName];
}

// توليد معرّف فريد
function genId(entityName) {
  return `${entityName.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// فرز نتائج حسب الحقل: -field = تنازلي، field = تصاعدي
function sortBy(items, sort) {
  if (!sort) return items;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    let av = a[field], bv = b[field];
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (typeof av === 'number' && typeof bv === 'number') {
      return desc ? bv - av : av - bv;
    }
    av = String(av); bv = String(bv);
    return desc ? bv.localeCompare(av) : av.localeCompare(bv);
  });
}

// مطابقة سجل بالاستعلام (query) — يدعم المساواة البسيطة
function matchesQuery(item, query) {
  if (!query || typeof query !== 'object') return true;
  for (const [key, value] of Object.entries(query)) {
    if (item[key] !== value) return false;
  }
  return true;
}

function entityList(entityName, sort = '-created_date', limit = 500) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const sorted = sortBy(items, sort);
  return sorted.slice(0, limit);
}

function entityFilter(entityName, query = {}, sort = '-created_date', limit = 500) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const filtered = items.filter(i => matchesQuery(i, query));
  const sorted = sortBy(filtered, sort);
  return sorted.slice(0, limit);
}

function entityGet(entityName, id) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const item = items.find(i => i.id === id);
  if (!item) {
    const err = new Error('السجل غير موجود');
    err.status = 404;
    throw err;
  }
  return { ...item };
}

function entityCreate(entityName, data) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const now = new Date().toISOString();
  const newItem = {
    id: genId(entityName),
    ...data,
    created_date: data.created_date || now,
    updated_date: now,
    _owner_id: OWNER_USER.id,
  };
  items.push(newItem);
  saveDB(db);
  return { ...newItem };
}

function entityBulkCreate(entityName, itemsData) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const now = new Date().toISOString();
  const created = itemsData.map(d => {
    const newItem = {
      id: genId(entityName),
      ...d,
      created_date: d.created_date || now,
      updated_date: now,
      _owner_id: OWNER_USER.id,
    };
    items.push(newItem);
    return { ...newItem };
  });
  saveDB(db);
  return created;
}

function entityUpdate(entityName, id, updates) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) {
    const err = new Error('السجل غير موجود');
    err.status = 404;
    throw err;
  }
  items[idx] = {
    ...items[idx],
    ...updates,
    updated_date: new Date().toISOString(),
  };
  saveDB(db);
  return { ...items[idx] };
}

function entityBulkUpdate(entityName, itemsData) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const updated = itemsData.map(d => {
    const idx = items.findIndex(i => i.id === d.id);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...d, updated_date: new Date().toISOString() };
      return { ...items[idx] };
    }
    return null;
  }).filter(Boolean);
  saveDB(db);
  return updated;
}

function entityUpdateMany(entityName, query, update) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    if (matchesQuery(items[i], query)) {
      items[i] = { ...items[i], ...update, updated_date: new Date().toISOString() };
      count++;
    }
  }
  saveDB(db);
  return { modifiedCount: count };
}

function entityDelete(entityName, id) {
  const db = loadDB();
  const items = getCollection(db, entityName);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) {
    const err = new Error('السجل غير موجود');
    err.status = 404;
    throw err;
  }
  items.splice(idx, 1);
  saveDB(db);
  return { success: true };
}

function entityDeleteMany(entityName, query) {
  const db = loadDB();
  let items = getCollection(db, entityName);
  const before = items.length;
  items = items.filter(i => !matchesQuery(i, query));
  const after = items.length;
  db.entities[entityName] = items;
  saveDB(db);
  return { deletedCount: before - after };
}

function entitySchema(entityName) {
  return { entity: entityName, fields: {} };
}

function entityClient(entityName) {
  return {
    list: async (sort, limit) => entityList(entityName, sort, limit),
    filter: async (query, sort, limit) => entityFilter(entityName, query, sort, limit),
    get: async (id) => entityGet(entityName, id),
    create: async (data) => entityCreate(entityName, data),
    bulkCreate: async (items) => entityBulkCreate(entityName, items),
    update: async (id, data) => entityUpdate(entityName, id, data),
    bulkUpdate: async (items) => entityBulkUpdate(entityName, items),
    updateMany: async (query, update) => entityUpdateMany(entityName, query, update),
    delete: async (id) => entityDelete(entityName, id),
    deleteMany: async (query) => entityDeleteMany(entityName, query),
    schema: async () => entitySchema(entityName),
    subscribe: () => () => {},
  };
}

// ─── استدعاء الدوال (Functions) ────────────────────────────────────────────
// بعض الدوال المحاسبية تُستدعى عبر base44.functions.invoke. نحاكيها هنا.
function functionsInvoke(name, payload = {}) {
  // postOperation — ترحيل القيود. نُرجع نجاحاً فقط (المحرك الحقيقي موجود في lib/).
  if (name === 'postOperation' || name === 'post_operation') {
    return { data: { success: true, message: 'تم الترحيل بنجاح (mock)' }, status: 200 };
  }
  if (name === 'assetDepreciation' || name === 'asset_depreciation') {
    return { data: { success: true, depreciated: 0 }, status: 200 };
  }
  // افتراضي
  return { data: { success: true, name, payload }, status: 200 };
}

// ─── إدارة المستخدمين (Users) ──────────────────────────────────────────────
function usersInvite(email, role = 'user', appRole = 'VIEWER') {
  const db = loadDB();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    const err = new Error('المستخدم موجود مسبقاً');
    err.status = 400;
    throw err;
  }
  const newUser = {
    id: genId('user'),
    email,
    full_name: email.split('@')[0],
    role,
    appRole,
    isActive: false, // يحتاج تفعيل
    allowedModules: null,
    modulePermissions: null,
    created_date: new Date().toISOString(),
  };
  db.users.push(newUser);
  saveDB(db);
  return { ...newUser };
}

function listRegistrationRequests() {
  const db = loadDB();
  return db.registrationRequests || [];
}

function approveRegistrationRequest(data) {
  const db = loadDB();
  const req = (db.registrationRequests || []).find(r => r.id === data.id);
  if (!req) {
    const err = new Error('الطلب غير موجود');
    err.status = 404;
    throw err;
  }
  // أنشئ مستخدماً من الطلب
  const newUser = {
    id: genId('user'),
    email: req.email,
    full_name: req.fullName || req.email.split('@')[0],
    role: 'user',
    appRole: data.appRole || 'VIEWER',
    isActive: true,
    allowedModules: data.allowedModules || null,
    modulePermissions: null,
    created_date: new Date().toISOString(),
  };
  db.users.push(newUser);
  db.registrationRequests = (db.registrationRequests || []).filter(r => r.id !== data.id);
  saveDB(db);
  return { ...newUser };
}

function rejectRegistrationRequest(id) {
  const db = loadDB();
  db.registrationRequests = (db.registrationRequests || []).filter(r => r.id !== id);
  saveDB(db);
  return { success: true };
}

// ─── تحميل ملف (Upload) ────────────────────────────────────────────────────
async function uploadFile({ file } = {}) {
  if (!file) {
    const err = new Error('No file provided');
    err.status = 400;
    throw err;
  }
  // حوّل الملف إلى data URL محلي
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file_url: reader.result });
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// الواجهة العمومية — متطابقة مع base44Client الأصلي
// ═══════════════════════════════════════════════════════════════════════
export const base44 = {
  auth: {
    async loginViaEmailPassword(email, password) {
      return authLogin(email, password);
    },
    async register(data) {
      const db = loadDB();
      // أنشئ طلب تسجيل بانتظار الموافقة
      const req = {
        id: genId('reg'),
        email: data.email,
        fullName: data.full_name,
        status: 'pending',
        created_date: new Date().toISOString(),
      };
      if (!db.registrationRequests) db.registrationRequests = [];
      db.registrationRequests.push(req);
      saveDB(db);
      return { success: true, message: 'تم إرسال طلب التسجيل' };
    },
    async verifyOtp(data) {
      // لا حاجة لـ OTP في mock
      return { success: true };
    },
    resendOtp: async (email) => ({ success: true }),
    setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
    me: async () => authMe(),
    updateMe: async (data) => {
      const me = authMe();
      const db = loadDB();
      const idx = db.users.findIndex(u => u.id === me.id);
      if (idx !== -1) {
        db.users[idx] = { ...db.users[idx], ...data };
        saveDB(db);
        return { ...db.users[idx] };
      }
      return me;
    },
    isAuthenticated: async () => Boolean(localStorage.getItem(TOKEN_KEY) || localStorage.getItem(SESSION_KEY)),
    logout: () => authLogout(),
    redirectToLogin: () => { window.location.href = '/login'; },
    loginWithProvider: async () => {
      // في mock، ادخل مباشرة كمالك
      return authLogin(OWNER_USER.email, 'faisal.11223344');
    },
    resetPasswordRequest: async (email) => ({ success: true }),
    resetPassword: async (data) => ({ success: true }),
  },
  entities: new Proxy({}, { get: (_, entityName) => entityClient(entityName) }),
  users: {
    inviteUser: usersInvite,
    listRegistrationRequests: async () => listRegistrationRequests(),
    approveRegistrationRequest: async (data) => approveRegistrationRequest(data),
    rejectRegistrationRequest: async (id) => rejectRegistrationRequest(id),
  },
  functions: {
    invoke: async (name, payload = {}) => functionsInvoke(name, payload),
  },
  analytics: { track: async () => ({ success: true }) },
  integrations: {
    Core: {
      async UploadFile(opts) { return uploadFile(opts); },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════
// البيانات الأولية (Seed) — تُنشأ مرة واحدة عند أول تشغيل
// ═══════════════════════════════════════════════════════════════════════
export async function seedDatabase() {
  const db = loadDB();
  if (db._seeded) return; // سبق إعدادها

  // 1) المالك
  if (!db.users.find(u => u.email === OWNER_USER.email)) {
    db.users.push({ ...OWNER_USER });
  }

  // 2) مستخدمون إضافيون تجريبيون
  const extraUsers = [
    { id: 'user-cashier-001', email: 'cashier@restaurant.sa', full_name: 'كاشير الفرع', role: 'user', appRole: 'CASHIER', isActive: true, allowedModules: null, modulePermissions: null, created_date: new Date().toISOString() },
    { id: 'user-manager-001', email: 'manager@restaurant.sa', full_name: 'مدير المطعم', role: 'user', appRole: 'RESTAURANT_MANAGER', isActive: true, allowedModules: null, modulePermissions: null, created_date: new Date().toISOString() },
    { id: 'user-accountant-001', email: 'accountant@restaurant.sa', full_name: 'محاسب المطعم', role: 'user', appRole: 'ACCOUNTANT', isActive: true, allowedModules: null, modulePermissions: null, created_date: new Date().toISOString() },
  ];
  for (const u of extraUsers) {
    if (!db.users.find(x => x.email === u.email)) db.users.push(u);
  }

  // 2b) انسخ المستخدمين إلى كيان User (Entity) لتظهر في شاشة إدارة المستخدمين
  if (!db.entities.User) db.entities.User = [];
  const allUsers = [...db.users];
  for (const u of allUsers) {
    if (!db.entities.User.find(x => x.id === u.id)) {
      db.entities.User.push({ ...u });
    }
  }

  // 3) فرع رئيسي (Project) + إعداداته + طاولاته
  const branchId = 'branch-main-001';
  if (!db.entities.Project) db.entities.Project = [];
  if (!db.entities.Project.find(p => p.id === branchId)) {
    db.entities.Project.push({
      id: branchId,
      code: 'BR-0001',
      name: 'الفرع الرئيسي - النخيل',
      nameAr: 'الفرع الرئيسي - النخيل',
      clientId: '',
      clientName: '',
      branchId: '',
      branchName: 'الفرع الرئيسي',
      projectManager: 'مدير الفرع',
      costCenter: '',
      location: 'حي النخيل - الرياض',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      status: 'ACTIVE',
      projectType: 'CONSTRUCTION',
      progressPercent: 100,
      contractValue: 0,
      description: 'الفرع الرئيسي للمطعم',
      totalCosts: 0,
      totalRevenue: 0,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });
  }

  // 4) إعدادات الشركة العامة (CompanySettings)
  if (!db.entities.CompanySettings) db.entities.CompanySettings = [];
  if (db.entities.CompanySettings.length === 0) {
    db.entities.CompanySettings.push({
      id: 'settings-001',
      companyName: 'مطعم الذواقة',
      companyNameEn: 'Gourmet Restaurant',
      vatNumber: '300000000000003',
      crNumber: '1010000000',
      address: 'حي النخيل',
      city: 'الرياض',
      phone: '0112345678',
      email: 'info@gourmet.sa',
      website: 'www.gourmet.sa',
      logoUrl: '',
      headerImageUrl: '',
      footerImageUrl: '',
      template: 'MODERN',
      primaryColor: '#d97706',
      accentColor: '#1f2d3d',
      bankName: 'البنك الأهلي',
      bankAccountName: 'مطعم الذواقة',
      iban: 'SA00 0000 0000 0000 0000',
      bankAccountNumber: '1234567890',
      bankBranch: 'الرياض',
      swiftCode: 'NCBKSAJE',
      terms: 'شكراً لتعاملكم معنا',
      showQr: true,
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });
  }

  // 5) زبائن تجريبيون — مع نسبة خصم لكل زبون مسجّل (الزبن النقدي بلا خصم)
  if (!db.entities.Client) db.entities.Client = [];
  const clients = [
    { name: 'زبون نقدي', phone: '', taxNumber: '', isActive: true, code: 'CL-0001', discountPercentage: 0, isCash: true },
    { name: 'محمد العتيبي', phone: '0501234567', taxNumber: '', isActive: true, code: 'CL-0002', discountPercentage: 10, isCash: false },
    { name: 'شركة الأمل', phone: '0119876543', taxNumber: '300012345600003', isActive: true, code: 'CL-0003', discountPercentage: 15, isCash: false },
  ];
  for (const c of clients) {
    if (!db.entities.Client.find(x => x.name === c.name)) {
      db.entities.Client.push({
        id: genId('Client'),
        ...c,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
    }
  }

  // 5b) منصات التوصيل (DeliveryPlatform) — هنقر، كيتا، جاهز، إلخ
  if (!db.entities.DeliveryPlatform) db.entities.DeliveryPlatform = [];
  if (db.entities.DeliveryPlatform.length === 0) {
    const platforms = [
      { code: 'PL-001', name: 'هنقرستيشن', nameEn: 'HungerStation', commissionRate: 15, phone: '920000001', isActive: true, notes: 'عمولة 15% على كل طلب', id: 'platform-hungerstation' },
      { code: 'PL-002', name: 'كيتا', nameEn: 'Keta', commissionRate: 12, phone: '920000002', isActive: true, notes: 'عمولة 12%', id: 'platform-keta' },
      { code: 'PL-003', name: 'جاهز', nameEn: 'Jahez', commissionRate: 15, phone: '920000003', isActive: true, notes: 'عمولة 15%', id: 'platform-jahez' },
      { code: 'PL-004', name: 'شفرة', nameEn: 'Shfar', commissionRate: 10, phone: '920000004', isActive: true, notes: 'عمولة 10%', id: 'platform-shfar' },
      { code: 'PL-005', name: 'توصيل مباشر', nameEn: 'Direct Delivery', commissionRate: 0, phone: '', isActive: true, notes: 'توصيل المطعم الخاص', id: 'platform-direct' },
    ];
    for (const p of platforms) {
      db.entities.DeliveryPlatform.push({
        ...p,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
    }
  }

  // 6a) أقسام قائمة الطعام (MenuCategory) — ينشئها المستخدم
  if (!db.entities.MenuCategory) db.entities.MenuCategory = [];
  if (db.entities.MenuCategory.length === 0) {
    const categories = [
      { id: 'cat-mains',    code: 'CAT-001', name: 'أطباق رئيسية', nameEn: 'Main Dishes',    sortOrder: 1, isActive: true },
      { id: 'cat-appetizers', code: 'CAT-002', name: 'مقبلات',     nameEn: 'Appetizers',     sortOrder: 2, isActive: true },
      { id: 'cat-beverages', code: 'CAT-003', name: 'مشروبات',     nameEn: 'Beverages',      sortOrder: 3, isActive: true },
      { id: 'cat-desserts',  code: 'CAT-004', name: 'حلويات',       nameEn: 'Desserts',       sortOrder: 4, isActive: true },
    ];
    for (const c of categories) {
      db.entities.MenuCategory.push({
        ...c,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
    }
  }

  // 6b) أصناف قائمة الطعام (InventoryItem) — مرتبطة بالأقسام
  // كل صنف له: name (عربي), nameEn (إنجليزي), costPrice (سعر الشراء), salePrice (سعر البيع)
  if (!db.entities.InventoryItem) db.entities.InventoryItem = [];
  if (db.entities.InventoryItem.length === 0) {
    const menuItems = [
      // أطباق رئيسية
      { code: 'M-001', name: 'برجر لحم أنجوس', nameEn: 'Angus Beef Burger', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 22, salePrice: 35, quantity: 100, reorderLevel: 10, isActive: true, notes: 'برجر فاخر مع جبنة شيدر' },
      { code: 'M-002', name: 'برجر دجاج مقرمش', nameEn: 'Crispy Chicken Burger', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 18, salePrice: 30, quantity: 80, reorderLevel: 10, isActive: true, notes: '' },
      { code: 'M-003', name: 'بيتزا مارجريتا', nameEn: 'Margherita Pizza', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 28, salePrice: 45, quantity: 50, reorderLevel: 5, isActive: true, notes: '' },
      { code: 'M-004', name: 'بيتزا بيبروني', nameEn: 'Pepperoni Pizza', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 32, salePrice: 50, quantity: 50, reorderLevel: 5, isActive: true, notes: '' },
      { code: 'M-005', name: 'شاورما دجاج', nameEn: 'Chicken Shawarma', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 8, salePrice: 15, quantity: 200, reorderLevel: 20, isActive: true, notes: '' },
      { code: 'M-006', name: 'شاورما لحم', nameEn: 'Beef Shawarma', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 10, salePrice: 18, quantity: 200, reorderLevel: 20, isActive: true, notes: '' },
      { code: 'M-007', name: 'ستيك لحم مشوي', nameEn: 'Grilled Beef Steak', categoryId: 'cat-mains', unit: 'قطعة', costPrice: 55, salePrice: 85, quantity: 30, reorderLevel: 5, isActive: true, notes: '' },
      { code: 'M-008', name: 'باستا ألفريدو', nameEn: 'Pasta Alfredo', categoryId: 'cat-mains', unit: 'طبق', costPrice: 25, salePrice: 40, quantity: 40, reorderLevel: 5, isActive: true, notes: '' },
      // مقبلات
      { code: 'S-001', name: 'بطاطس مقلية', nameEn: 'French Fries', categoryId: 'cat-appetizers', unit: 'طبق', costPrice: 7, salePrice: 15, quantity: 150, reorderLevel: 15, isActive: true, notes: '' },
      { code: 'S-002', name: 'ناجتس دجاج', nameEn: 'Chicken Nuggets', categoryId: 'cat-appetizers', unit: 'طبق', costPrice: 10, salePrice: 20, quantity: 100, reorderLevel: 10, isActive: true, notes: '' },
      { code: 'S-003', name: 'حلقات البصل', nameEn: 'Onion Rings', categoryId: 'cat-appetizers', unit: 'طبق', costPrice: 8, salePrice: 18, quantity: 80, reorderLevel: 10, isActive: true, notes: '' },
      { code: 'S-004', name: 'سلطة سيزر', nameEn: 'Caesar Salad', categoryId: 'cat-appetizers', unit: 'طبق', costPrice: 12, salePrice: 25, quantity: 50, reorderLevel: 5, isActive: true, notes: '' },
      // مشروبات
      { code: 'B-001', name: 'بيبسي', nameEn: 'Pepsi', categoryId: 'cat-beverages', unit: 'علبة', costPrice: 4, salePrice: 8, quantity: 200, reorderLevel: 24, isActive: true, notes: '' },
      { code: 'B-002', name: 'كوكا كولا', nameEn: 'Coca Cola', categoryId: 'cat-beverages', unit: 'علبة', costPrice: 4, salePrice: 8, quantity: 200, reorderLevel: 24, isActive: true, notes: '' },
      { code: 'B-003', name: 'مياه معدنية', nameEn: 'Water', categoryId: 'cat-beverages', unit: 'قارورة', costPrice: 2, salePrice: 5, quantity: 300, reorderLevel: 48, isActive: true, notes: '' },
      { code: 'B-004', name: 'عصير برتقال طازج', nameEn: 'Fresh Orange Juice', categoryId: 'cat-beverages', unit: 'كوب', costPrice: 7, salePrice: 15, quantity: 60, reorderLevel: 10, isActive: true, notes: '' },
      { code: 'B-005', name: 'قهوة عربية', nameEn: 'Arabic Coffee', categoryId: 'cat-beverages', unit: 'فنجان', costPrice: 5, salePrice: 12, quantity: 200, reorderLevel: 20, isActive: true, notes: '' },
      { code: 'B-006', name: 'شاي', nameEn: 'Tea', categoryId: 'cat-beverages', unit: 'كوب', costPrice: 2, salePrice: 5, quantity: 300, reorderLevel: 30, isActive: true, notes: '' },
      // حلويات
      { code: 'D-001', name: 'تشيز كيك', nameEn: 'Cheesecake', categoryId: 'cat-desserts', unit: 'قطعة', costPrice: 15, salePrice: 28, quantity: 40, reorderLevel: 5, isActive: true, notes: '' },
      { code: 'D-002', name: 'براوني', nameEn: 'Brownie', categoryId: 'cat-desserts', unit: 'قطعة', costPrice: 12, salePrice: 22, quantity: 40, reorderLevel: 5, isActive: true, notes: '' },
      { code: 'D-003', name: 'آيس كريم فانيلا', nameEn: 'Vanilla Ice Cream', categoryId: 'cat-desserts', unit: 'كوب', costPrice: 7, salePrice: 15, quantity: 60, reorderLevel: 10, isActive: true, notes: '' },
      { code: 'D-004', name: 'كنافة', nameEn: 'Kunafa', categoryId: 'cat-desserts', unit: 'قطعة', costPrice: 16, salePrice: 30, quantity: 30, reorderLevel: 5, isActive: true, notes: '' },
    ];
    for (const m of menuItems) {
      db.entities.InventoryItem.push({
        id: genId('InventoryItem'),
        // unitCost للتوافق مع الإصدارات السابقة — يساوي salePrice
        unitCost: m.salePrice,
        ...m,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
    }
  }

  // 7) موردون تجريبيون
  if (!db.entities.Supplier) db.entities.Supplier = [];
  const suppliers = [
    { code: 'SUP-001', name: 'مؤسسة الأغذية الذهبية', phone: '0114567890', email: 'sales@goldfood.sa', address: 'الرياض - المنطقة الصناعية', taxNumber: '300011112220003', contactPerson: 'أحمد', isActive: true, notes: 'مورد اللحوم' },
    { code: 'SUP-002', name: 'شركة المشروبات المتحدة', phone: '0117654321', email: 'info@bev.sa', address: 'جدة', taxNumber: '300022223330003', contactPerson: 'سعد', isActive: true, notes: 'مورد المشروبات' },
    { code: 'SUP-003', name: 'مخبز الحياة', phone: '0113334444', email: 'lifebakery@mail.sa', address: 'الرياض', taxNumber: '', contactPerson: 'نورة', isActive: true, notes: 'مورد الخبز والحلويات' },
  ];
  for (const s of suppliers) {
    if (!db.entities.Supplier.find(x => x.code === s.code)) {
      db.entities.Supplier.push({
        id: genId('Supplier'),
        ...s,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
    }
  }

  // 8) مخزن رئيسي
  if (!db.entities.Warehouse) db.entities.Warehouse = [];
  if (db.entities.Warehouse.length === 0) {
    db.entities.Warehouse.push({
      id: 'wh-main-001',
      code: 'WH-001',
      name: 'المخزن الرئيسي',
      location: 'الفرع الرئيسي - النخيل',
      branchId: branchId,
      branchName: 'الفرع الرئيسي',
      isActive: true,
      notes: '',
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });
  }

  // 9) إيصالات تجريبية (SalesInvoice) — إيصالان مدفوعان
  if (!db.entities.SalesInvoice) db.entities.SalesInvoice = [];
  if (db.entities.SalesInvoice.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    db.entities.SalesInvoice.push(
      {
        id: genId('SalesInvoice'),
        invoiceNo: 'INV-2026-0001',
        invoiceType: 'CONSTRUCTION',
        projectId: branchId,
        projectName: 'الفرع الرئيسي - النخيل',
        clientId: '',
        clientName: 'زبون نقدي',
        date: today,
        dueDate: '',
        subtotal: 80,
        vatRate: 0.15,
        vatAmount: 12,
        totalAmount: 92,
        paidAmount: 92,
        status: 'PAID',
        description: 'طاولة: طاولة 3',
        notes: JSON.stringify({ tableId: 't3', tableName: 'طاولة 3', payments: [{ method: 'cash', amount: 92 }], cashier: 'فيصل المالك' }),
        created_date: new Date(Date.now() - 3600000).toISOString(),
        updated_date: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: genId('SalesInvoice'),
        invoiceNo: 'INV-2026-0002',
        invoiceType: 'SERVICE',
        projectId: branchId,
        projectName: 'الفرع الرئيسي - النخيل',
        clientId: '',
        clientName: 'محمد العتيبي',
        date: today,
        dueDate: '',
        subtotal: 60,
        discountPercentage: 10,
        discountAmount: 6,
        deliveryFee: 10,
        vatRate: 0.15,
        vatAmount: 9.6,
        totalAmount: 73.6,
        platformId: 'platform-hungerstation',
        platformName: 'هنقرستيشن',
        platformCommission: 11.04,
        paidAmount: 73.6,
        status: 'PAID',
        description: 'توصيل عبر هنقرستيشن',
        notes: JSON.stringify({ payments: [{ method: 'card', amount: 73.6 }], cashier: 'فيصل المالك', platform: 'هنقرستيشن', deliveryFee: 10 }),
        created_date: new Date(Date.now() - 1800000).toISOString(),
        updated_date: new Date(Date.now() - 1800000).toISOString(),
      }
    );
  }

  // 9b) الدليل المحاسبي للمطاعم (ChartAccount) — يُبنى من standardChart.js
  if (!db.entities.ChartAccount) db.entities.ChartAccount = [];
  if (db.entities.ChartAccount.length === 0) {
    try {
      // استيراد ديناميكي لتجنّب الاعتماد الدائري
      const chartModule = await import('/src/lib/standardChart.js');
      const accounts = chartModule.buildStandardAccounts();
      for (const acc of accounts) {
        db.entities.ChartAccount.push({
          id: `chart-${acc.code}`,
          ...acc,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Failed to seed ChartAccount:', e);
    }
  }

  db._seeded = true;
  saveDB(db);

  // 10) طاولات افتراضية للفرع الرئيسي (تُخزّن في localStorage منفصل عبر tables.js)
  // نستخدم نفس الـ key الذي يستخدمه lib/tables.js
  try {
    const tablesKey = 'restaurant-tables';
    const existing = JSON.parse(localStorage.getItem(tablesKey) || '{}');
    const branchTables = Object.values(existing).filter(t => t.branchId === branchId);
    if (branchTables.length === 0) {
      const tables = {};
      const tableNames = [
        { name: 'طاولة 1', seats: 2 },
        { name: 'طاولة 2', seats: 4 },
        { name: 'طاولة 3', seats: 4 },
        { name: 'طاولة 4', seats: 6 },
        { name: 'طاولة 5', seats: 2 },
        { name: 'طاولة 6', seats: 4 },
        { name: 'طاولة 7', seats: 8 },
        { name: 'طاولة 8', seats: 4 },
      ];
      tableNames.forEach((t, i) => {
        const id = `tbl-seed-${branchId}-${i + 1}`;
        tables[id] = {
          id,
          branchId,
          name: t.name,
          seats: t.seats,
          status: i === 2 ? 'OCCUPIED' : 'AVAILABLE', // طاولة 3 مشغولة (الإيصال التجريبي)
          currentInvoiceId: i === 2 ? 'INV-2026-0001' : null,
          sortOrder: i + 1,
          createdAt: new Date().toISOString(),
        };
      });
      // ادمج مع أي طاولات موجودة لفروع أخرى
      const merged = { ...existing, ...tables };
      localStorage.setItem(tablesKey, JSON.stringify(merged));
    }
  } catch { /* ignore */ }

  // 11) إعدادات الفرع الرئيسي (branchSettings) — لوقو/هاتف خاص بالفرع
  try {
    const branchSettingsKey = 'restaurant-branch-settings';
    const existing = JSON.parse(localStorage.getItem(branchSettingsKey) || '{}');
    if (!existing[branchId]) {
      existing[branchId] = {
        branchName: 'الفرع الرئيسي - النخيل',
        branchNameEn: 'Main Branch - Nakheel',
        phone: '0112345678',
        phone2: '0501112233',
        address: 'حي النخيل',
        city: 'الرياض',
        logoUrl: '',
        vatNumber: '300000000000003',
        primaryColor: '#d97706',
        accentColor: '#1f2d3d',
        managerName: 'مدير الفرع',
        posTerminalId: 'POS-001',
        isActive: true,
      };
      localStorage.setItem(branchSettingsKey, JSON.stringify(existing));
    }
  } catch { /* ignore */ }
}

// شغّل البيانات الأولية عند تحميل هذا الملف
if (typeof window !== 'undefined') {
  seedDatabase().catch(() => { /* ignore */ });
}
