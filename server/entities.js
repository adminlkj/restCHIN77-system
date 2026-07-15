import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from './db.js';

const FISCAL_GUARDED_ENTITIES = new Set([
  'JournalEntry', 'SalesInvoice', 'PurchaseOrder', 'SupplierInvoice', 'RentalInvoice',
  'Expense', 'PayrollRun', 'ClientPayment', 'SupplierPayment',
  'SubcontractorInvoice', 'SubcontractorPayment', 'StockMovement',
  'GoodsReceipt', 'FixedAsset', 'OperatingHours', 'FuelLog',
  'MaintenanceRecord', 'AttendanceRecord', 'EmployeeAdvance',
]);

function recordFiscalDate(entityName, data = {}) {
  if (data.date) return data.date;
  if (data.paymentDate) return data.paymentDate;
  if (data.acquisitionDate) return data.acquisitionDate;
  if (data.startDate) return data.startDate;
  if (entityName === 'PayrollRun' && data.year && data.month) return `${data.year}-${String(data.month).padStart(2, '0')}-01`;
  return null;
}

async function assertOpenFiscalYear(entityName, data) {
  if (!FISCAL_GUARDED_ENTITIES.has(entityName)) return;
  const date = recordFiscalDate(entityName, data);
  if (!date) return;
  const years = await listEntity('FiscalYear', { query: {}, limit: 1000 });
  const openYears = (years || []).filter((y) => y.status === 'OPEN');
  if (openYears.length === 0) throw new Error('لا توجد سنة مالية مفتوحة — افتح سنة مالية قبل إنشاء أو تعديل العمليات');
  const match = openYears.find((y) => y.startDate && y.endDate && date >= y.startDate && date <= y.endDate);
  if (!match) throw new Error(`تاريخ العملية ${date} لا يقع ضمن سنة مالية مفتوحة`);
}

const schemaCache = new Map();

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

export function loadSchema(entityName) {
  if (schemaCache.has(entityName)) return schemaCache.get(entityName);
  const filePath = path.join(process.cwd(), 'base44', 'entities', `${entityName}.jsonc`);
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(stripJsonComments(fs.readFileSync(filePath, 'utf8')));
  schemaCache.set(entityName, parsed);
  return parsed;
}

function publicRecord(row) {
  return {
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by_id: row.created_by_id,
    ...(row.data || {}),
  };
}

function getValue(record, field) {
  return field in record ? record[field] : record.data?.[field];
}

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$gte' in expected && !(actual >= expected.$gte)) return false;
    if ('$gt' in expected && !(actual > expected.$gt)) return false;
    if ('$lte' in expected && !(actual <= expected.$lte)) return false;
    if ('$lt' in expected && !(actual < expected.$lt)) return false;
    if ('$ne' in expected && !(actual !== expected.$ne)) return false;
    if ('$in' in expected && !expected.$in.includes(actual)) return false;
    return true;
  }
  return actual === expected;
}

function matchesQuery(record, query = {}) {
  if (!query || !Object.keys(query).length) return true;
  if (query.$or) return query.$or.some((item) => matchesQuery(record, item));
  return Object.entries(query).every(([field, expected]) => matchesValue(getValue(record, field), expected));
}

function sortRecords(records, sort) {
  if (!sort) return records;
  const sortField = typeof sort === 'string' ? sort.replace(/^-/, '') : Object.keys(sort)[0];
  const direction = typeof sort === 'string' ? (sort.startsWith('-') ? -1 : 1) : sort[sortField];
  return [...records].sort((a, b) => {
    const av = getValue(a, sortField);
    const bv = getValue(b, sortField);
    if (av === bv) return 0;
    return av > bv ? direction : -direction;
  });
}

export async function listEntity(entityName, { query = {}, sort = '-created_date', limit = 500 } = {}) {
  const { rows } = await pool.query('SELECT * FROM entity_records WHERE entity_name = $1', [entityName]);
  const records = rows.map(publicRecord).filter((record) => matchesQuery(record, query));
  return sortRecords(records, sort).slice(0, Number(limit || 500));
}

export async function getEntity(entityName, id) {
  const { rows } = await pool.query('SELECT * FROM entity_records WHERE entity_name = $1 AND id = $2', [entityName, id]);
  return rows[0] ? publicRecord(rows[0]) : null;
}

