/**
 * حذف جميع البيانات التجريبية من النظام عبر API
 * يحافظ فقط على حساب المطور + الحسابات المحاسبية + الإعدادات
 *
 * الاستخدام:
 *   node scripts/cleanup-all-data.js https://your-app.onrender.com
 *   node scripts/cleanup-all-data.js  (افتراضي: localhost:3000)
 */

const API_BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = 'fysl71443@gmail.com';
const PASSWORD = 'faisal.11223344';

async function main() {
  console.log('=== حذف البيانات التجريبية ===\n');
  console.log(`Server: ${API_BASE}`);
  console.log(`Admin:  ${EMAIL}\n`);

  // 1. تسجيل الدخول
  console.log('1. تسجيل الدخول...');
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginData.access_token) {
    console.error('فشل تسجيل الدخول:', loginData);
    process.exit(1);
  }
  const token = loginData.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  console.log('   ✓ تم تسجيل الدخول\n');

  // 2. الكيانات المراد حذفها (الأبناء قبل الآباء)
  const entities = [
    'JournalEntry',
    'SalesInvoice', 'SupplierInvoice', 'ClientPayment', 'SupplierPayment',
    'SubcontractorInvoice', 'SubcontractorPayment', 'Expense',
    'RentalInvoice',
    'ProgressBilling', 'ChangeOrder', 'Contract',
    'PurchaseRequest', 'PurchaseOrder', 'GoodsReceipt',
    'StockMovement', 'RentalContract',
    'PayrollRun',
    'Client', 'Supplier', 'Subcontractor', 'Employee',
    'Equipment', 'Warehouse', 'InventoryItem',
    'Project', 'BOQItem', 'ContractItem', 'ProjectDocument',
    'EmployeeDocument', 'EmployeeAdvance', 'EmployeeCustody',
    'AttendanceRecord', 'DailyReport',
    'OperatingHours', 'FuelLog', 'MaintenanceRecord',
    'WorkOrder', 'DeliveryOrder',
    'SubcontractorContract', 'SubcontractorChangeOrder', 'SubcontractorPenalty',
    'FixedAsset',
    'FileRecord',
    'AuditLog', 'DocumentEvent',
  ];

  // 3. حذف كل كيان
  let totalDeleted = 0;
  for (const entity of entities) {
    try {
      const listRes = await fetch(`${API_BASE}/api/entities/${entity}/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sort: '-created_date', limit: 5000 }),
      });
      const items = await listRes.json();
      const records = items.items || items || [];

      if (records.length === 0) continue;

      let deleted = 0;
      for (const rec of records) {
        try {
          await fetch(`${API_BASE}/api/entities/${entity}/delete/${rec.id}`, { method: 'DELETE', headers });
          deleted++;
          totalDeleted++;
        } catch {}
      }
      console.log(`  ${entity}: ${deleted}/${records.length} محذوف`);
    } catch (e) {
      console.log(`  ${entity}: تخطي (${e.message})`);
    }
  }

  // 4. حذف المستخدمين ما عدا المطور
  console.log('\nحذف المستخدمين...');
  try {
    const usersRes = await fetch(`${API_BASE}/api/entities/User/list`, {
      method: 'POST', headers,
      body: JSON.stringify({ sort: '-created_date', limit: 500 }),
    });
    const usersData = await usersRes.json();
    const users = usersData.items || usersData || [];
    for (const user of users) {
      if (user.email === EMAIL) { console.log(`  ${user.email}: محفوظ`); continue; }
      try {
        await fetch(`${API_BASE}/api/entities/User/delete/${user.id}`, { method: 'DELETE', headers });
        console.log(`  ${user.email}: محذوف`);
      } catch { console.log(`  ${user.email}: فشل`); }
    }
  } catch (e) { console.log('  تخطي:', e.message); }

  console.log(`\n=== تم حذف ${totalDeleted} سجل ===`);
  console.log('النظام نظيف. محفوظ: المطور + الحسابات المحاسبية + الإعدادات + السنة المالية');
}

main().catch(err => { console.error('خطأ:', err.message); process.exit(1); });