export async function createEntity(entityName, data, user) {
  await assertOpenFiscalYear(entityName, data);
  await validateEntityData(entityName, data);
  const id = crypto.randomUUID();
  const cleanData = { ...data };
  delete cleanData.id;
  delete cleanData.created_date;
  delete cleanData.updated_date;
  delete cleanData.created_by_id;
  const { rows } = await pool.query(
    'INSERT INTO entity_records (entity_name, id, created_by_id, data) VALUES ($1, $2, $3, $4) RETURNING *',
    [entityName, id, user?.id || null, cleanData]
  );
  return publicRecord(rows[0]);
}

export async function updateEntity(entityName, id, data, options = {}) {
  const current = await getEntity(entityName, id);
  if (!current) throw validationError('السجل غير موجود');
  // CRITICAL: block PATCH on posted/approved documents
  await assertNotImmutable(entityName, current, data);
  // CRITICAL: block direct status transitions EXCEPT when called by postOperation
  // (postOperation uses 'internal: true' option to bypass this check)
  // postOperation is the ONLY legitimate way to change status because it
  // also creates/reverses JEs and updates related accounts.
  if (!options.internal) {
    await assertNoDirectStatusChange(entityName, current, data);
    // CRITICAL: block direct PATCH on financial fields (subtotal, vatAmount, etc.)
    // These must be changed only via postOperation which recomputes totals + JEs.
    await assertNoFinancialFieldPatch(entityName, data);
  }
  await assertOpenFiscalYear(entityName, { ...(current || {}), ...(data || {}) });
  await validateEntityData(entityName, { ...current, ...data }, current);
  const cleanData = { ...data };
  delete cleanData.id;
  delete cleanData.created_date;
  delete cleanData.updated_date;
  delete cleanData.created_by_id;
  const { rows } = await pool.query(
    'UPDATE entity_records SET data = data || $3::jsonb, updated_date = now() WHERE entity_name = $1 AND id = $2 RETURNING *',
    [entityName, id, cleanData]
  );
  return rows[0] ? publicRecord(rows[0]) : null;
}

export async function deleteEntity(entityName, id) {
  const current = await getEntity(entityName, id);
  if (!current) return { success: true }; // already deleted — idempotent
  // CRITICAL: block DELETE on posted/approved documents (not just referential children)
  // This prevents deleting an APPROVED SalesInvoice and leaving orphan JEs
  await assertNotDeletable(entityName, current);
  // CRITICAL: referential integrity — block delete if children exist
  await assertNoChildren(entityName, current);
  await pool.query('DELETE FROM entity_records WHERE entity_name = $1 AND id = $2', [entityName, id]);
  return { success: true };
}

export async function bulkCreateEntity(entityName, items, user) {
  for (const item of items || []) await assertOpenFiscalYear(entityName, item);
  const created = [];
  for (const item of items) created.push(await createEntity(entityName, item, user));
  return created;
}

export async function bulkUpdateEntity(entityName, items) {
  for (const item of items || []) {
    const current = item?.id ? await getEntity(entityName, item.id) : null;
    await assertOpenFiscalYear(entityName, { ...(current || {}), ...(item || {}) });
  }
  const updated = [];
  for (const item of items) updated.push(await updateEntity(entityName, item.id, item));
  return updated.filter(Boolean);
}

export async function updateManyEntity(entityName, query, update) {
  const records = await listEntity(entityName, { query, limit: 5000 });
  const patch = update?.$set || update || {};
  for (const record of records) await updateEntity(entityName, record.id, patch);
  return { count: records.length, has_more: false };
}

export async function deleteManyEntity(entityName, query) {
  const records = await listEntity(entityName, { query, limit: 5000 });
  for (const record of records) await deleteEntity(entityName, record.id);
  return { count: records.length, has_more: false };
}

// ═══════════════════════════════════════════════════════════════════════
// CRITICAL VALIDATIONS — enforced at API level (not just UI)
// ═══════════════════════════════════════════════════════════════════════

/**
 * إنشاء خطأ تحقق بحالة HTTP صحيحة (400 بدل 500).
 * أخطاء التحقق يجب أن تكون 400 Bad Request، لا 500 Internal Server Error.
 */
function validationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * يتحقق من سلامة بيانات الكيان قبل الإنشاء/التعديل.
 * - JournalEntry: توازن المدين/الدائن + وجود أكواد الحسابات في الدليل
 * - كيانات أخرى: يمكن إضافة قواعد لاحقاً
 */
async function validateEntityData(entityName, data, current = null) {
  if (entityName === 'JournalEntry') {
    await validateJournalEntry(data, current);
  }
}

/**
 * يتحقق من سلامة قيد اليومية:
 * 1. مجموع المدين = مجموع الدائن (إذا كان posted)
 * 2. كل أكواد الحسابات موجودة في الدليل المحاسبي
 * 3. لا يقل عدد السطور عن 2
 */
async function validateJournalEntry(data, current = null) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  // إذا التعديل لا يُمرّر lines، نستخدم lines الحالية من current
  const effectiveLines = lines.length > 0 ? lines : (current?.lines || []);
  if (effectiveLines.length > 0 && effectiveLines.length < 2) {
    throw validationError('القيد يجب أن يحتوي على سطرين على الأقل');
  }
  // التحقق من الأكواد (إن وُجدت سطور)
  if (lines.length > 0) {
    const codes = [...new Set(lines.map(l => l.accountCode).filter(Boolean))];
    if (codes.length > 0) {
      const accounts = await listEntity('ChartAccount', { query: {}, limit: 1000 });
      const validCodes = new Set((accounts || []).map(a => a.code));
      const invalid = codes.filter(c => !validCodes.has(c));
      if (invalid.length > 0) {
        throw validationError(`أكواد حسابات غير موجودة في الدليل المحاسبي: ${invalid.join(', ')}`);
      }
    }
  }
  // التحقق من التوازن فقط للقيود المرحّلة
  // الحالة 1: قيد جديد isPosted=true (data.isPosted === true)
  // الحالة 2: قيد مرحّل سابقاً (current.isPosted === true) ولم يُطلب إلغاء ترحيله
  const isPostedAfter = data.isPosted === true || (current?.isPosted === true && data.isPosted !== false);
  if (isPostedAfter && lines.length > 0) {
    const totalDebit = Number(data.totalDebit) || lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = Number(data.totalCredit) || lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw validationError(`القيد غير متوازن: مدين=${totalDebit}، دائن=${totalCredit}، الفرق=${Math.abs(totalDebit - totalCredit).toFixed(2)}`);
    }
    // التحقق من تطابق الإجماليات مع مجموع السطور
    const lineDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const lineCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (lines.length > 0 && Math.abs(lineDebit - totalDebit) > 0.01) {
      throw validationError(`إجمالي المدين (${totalDebit}) لا يطابق مجموع السطور (${lineDebit})`);
    }
    if (lines.length > 0 && Math.abs(lineCredit - totalCredit) > 0.01) {
      throw validationError(`إجمالي الدائن (${totalCredit}) لا يطابق مجموع السطور (${lineCredit})`);
    }
  }
}

/**
 * الحالات التي تمنع تعديل المستند (يصبح "مغلقاً" محاسبياً).
 * CANCELLED ليست هنا لأن المستند الملغي عُكس بالفعل ويمكن حذفه.
 */
const IMMUTABLE_STATUSES = new Set([
  'APPROVED', 'PAID', 'POSTED', 'REVERSED', 'CLOSED', 'RECEIVED',
]);

/**
 * المستندات المالية التي تمنع التعديل بعد الترحيل.
 * نسمح فقط بتحديث الحالة (status) عبر postOperation (e.g. CANCELLED).
 * الـ PATCH المباشر على هذه المستندات في حالة non-DRAFT ممنوع.
 */
const POSTED_DOCUMENTS = new Set([
  'SalesInvoice', 'SupplierInvoice', 'RentalInvoice', 'SubcontractorInvoice',
  'ClientPayment', 'SupplierPayment', 'SubcontractorPayment',
  'Expense', 'PayrollRun', 'GoodsReceipt',
  'JournalEntry', // القيود المرحّلة لا تُعدّل — استخدم العكس
  'StockMovement', 'FixedAsset',
]);

/**
 * يتحقق أن المستند قابل للتعديل.
 * - إن كان posted/approved/cancelled → يرفض التعديل
 * - يسمح فقط بحالات استثنائية (مثل وضع CANCELLED عبر reverse)
 */
async function assertNotImmutable(entityName, current, newData) {
  if (!POSTED_DOCUMENTS.has(entityName)) return;

  // JournalEntry: قيد مرحّل لا يُعدّل — استخدم العكس
  if (entityName === 'JournalEntry') {
    if (current?.isPosted === true) {
      // نسمح فقط بتغيير isPosted من true إلى false (لإلغاء الترحيل) — لكن نمنع تعديل السطور
      const onlyUnpost = Object.keys(newData || {}).every(k => k === 'isPosted' && newData[k] === false);
      if (!onlyUnpost) {
        throw validationError('لا يمكن تعديل قيد مرحّل — استخدم العكس (REVERSAL) بدلاً من ذلك');
      }
    }
    return;
  }

  // المستندات الأخرى: منع التعديل إذا الحالة في IMMUTABLE_STATUSES
  const status = current?.status;
  if (status && IMMUTABLE_STATUSES.has(status)) {
    // نسمح فقط بتغيير الحالة (مثلاً من APPROVED إلى CANCELLED عبر reverse)
    const onlyStatus = Object.keys(newData || {}).every(k => k === 'status');
    if (!onlyStatus) {
      throw validationError(`لا يمكن تعديل مستند بحالة "${status}" — استخدم العكس أو الإلغاء`);
    }
  }
}

/**
 * خريطة العلاقات المرجعية: لكل كيان، ما هي الكيانات التي تشير إليه؟
 * النموذج: { ParentEntity: [{ child: 'ChildEntity', field: 'parentId', label: '...' }] }
 */
const REFERENTIAL_CHILDREN = {
  Client: [
    { child: 'SalesInvoice', field: 'clientId', label: 'فواتير مبيعات' },
    { child: 'ClientPayment', field: 'clientId', label: 'سندات قبض' },
    { child: 'Contract', field: 'clientId', label: 'عقود' },
    { child: 'RentalContract', field: 'clientId', label: 'عقود تأجير' },
  ],
  Supplier: [
    { child: 'PurchaseOrder', field: 'supplierId', label: 'أوامر شراء' },
    { child: 'SupplierInvoice', field: 'supplierId', label: 'فواتير موردين' },
    { child: 'SupplierPayment', field: 'supplierId', label: 'سندات صرف' },
    { child: 'GoodsReceipt', field: 'supplierId', label: 'سندات استلام' },
  ],
  Subcontractor: [
    { child: 'SubcontractorInvoice', field: 'subcontractorId', label: 'مستخلصات' },
    { child: 'SubcontractorPayment', field: 'subcontractorId', label: 'سندات صرف' },
    { child: 'SubcontractorContract', field: 'subcontractorId', label: 'عقود' },
  ],
  Employee: [
    { child: 'PayrollRun', field: 'employeeId', label: 'مسيرات رواتب' },
    { child: 'EmployeeAdvance', field: 'employeeId', label: 'سلف' },
    { child: 'AttendanceRecord', field: 'employeeId', label: 'سجلات حضور' },
  ],
  Equipment: [
    { child: 'RentalContract', field: 'equipmentId', label: 'عقود تأجير' },
    { child: 'RentalInvoice', field: 'equipmentId', label: 'فواتير تأجير' },
    { child: 'MaintenanceRecord', field: 'equipmentId', label: 'سجلات صيانة' },
    { child: 'FuelLog', field: 'equipmentId', label: 'سجلات وقود' },
    { child: 'OperatingHours', field: 'equipmentId', label: 'ساعات تشغيل' },
  ],
  Warehouse: [
    { child: 'InventoryItem', field: 'warehouseId', label: 'أصناف مخزون' },
    { child: 'StockMovement', field: 'warehouseId', label: 'حركات مخزون' },
  ],
  Project: [
    { child: 'SalesInvoice', field: 'projectId', label: 'فواتير مبيعات' },
    { child: 'PurchaseOrder', field: 'projectId', label: 'أوامر شراء' },
    { child: 'Expense', field: 'projectId', label: 'مصروفات' },
    { child: 'Contract', field: 'projectId', label: 'عقود' },
    { child: 'StockMovement', field: 'projectId', label: 'حركات مخزون' },
  ],
  InventoryItem: [
    { child: 'StockMovement', field: 'itemId', label: 'حركات مخزون' },
  ],
  ChartAccount: [], // يُفحص عبر سطور القيود (مخصص)
  PurchaseOrder: [
    { child: 'GoodsReceipt', field: 'purchaseOrderId', label: 'سندات استلام' },
  ],
  GoodsReceipt: [
    { child: 'SupplierInvoice', field: 'goodsReceiptId', label: 'فواتير موردين' },
  ],
  Contract: [
    { child: 'ChangeOrder', field: 'contractId', label: 'أوامر تغيير' },
    { child: 'ProgressBilling', field: 'contractId', label: 'مستخلصات' },
  ],
  FiscalYear: [], // يُفحص يدوياً (status CLOSED)
};

/**
 * يتحقق أن الكيان ليس له أبناء قبل الحذف.
 * إن وُجد أبناء → يرفض الحذف برسالة واضحة.
 */
async function assertNoChildren(entityName, current) {
  const children = REFERENTIAL_CHILDREN[entityName] || [];
  for (const { child, field, label } of children) {
    const childRecords = await listEntity(child, { query: { [field]: current.id }, limit: 1 });
    if (childRecords && childRecords.length > 0) {
      throw validationError(`لا يمكن الحذف — يوجد ${label} مرتبطة بهذا السجل. احذفها أولاً أو اعكسها.`);
    }
  }

  // حالات خاصة
  if (entityName === 'FiscalYear' && current?.status === 'CLOSED') {
    throw validationError('لا يمكن حذف سنة مالية مغلقة');
  }
  if (entityName === 'ChartAccount') {
    // فحص سطور القيود المرحّلة التي تستخدم هذا الحساب
    const jes = await listEntity('JournalEntry', { query: { isPosted: true }, limit: 5000 });
    const code = current.code;
    const used = (jes || []).some(je => (je.lines || []).some(l => l.accountCode === code));
    if (used) {
      throw validationError('لا يمكن حذف حساب مستخدم في قيود مرحّلة');
    }
  }
  if (entityName === 'JournalEntry' && current?.isPosted === true) {
    throw validationError('لا يمكن حذف قيد مرحّل — استخدم العكس (REVERSAL)');
  }
}

/**
 * الحقول المالية الحساسة — لا يجوز تعديلها مباشرةً عبر PATCH حتى على DRAFT.
 * يجب أن تُعدّل فقط عبر postOperation (التي تُعيد الحساب وتُنشئ القيود).
 * منع تخريب داخلي مثل: PATCH {subtotal:99999} يُحدث totalAmount دون إعادة حساب.
 */
const FINANCIAL_FIELDS = new Set([
  'subtotal', 'vatAmount', 'totalAmount', 'paidAmount', 'balance',
  'totalDebit', 'totalCredit', 'lines',
]);

/**
 * المستندات المالية التي تُمنع من تعديل حقولها المالية مباشرةً.
 */
const FINANCIAL_DOCUMENTS = new Set([
  'SalesInvoice', 'SupplierInvoice', 'RentalInvoice', 'SubcontractorInvoice',
  'ClientPayment', 'SupplierPayment', 'SubcontractorPayment',
  'Expense', 'PayrollRun', 'GoodsReceipt',
  'JournalEntry',
]);

/**
 * يمنع تعديل الحقول المالية مباشرةً على المستندات المالية.
 * استثناء: الحالة (status) مسموح بها عبر مسارها الخاص (postOperation).
 */
async function assertNoFinancialFieldPatch(entityName, newData) {
  if (!FINANCIAL_DOCUMENTS.has(entityName)) return;
  const patchedFinancialFields = Object.keys(newData || {}).filter(k => FINANCIAL_FIELDS.has(k));
  if (patchedFinancialFields.length > 0) {
    throw validationError(
      `لا يمكن تعديل الحقول المالية مباشرةً (${patchedFinancialFields.join(', ')}). ` +
      `استخدم أزرار الاعتماد/الإلغاء/العكس أو أعد إنشاء المستند.`
    );
  }
}

/**
 * المستندات المالية التي لا يجوز تغيير حالتها مباشرةً عبر PATCH.
 * فقط postOperation يسمح بتغيير الحالة (لأنه يُنشئ/يُلغي القيود).
 */
const STATUS_CONTROLLED_DOCUMENTS = new Set([
  'SalesInvoice', 'SupplierInvoice', 'RentalInvoice', 'SubcontractorInvoice',
  'ClientPayment', 'SupplierPayment', 'SubcontractorPayment',
  'Expense', 'PayrollRun', 'GoodsReceipt',
  'StockMovement', 'FixedAsset',
  'Contract', 'RentalContract', 'PurchaseOrder', 'PurchaseRequest',
  'ChangeOrder', 'ProgressBilling', 'SubcontractorContract',
]);

/**
 * يمنع تغيير حقل status عبر PATCH مباشرةً على المستندات المالية.
 * فقط postOperation يسمح بتغيير الحالة لأنه:
 *   - يُنشئ القيد عند الانتقال لـ APPROVED
 *   - يُنشئ قيد عكسي عند الانتقال لـ CANCELLED
 *   - يُحدّث ذمم/نقدية عند الانتقال لـ PAID
 *
 * بدون هذا المنع، يمكن للمستخدم تجاوز إنشاء القيود بـ:
 *   PATCH /api/entities/SalesInvoice/update/{id} { status: 'APPROVED' }
 *   ← ينشئ فاتورة معتمدة بدون قيد محاسبي!
 */
async function assertNoDirectStatusChange(entityName, current, newData) {
  if (!STATUS_CONTROLLED_DOCUMENTS.has(entityName)) return;
  if (!newData || newData.status === undefined) return;
  if (newData.status === current?.status) return; // no change — OK

  // Allow only postOperation to change status. Direct PATCH is blocked.
  // Exception: we already allow status-only PATCH in assertNotImmutable for
  // the reverse flow (APPROVED → CANCELLED). But that's still via PATCH.
  // To be safe, we allow status change ONLY if current status is in
  // IMMUTABLE_STATUSES (i.e., already posted). DRAFT → APPROVED via PATCH
  // is always blocked.
  if (current?.status && IMMUTABLE_STATUSES.has(current.status)) {
    // Allow status change from APPROVED/PAID/... to CANCELLED (reverse)
    // This is the only allowed status transition via direct PATCH.
    if (newData.status === 'CANCELLED') return;
    // Any other status change on an immutable doc is blocked
    throw validationError(`لا يمكن تغيير حالة مستند "${current.status}" مباشرةً إلى "${newData.status}" — استخدم العكس أو الإلغاء عبر الأزرار المخصصة`);
  }

  // Block DRAFT → APPROVED/PAID/POSTED via direct PATCH
  // (this would bypass JE creation in postOperation)
  if (current?.status === 'DRAFT' || !current?.status) {
    if (IMMUTABLE_STATUSES.has(newData.status)) {
      throw validationError(`لا يمكن تغيير حالة المستند من "${current?.status || 'DRAFT'}" إلى "${newData.status}" مباشرةً — استخدم زر الاعتماد`);
    }
  }
}

/**
 * المستندات التي لا يجوز حذفها إذا كانت مرحّلة/معتمدة.
 * حتى لو لم يكن لها أبناء مرجعيون، حذفها يترك القيود يتيمة.
 */
async function assertNotDeletable(entityName, current) {
  if (!POSTED_DOCUMENTS.has(entityName)) return;

  // JournalEntry posted → must use REVERSAL
  if (entityName === 'JournalEntry' && current?.isPosted === true) {
    throw validationError('لا يمكن حذف قيد مرحّل — استخدم العكس (REVERSAL)');
  }

  // Other posted documents: block delete if status is in IMMUTABLE_STATUSES
  // (APPROVED, PAID, POSTED, REVERSED, CANCELLED, CLOSED, RECEIVED)
  // Only DRAFT documents can be deleted directly.
  const status = current?.status;
  if (status && IMMUTABLE_STATUSES.has(status)) {
    throw validationError(`لا يمكن حذف مستند بحالة "${status}" — اعكسه أولاً ثم احذفه`);
  }
}