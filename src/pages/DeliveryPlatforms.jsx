import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, RefreshCw, Bike, FileText, DollarSign,
  TrendingUp, Calculator, Eye, Search, Landmark, Printer, Calendar, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import { printHtml } from '@/lib/printDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// شاشة منصات التوصيل — إدارة المنصات (هنقرستيشن، كيتا، جاهز…) + كشوفاتها.
// ═══════════════════════════════════════════════════════════════════════

const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

const EMPTY_FORM = {
  code: '', name: '', nameEn: '', commissionRate: 0,
  commissionVatRate: 0.15, commissionMethod: 'GROSS', settlementMethod: 'NET',
  vatOnCommissionEnabled: true, settlementAccountCode: '1112',
  phone: '', isActive: true, notes: '',
};

export default function DeliveryPlatforms() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();

  const [view, setView] = useState('platforms'); // 'platforms' | 'statements' | 'settlements'
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settlements, setSettlements] = useState([]);
  // القيود المرحّلة + الحسابات: مصدر الحقيقة الموحّد لرصيد المنصة (account 1115).
  const [journal, setJournal] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [settlementSearch, setSettlementSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // كشوفات: فلتر نطاق التاريخ + المنصة المختارة لكشف تفصيلي
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailPlatform, setDetailPlatform] = useState(null); // { ...platform }
  const [detailOpen, setDetailOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  // نافذة التسوية الحقيقية (تنشئ قيداً محاسبياً)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null); // platform statement object
  const [settleForm, setSettleForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    periodFrom: '',
    periodTo: '',
    dueDate: '',
    settledAmount: '',
    paymentMethod: 'BANK_TRANSFER',
    settlementAccountCode: '1112',
    referenceNo: '',
    notes: '',
  });

  // ─── تحميل المنصات + الإيصالات + التسويات + القيود المرحّلة ───────────
  // نحمّل القيود + دليل الحسابات لضمان تطابق رصيد المنصة مع ميزان المراجعة.
  // رصيد المنصة على JE account 1115 (PLATFORM_RECEIVABLE) هو المصدر الموحّد،
  // بينما التفاصيل التشغيلية (الفواتير) تبقى للعرض.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plats, invs, setts, jes, accs] = await Promise.all([
        base44.entities.DeliveryPlatform.list('-created_date', 500),
        base44.entities.SalesInvoice.list('-created_date', 1000),
        base44.entities.PlatformSettlement.list('-created_date', 500),
        base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
        base44.entities.ChartAccount.list('code', 1000).catch(() => []),
      ]);
      setItems(plats || []);
      setInvoices(invs || []);
      setSettlements(setts || []);
      setJournal(jes || []);
      setAccounts(accs || []);
    } catch (err) {
      console.warn('DeliveryPlatform load failed:', err);
      setItems([]); setInvoices([]); setSettlements([]); setJournal([]); setAccounts([]);
      toast.error(errorMessage(err, t('فشل تحميل البيانات', 'Failed to load', lang)));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  // ─── فلترة المنصات بالبحث ──────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.nameEn || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // ─── إجراءات CRUD ──────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      code: nextCodeFromList(items, 'PL'),
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...EMPTY_FORM, ...item });
    setDialogOpen(true);
  };

  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error(t('الرجاء إدخال اسم المنصة', 'Please enter platform name', lang));
      return;
    }
    setSaving(true);
    try {
      const data = {
        code: form.code || nextCodeFromList(items, 'PL'),
        name: form.name.trim(),
        nameEn: (form.nameEn || '').trim(),
        commissionRate: Number(form.commissionRate) || 0,
        commissionVatRate: Number(form.commissionVatRate) || 0.15,
        commissionMethod: form.commissionMethod || 'GROSS',
        settlementMethod: form.settlementMethod || 'NET',
        vatOnCommissionEnabled: form.vatOnCommissionEnabled !== false,
        settlementAccountCode: form.settlementAccountCode || '1112',
        phone: form.phone || '',
        isActive: form.isActive !== false,
        notes: form.notes || '',
      };
      if (editing) {
        await base44.entities.DeliveryPlatform.update(editing.id, data);
        toast.success(t('تم تحديث المنصة', 'Platform updated', lang));
      } else {
        await base44.entities.DeliveryPlatform.create(data);
        toast.success(t('تمت إضافة المنصة', 'Platform added', lang));
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await base44.entities.DeliveryPlatform.delete(deleteId);
      toast.success(t('تم حذف المنصة', 'Platform deleted', lang));
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang)));
    }
  };

  // ─── حسابات كشف المنصة ─────────────────────────────────────────────
  // تطبيق فلتر نطاق التاريخ على الإيصالات (إن وُجد).
  const filterByDate = useCallback((list) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(inv => {
      const d = inv.date || inv.created_date || '';
      const day = String(d).slice(0, 10);
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo]);

  // ملخّص كل منصة: يُبنى تلقائياً من الفواتير المعتمدة + التسويات المرحّلة.
  // لا تُخزّن المجاميع في قاعدة البيانات — تُحسب دائماً من المصادر.
  //   salesPreTax  = Σ subtotal (الإيراد قبل الضريبة)
  //   salesVat     = Σ vatAmount (ضريبة المبيعات)
  //   salesTotal   = Σ totalAmount (الإجمالي شامل الضريبة)
  //   commission   = Σ platformCommission
  //   commissionVat = Σ platformCommissionVat (أو 15% إن لم يُسجّل)
  //   net          = salesTotal - commission - commissionVat (صافي المستحق)
  //   paid         = Σ settledAmount من التسويات المرحّلة
  //   pending      = net - paid
  const statements = useMemo(() => {
    // خريطة الحسابات لتمييز حساب PLATFORM_RECEIVABLE (1115) — المصدر الموحّد لرصيد المنصة.
    const accountMap = {};
    for (const a of (accounts || [])) accountMap[a.code] = a;
    // رصيد JE لكل منصة: مدين − دائن على سطور 1115 الموسومة بـ partyType='PLATFORM'.
    // نعتمد هذا الرقم بدل (net − paid) لضمان التطابق مع ميزان المراجعة.
    const jeByPlatform = {};
    for (const je of (journal || [])) {
      if (!je || !je.isPosted || !Array.isArray(je.lines)) continue;
      for (const l of je.lines) {
        const acc = accountMap[l.accountCode];
        if (!acc || acc.semanticRole !== 'PLATFORM_RECEIVABLE') continue;
        if (l.partyType !== 'PLATFORM' || !l.partyId) continue;
        const pid = l.partyId;
        jeByPlatform[pid] = (jeByPlatform[pid] || 0) + ((Number(l.debit) || 0) - (Number(l.credit) || 0));
      }
    }
    return items.map(p => {
      // ─── تصفية صارمة: فقط الفواتير المرتبطة بالمنصة عبر platformId ───
      // لا نعتمد على platformName (قد يتطابق بالصدفة) ولا على invoiceType
      // (توصيل مباشر ≠ منصة). المعيار الوحيد: platformId === p.id.
      const list = filterByDate(
        invoices.filter(i => i.platformId && i.platformId === p.id)
      );
      const salesPreTax = list.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
      const salesVat = list.reduce((s, i) => s + (Number(i.vatAmount) || 0), 0);
      const salesTotal = list.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
      const commission = list.reduce((s, i) => s + (Number(i.platformCommission) || 0), 0);
      // ضريبة العمولة: من حقل platformCommissionVat إن وُجد، وإلا تُحسب من commissionVatRate
      const commissionVat = list.reduce((s, i) => {
        const v = Number(i.platformCommissionVat);
        if (!isNaN(v) && v > 0) return s + v;
        return s + (Number(i.platformCommission) || 0) * (Number(p.commissionVatRate) || 0.15);
      }, 0);
      // ─── معادلة موحّدة: الصافي = الإجمالي - العمولة - ضريبة العمولة ───
      // تُستخدم في كل مكان (الجدول، النافذة، الطباعة، التسوية).
      const net = salesTotal - commission - commissionVat;
      // المسدّد = مجموع التسويات المرحّلة لهذه المنصة
      const platformSettlements = settlements.filter(s => s.platformId === p.id && s.status === 'POSTED');
      const paid = platformSettlements.reduce((s, st) => s + (Number(st.settledAmount) || 0), 0);
      // ─── pending يُحسب من رصيد JE الفعلي (المصدر الموحّد) لا من المعادلة التشغيلية ───
      // هذا يضمن تطابق المستحق مع ميزان المراجعة. نأخذ max(0) لتفادي عرض رصيد سالب
      // بعد التسوية الكاملة. لو اختلف jeBalance عن (net − paid) نفضّل JE (المحاسبي).
      const jeBalance = Number(jeByPlatform[p.id] || 0);
      const pending = Math.max(0, +jeBalance.toFixed(2));
      // آخر تسوية + آخر تحويل (للعرض في الجدول)
      const lastSettlement = platformSettlements[0] || null;
      const commissionRate = Number(p.commissionRate) || 0;
      return {
        platform: p,
        invoices: list,
        settlements: platformSettlements,
        orders: list.length,
        salesPreTax,
        salesVat,
        salesTotal,
        commissionRate,
        commission,
        commissionVat,
        net,
        paid,
        pending,
        jeBalance, // الرصيد المحاسبي الفعلي (للمطابقة)
        settlementMethod: p.settlementMethod || 'NET',
        lastSettlementDate: lastSettlement?.date || '',
        lastSettlementRef: lastSettlement?.referenceNo || '',
        isFullySettled: pending <= 0.01 && list.length > 0,
      };
    });
  }, [items, invoices, settlements, filterByDate]);

  // ملخّص شامل لكل المنصات
  const totals = useMemo(() => {
    return statements.reduce((acc, s) => ({
      orders: acc.orders + s.orders,
      salesPreTax: acc.salesPreTax + s.salesPreTax,
      salesVat: acc.salesVat + s.salesVat,
      salesTotal: acc.salesTotal + s.salesTotal,
      commission: acc.commission + s.commission,
      commissionVat: acc.commissionVat + s.commissionVat,
      net: acc.net + s.net,
      paid: acc.paid + s.paid,
      pending: acc.pending + s.pending,
    }), { orders: 0, salesPreTax: 0, salesVat: 0, salesTotal: 0, commission: 0, commissionVat: 0, net: 0, paid: 0, pending: 0 });
  }, [statements]);

  // ─── كشف تفصيلي للمنصة ─────────────────────────────────────────────
  const openDetail = (platform) => {
    setDetailPlatform(platform);
    setDetailOpen(true);
  };

  const detailRows = useMemo(() => {
    if (!detailPlatform) return [];
    // تصفية صارمة بـ platformId فقط
    return filterByDate(
      invoices.filter(i => i.platformId && i.platformId === detailPlatform.id)
    );
  }, [detailPlatform, invoices, filterByDate]);

  // ─── فتح نافذة التسوية الحقيقية لمنصة ──────────────────────────────
  // التسوية تنشئ قيداً محاسبياً: مدين بنك/صندوق، دائن ذمم المنصة.
  // تُخفّض الذمة تدريجياً حتى الإغلاق الكامل.
  const openSettleDialog = (statement) => {
    setSettleTarget(statement);
    // اقتراح: تسوية كامل المعلّق دفعة واحدة
    // نطاق الفترة يُعبّأ تلقائياً من فلتر التاريخ المعمول به في الكشوفات
    setSettleForm({
      date: new Date().toISOString().slice(0, 10),
      periodFrom: dateFrom || '',
      periodTo: dateTo || '',
      dueDate: '',
      settledAmount: statement.pending > 0 ? statement.pending.toFixed(2) : '',
      paymentMethod: 'BANK_TRANSFER',
      settlementAccountCode: statement.platform.settlementAccountCode || '1112',
      referenceNo: '',
      notes: '',
    });
    setSettleDialogOpen(true);
  };

  // مولّد بديل لـ openSettleDialog يبدأ من بيانات المنصة فقط (يصلح للنافذة التفصيلية).
  // يبحث عن كشف المنصة في statements، وإلا يبني كشفاً مؤقتاً.
  const settleByPlatform = (platform) => {
    const stmt = statements.find(s => s.platform.id === platform.id) || {
      platform,
      invoices: [],
      settlements: [],
      orders: 0,
      salesPreTax: 0,
      salesVat: 0,
      salesTotal: 0,
      commissionRate: Number(platform.commissionRate) || 0,
      commission: 0,
      commissionVat: 0,
      net: 0,
      paid: 0,
      pending: 0,
      settlementMethod: platform.settlementMethod || 'NET',
    };
    setDetailOpen(false);
    openSettleDialog(stmt);
  };

  // تنفيذ التسوية عبر OperationEngine (ينشئ سجل PlatformSettlement + قيد JE)
  const submitSettlement = async () => {
    if (!settleTarget) return;
    const amount = Number(settleForm.settledAmount);
    if (!amount || amount <= 0) {
      toast.error(t('أدخل مبلغ تسوية صحيح', 'Enter a valid settlement amount', lang));
      return;
    }
    if (amount > settleTarget.pending + 0.01) {
      toast.error(t('مبلغ التسوية يتجاوز المعلّق', 'Settlement exceeds pending', lang));
      return;
    }
    setSettling(true);
    try {
      // جمع معرّفات الفواتير المُسوّاة (للمتابعة)
      const invoiceIds = settleTarget.invoices.map(inv => inv.id);
      await OperationEngine.createPlatformSettlement({
        platformId: settleTarget.platform.id,
        date: settleForm.date,
        periodFrom: settleForm.periodFrom || '',
        periodTo: settleForm.periodTo || '',
        dueDate: settleForm.dueDate || '',
        totalSales: settleTarget.salesTotal,
        totalCommission: settleTarget.commission,
        commissionVat: settleTarget.commissionVat,
        netPayable: settleTarget.net,
        settledAmount: amount,
        paymentMethod: settleForm.paymentMethod,
        settlementAccountCode: settleForm.settlementAccountCode,
        referenceNo: settleForm.referenceNo,
        invoiceIds,
        invoiceCount: invoiceIds.length,
        notes: settleForm.notes,
      });
      toast.success(t('تمت التسوية وترحيل القيد', 'Settled & JE posted', lang));
      setSettleDialogOpen(false);
      setSettleTarget(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل التسوية', 'Settlement failed', lang)));
    } finally {
      setSettling(false);
    }
  };

  // ─── طباعة كشف منصة بصيغة رسمية ───────────────────────────────────
  // يبني HTML بأسلوب كشف حساب احترافي ثم يفتحه في نافذة طباعة مستقلة عبر printHtml.
  const printStatement = (platform) => {
    const stmt = statements.find(s => s.platform.id === platform.id);
    if (!stmt) {
      toast.error(t('لا يوجد كشف لهذه المنصة', 'No statement for this platform', lang));
      return;
    }
    const html = buildStatementPrintHtml({
      statement: stmt,
      settings,
      lang,
      dateFrom,
      dateTo,
      formatCurrency,
      formatDate,
      t,
    });
    printHtml(html, {
      title: `${t('كشف منصة', 'Platform Statement', lang)} - ${platform.name}`,
      lang,
    });
  };

  // ─── أعمدة الطباعة/التصدير للكشوفات ─────────────────────────────────
  const statementExportColumns = [
    { header: { ar: 'المنصة', en: 'Platform' }, value: (r) => r.platform.name },
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.platform.code },
    { header: { ar: 'طريقة التسوية', en: 'Settlement' }, value: (r) => r.settlementMethod },
    { header: { ar: 'عدد الطلبات', en: 'Orders' }, value: (r) => r.orders },
    { header: { ar: 'المبيعات قبل الضريبة', en: 'Sales (pre-tax)' }, value: (r) => Number(r.salesPreTax).toFixed(2) },
    { header: { ar: 'ضريبة المبيعات', en: 'Sales VAT' }, value: (r) => Number(r.salesVat).toFixed(2) },
    { header: { ar: 'إجمالي المبيعات', en: 'Total Sales' }, value: (r) => Number(r.salesTotal).toFixed(2) },
    { header: { ar: 'نسبة العمولة %', en: 'Commission %' }, value: (r) => Number(r.commissionRate).toFixed(2) },
    { header: { ar: 'العمولة', en: 'Commission' }, value: (r) => Number(r.commission).toFixed(2) },
    { header: { ar: 'ضريبة العمولة', en: 'Commission VAT' }, value: (r) => Number(r.commissionVat).toFixed(2) },
    { header: { ar: 'صافي المستحق', en: 'Net Payable' }, value: (r) => Number(r.net).toFixed(2) },
    { header: { ar: 'المسدّد', en: 'Paid' }, value: (r) => Number(r.paid).toFixed(2) },
    { header: { ar: 'المعلّق', en: 'Pending' }, value: (r) => Number(r.pending).toFixed(2) },
  ];

  // ─── فلترة التسويات بالبحث (رقم التسوية / المنصة / الرقم المرجعي) ────
  const filteredSettlements = useMemo(() => {
    if (!settlementSearch) return settlements;
    const q = settlementSearch.toLowerCase();
    return settlements.filter(s =>
      (s.settlementNo || '').toLowerCase().includes(q) ||
      (s.platformName || '').toLowerCase().includes(q) ||
      (s.referenceNo || '').toLowerCase().includes(q)
    );
  }, [settlements, settlementSearch]);

  // خريطة المنصات للوصول السريع بالمعرّف
  const platformById = useMemo(() => {
    const m = new Map();
    items.forEach(p => m.set(p.id, p));
    return m;
  }, [items]);

  // ─── أعمدة التصدير للتسويات ──────────────────────────────────────────
  const settlementExportColumns = [
    { header: { ar: 'رقم التسوية', en: 'Settlement No.' }, value: (r) => r.settlementNo || '' },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date || '' },
    { header: { ar: 'المنصة', en: 'Platform' }, value: (r) => r.platformName || platformById.get(r.platformId)?.name || '' },
    { header: { ar: 'فترة من', en: 'Period From' }, value: (r) => r.periodFrom || '' },
    { header: { ar: 'فترة إلى', en: 'Period To' }, value: (r) => r.periodTo || '' },
    { header: { ar: 'تاريخ الاستحقاق', en: 'Due Date' }, value: (r) => r.dueDate || '' },
    { header: { ar: 'المبلغ', en: 'Amount' }, value: (r) => Number(r.settledAmount || 0).toFixed(2) },
    { header: { ar: 'الطريقة', en: 'Method' }, value: (r) => r.paymentMethod || '' },
    { header: { ar: 'الرقم المرجعي', en: 'Reference' }, value: (r) => r.referenceNo || '' },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => r.status || '' },
  ];

  return (
    <ModuleLayout
      title={t('منصات التوصيل', 'Delivery Platforms', lang)}
      subtitle={t('إدارة منصات التوصيل وكشوفات العمولات', 'Manage delivery platforms and commission statements', lang)}
      actions={
        <div className="flex items-center gap-2">
          {view === 'platforms' && (
            <Button onClick={openNew} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <Plus className="size-4" /> {t('إضافة منصة', 'Add Platform', lang)}
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={load}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      }
    >
      {/* مبدّل العرض */}
      <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
        <button
          onClick={() => setView('platforms')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'platforms' ? 'bg-background shadow text-rose-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Bike className="size-4" /> {t('المنصات', 'Platforms', lang)}
        </button>
        <button
          onClick={() => setView('statements')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'statements' ? 'bg-background shadow text-rose-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <FileText className="size-4" /> {t('كشوفات المنصات', 'Platform Statements', lang)}
        </button>
        <button
          onClick={() => setView('settlements')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'settlements' ? 'bg-background shadow text-rose-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Landmark className="size-4" /> {t('التسويات', 'Settlements', lang)}
        </button>
      </div>

      {/* ══════════════ القسم 1: المنصات (CRUD) ══════════════ */}
      {view === 'platforms' && (
        <>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('بحث باسم أو كود المنصة...', 'Search by name or code...', lang)}
                className="ps-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="h-44 bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="py-14 text-center text-muted-foreground">
              <Bike className="size-10 mx-auto mb-3 opacity-40" />
              {t('لا توجد منصات توصيل', 'No delivery platforms', lang)}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(p => (
                <Card key={p.id} className="overflow-hidden border-t-4 border-t-rose-500">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                          <Bike className="size-5 text-rose-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{p.nameEn || '—'}</div>
                        </div>
                      </div>
                      <Badge variant={p.isActive === false ? 'secondary' : 'default'}
                        className={p.isActive === false
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}>
                        {p.isActive === false
                          ? t('معطّلة', 'Inactive', lang)
                          : t('نشطة', 'Active', lang)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">{t('الكود', 'Code', lang)}</div>
                        <div className="font-mono font-semibold" dir="ltr">{p.code}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('نسبة العمولة', 'Commission', lang)}</div>
                        <div className="font-semibold text-rose-700">{Number(p.commissionRate || 0).toFixed(2)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('الهاتف', 'Phone', lang)}</div>
                        <div className="font-mono" dir="ltr">{p.phone || '—'}</div>
                      </div>
                    </div>

                    {p.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 line-clamp-2">{p.notes}</p>
                    )}

                    <div className="flex items-center justify-end gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => openDetail(p)}>
                        <Eye className="size-3.5" /> {t('كشف', 'Statement', lang)}
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-rose-700 hover:text-rose-800" onClick={() => printStatement(p)}>
                        <Printer className="size-3.5" /> {t('طباعة', 'Print', lang)}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(p.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {filtered.length} {t('منصة', 'platforms', lang)}
          </p>
        </>
      )}

      {/* ══════════════ القسم 2: كشوفات المنصات ══════════════ */}
      {view === 'statements' && (
        <>
          {/* فلتر نطاق التاريخ */}
          <Card>
            <CardContent className="p-3 flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  {t('مسح الفلتر', 'Clear', lang)}
                </Button>
                <TableToolbar
                  columns={statementExportColumns}
                  rows={statements}
                  title={{ ar: 'كشوفات منصات التوصيل', en: 'Delivery Platform Statements' }}
                  subheading={dateFrom || dateTo
                    ? `${dateFrom || '…'} → ${dateTo || '…'}`
                    : { ar: 'كل الفترات', en: 'All periods' }}
                />
              </div>
            </CardContent>
          </Card>

          {/* بطاقات الملخّص الشامل — محاسبية صحيحة: إيراد قبل الضريبة / ضريبة / إجمالي / عمولة / ض.عمولة / صافي / محصل / متبقي */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <SummaryCard icon={<FileText className="size-4" />} label={t('الطلبات', 'Orders', lang)} value={totals.orders} tone="slate" />
            <SummaryCard icon={<TrendingUp className="size-4" />} label={t('المبيعات (قبل الضريبة)', 'Sales (pre-tax)', lang)} value={formatCurrency(totals.salesPreTax, lang)} tone="emerald" />
            <SummaryCard icon={<Calculator className="size-4" />} label={t('ضريبة المبيعات', 'Sales VAT', lang)} value={formatCurrency(totals.salesVat, lang)} tone="slate" />
            <SummaryCard icon={<TrendingUp className="size-4" />} label={t('إجمالي المبيعات', 'Total Sales', lang)} value={formatCurrency(totals.salesTotal, lang)} tone="emerald" />
            <SummaryCard icon={<Calculator className="size-4" />} label={t('العمولات', 'Commissions', lang)} value={formatCurrency(totals.commission, lang)} tone="rose" />
            <SummaryCard icon={<Calculator className="size-4" />} label={t('ضريبة العمولات', 'Commission VAT', lang)} value={formatCurrency(totals.commissionVat, lang)} tone="rose" />
            <SummaryCard icon={<DollarSign className="size-4" />} label={t('الصافي المستحق', 'Net Payable', lang)} value={formatCurrency(totals.net, lang)} tone="teal" />
            <SummaryCard icon={<DollarSign className="size-4" />} label={t('الرصيد لدى المنصات', 'Platform Balance', lang)} value={formatCurrency(totals.pending, lang)} tone="amber" />
          </div>

          {/* جدول الكشوفات — تفصيل محاسبي كامل */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('المنصة', 'Platform', lang)}</TableHead>
                  <TableHead className="text-center">{t('الطلبات', 'Orders', lang)}</TableHead>
                  <TableHead className="text-end">{t('المبيعات قبل الضريبة', 'Sales (pre-tax)', lang)}</TableHead>
                  <TableHead className="text-end">{t('ض. المبيعات', 'Sales VAT', lang)}</TableHead>
                  <TableHead className="text-end">{t('إجمالي المبيعات', 'Total Sales', lang)}</TableHead>
                  <TableHead className="text-end">{t('العمولة', 'Commission', lang)}</TableHead>
                  <TableHead className="text-end">{t('ض. العمولة', 'Comm. VAT', lang)}</TableHead>
                  <TableHead className="text-end">{t('الصافي', 'Net', lang)}</TableHead>
                  <TableHead className="text-end">{t('المحصل', 'Paid', lang)}</TableHead>
                  <TableHead className="text-end">{t('الرصيد لدى المنصة', 'Platform Balance', lang)}</TableHead>
                  <TableHead className="text-center">{t('آخر تسوية', 'Last Settlement', lang)}</TableHead>
                  <TableHead className="text-center">{t('إجراءات', 'Actions', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      {t('جاري التحميل...', 'Loading...', lang)}
                    </TableCell>
                  </TableRow>
                ) : statements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      {t('لا توجد منصات', 'No platforms', lang)}
                    </TableCell>
                  </TableRow>
                ) : (
                  statements.map(s => (
                    <TableRow key={s.platform.id}>
                      <TableCell>
                        <div className="font-medium">{s.platform.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">{s.platform.code}</div>
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {/* commissionMethod = على ماذا تُحسب العمولة (GROSS=إجمالي، NET=صافي قبل VAT) */}
                          {/* settlementMethod = كيف تتم التسوية مع المنصة — يُعرض في عمود منفصل إن لزم */}
                          {(s.platform?.commissionMethod || s.platform?.commission_method) === 'NET'
                            ? t('العمولة على الصافي', 'Commission on Net (pre-tax)')
                            : t('العمولة على الإجمالي', 'Commission on Gross')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{s.orders}</TableCell>
                      <TableCell className="text-end font-mono" dir="ltr">{formatCurrency(s.salesPreTax, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-muted-foreground" dir="ltr">{formatCurrency(s.salesVat, lang)}</TableCell>
                      <TableCell className="text-end font-mono font-semibold" dir="ltr">{formatCurrency(s.salesTotal, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-rose-700" dir="ltr">
                        <div>{formatCurrency(s.commission, lang)}</div>
                        <div className="text-[10px] text-muted-foreground">{s.commissionRate.toFixed(2)}%</div>
                      </TableCell>
                      <TableCell className="text-end font-mono text-rose-600 text-xs" dir="ltr">{formatCurrency(s.commissionVat, lang)}</TableCell>
                      <TableCell className="text-end font-mono font-semibold text-emerald-700" dir="ltr">{formatCurrency(s.net, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-blue-700" dir="ltr">{formatCurrency(s.paid, lang)}</TableCell>
                      <TableCell className={`text-end font-mono ${s.pending > 0 ? 'text-amber-700 font-bold' : 'text-muted-foreground'}`} dir="ltr">
                        {formatCurrency(s.pending, lang)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {s.lastSettlementDate ? (
                          <div>
                            <div dir="ltr">{formatDate(s.lastSettlementDate, lang)}</div>
                            {s.lastSettlementRef && <div className="text-[10px] text-blue-600 font-mono" dir="ltr">{s.lastSettlementRef}</div>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => openDetail(s.platform)}>
                            <Eye className="size-3.5" /> {t('كشف', 'Detail', lang)}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs text-rose-700 hover:text-rose-800"
                            onClick={() => printStatement(s.platform)}
                          >
                            <Printer className="size-3.5" /> {t('طباعة', 'Print', lang)}
                          </Button>
                          {s.isFullySettled ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px]">
                              <CheckCircle2 className="size-3 ms-0.5" /> {t('تمت التسوية', 'Settled', lang)}
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              disabled={settling}
                              onClick={() => openSettleDialog(s)}
                            >
                              <Landmark className="size-3.5" /> {t('تسوية', 'Settle', lang)}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* ══════════════ القسم 3: التسويات (PlatformSettlement) ══════════════ */}
      {view === 'settlements' && (
        <>
          <div className="flex gap-3 items-end">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={settlementSearch}
                onChange={e => setSettlementSearch(e.target.value)}
                placeholder={t('بحث برقم التسوية / المنصة / الرقم المرجعي...', 'Search by settlement no / platform / reference...', lang)}
                className="ps-9"
              />
            </div>
            <TableToolbar
              columns={settlementExportColumns}
              rows={filteredSettlements}
              title={{ ar: 'تسويات منصات التوصيل', en: 'Delivery Platform Settlements' }}
            />
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('رقم التسوية', 'Settlement No.', lang)}</TableHead>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead>{t('المنصة', 'Platform', lang)}</TableHead>
                  <TableHead>{t('الفترة', 'Period', lang)}</TableHead>
                  <TableHead>{t('الاستحقاق', 'Due Date', lang)}</TableHead>
                  <TableHead className="text-end">{t('المبلغ', 'Amount', lang)}</TableHead>
                  <TableHead>{t('الطريقة', 'Method', lang)}</TableHead>
                  <TableHead>{t('الرقم المرجعي', 'Reference', lang)}</TableHead>
                  <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {t('جاري التحميل...', 'Loading...', lang)}
                    </TableCell>
                  </TableRow>
                ) : filteredSettlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {t('لا توجد تسويات', 'No settlements', lang)}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSettlements.map(st => {
                    const platform = platformById.get(st.platformId);
                    const methodLabel = st.paymentMethod === 'BANK_TRANSFER'
                      ? t('تحويل بنكي', 'Bank Transfer', lang)
                      : st.paymentMethod === 'CASH'
                        ? t('نقداً', 'Cash', lang)
                        : st.paymentMethod === 'CARD'
                          ? t('بطاقة', 'Card', lang)
                          : st.paymentMethod || '—';
                    return (
                      <TableRow key={st.id}>
                        <TableCell className="font-mono text-xs font-semibold" dir="ltr">{st.settlementNo || '—'}</TableCell>
                        <TableCell className="text-xs">{formatDate(st.date, lang)}</TableCell>
                        <TableCell>
                          <div className="font-medium text-xs">{st.platformName || platform?.name || '—'}</div>
                          {platform?.code && <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">{platform.code}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">
                          {st.periodFrom || st.periodTo
                            ? `${st.periodFrom || '…'} → ${st.periodTo || '…'}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(st.dueDate, lang) || '—'}</TableCell>
                        <TableCell className="text-end font-mono font-semibold text-emerald-700" dir="ltr">
                          {formatCurrency(Number(st.settledAmount) || 0, lang)}
                        </TableCell>
                        <TableCell className="text-xs">{methodLabel}</TableCell>
                        <TableCell>
                          {st.referenceNo ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-mono text-blue-700" dir="ltr">
                              {st.referenceNo}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary"
                            className={st.status === 'POSTED'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : st.status === 'DRAFT'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-200'}>
                            {st.status === 'POSTED' ? t('مرحّلة', 'Posted', lang)
                              : st.status === 'DRAFT' ? t('مسودة', 'Draft', lang)
                              : st.status === 'CANCELLED' ? t('ملغاة', 'Cancelled', lang)
                              : st.status || '—'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
          <p className="text-sm text-muted-foreground">
            {filteredSettlements.length} {t('تسوية', 'settlements', lang)}
          </p>
        </>
      )}

      {/* ══════════════ نافذة إضافة/تعديل منصة ══════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('تعديل المنصة', 'Edit Platform', lang) : t('إضافة منصة توصيل', 'Add Delivery Platform', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('الكود', 'Code', lang)}</Label>
              <Input
                value={form.code}
                readOnly
                className="bg-muted font-mono"
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('نسبة العمولة %', 'Commission Rate %', lang)}</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={form.commissionRate}
                onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ضريبة العمولة %', 'Commission VAT %', lang)}</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={form.commissionVatRate}
                onChange={e => setForm(f => ({ ...f, commissionVatRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('طريقة احتساب العمولة', 'Commission Calc Method', lang)}</Label>
              <Select value={form.commissionMethod} onValueChange={v => setForm(f => ({ ...f, commissionMethod: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GROSS">{t('على الإجمالي', 'On Gross', lang)}</SelectItem>
                  <SelectItem value="NET">{t('على الصافي قبل الضريبة', 'On Net (pre-tax)', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('طريقة التسوية', 'Settlement Method', lang)}</Label>
              <Select value={form.settlementMethod} onValueChange={v => setForm(f => ({ ...f, settlementMethod: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET">{t('العمولة على الصافي (المنصة تخصم العمولة قبل التحويل)', 'Commission on Net (platform deducts commission before transfer)', lang)}</SelectItem>
                  <SelectItem value="GROSS">{t('العمولة على الإجمالي (تحويل بالإجمالي ثم فاتورة عمولة)', 'Commission on Gross (full transfer + commission invoice)', lang)}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {form.settlementMethod === 'GROSS'
                  ? t('الذمة = الإجمالي، وتُسجّل العمولة عند التسوية', 'Receivable = full; commission recorded at settlement', lang)
                  : t('الذمة = الصافي، وتُسجّل العمولة عند البيع', 'Receivable = net; commission recorded at sale', lang)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('حساب التسوية', 'Settlement Account', lang)}</Label>
              <Select value={form.settlementAccountCode} onValueChange={v => setForm(f => ({ ...f, settlementAccountCode: v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1112">{t('البنك (1112)', 'Bank (1112)', lang)}</SelectItem>
                  <SelectItem value="1111">{t('الصندوق (1111)', 'Cash (1111)', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('مثال: هنقرستيشن', 'e.g. HungerStation', lang)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label>
              <Input
                value={form.nameEn}
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                placeholder="HungerStation"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الهاتف', 'Phone', lang)}</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="920000001"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={form.isActive !== false}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, isActive: checked }))}
                />
                <span className="text-sm">
                  {form.isActive !== false ? t('نشطة', 'Active', lang) : t('معطّلة', 'Inactive', lang)}
                </span>
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('ملاحظات', 'Notes', lang)}</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder={t('ملاحظات حول المنصة، شروط العمولة...', 'Platform notes, commission terms...', lang)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ نافذة الكشف التفصيلي ══════════════ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="size-5 text-rose-600" />
              {t('كشف تفصيلي', 'Detailed Statement', lang)}
              {detailPlatform && (
                <span className="text-muted-foreground font-normal">— {detailPlatform.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailPlatform && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <DetailStat label={t('عدد الطلبات', 'Orders', lang)} value={detailRows.length} />
              <DetailStat label={t('الإيرادات', 'Revenue', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0), lang)} />
              <DetailStat label={t('العمولة', 'Commission', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.platformCommission) || 0), 0), lang)} />
              <DetailStat label={t('الصافي', 'Net', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.totalAmount) || 0) - (Number(i.platformCommission) || 0), 0), lang)} />
            </div>
          )}

          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>{t('رقم الإيصال', 'Invoice No.', lang)}</TableHead>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                  <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                  <TableHead className="text-end">{t('العمولة', 'Commission', lang)}</TableHead>
                  <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t('لا توجد إيصالات لهذه المنصة', 'No invoices for this platform', lang)}
                    </TableCell>
                  </TableRow>
                ) : (
                  detailRows.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs" dir="ltr">{inv.invoiceNo || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDate(inv.date || inv.created_date, lang)}</TableCell>
                      <TableCell className="text-xs">{inv.clientName || '—'}</TableCell>
                      <TableCell className="text-end font-mono text-xs" dir="ltr">{formatCurrency(Number(inv.totalAmount) || 0, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-xs text-rose-700" dir="ltr">{formatCurrency(Number(inv.platformCommission) || 0, lang)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary"
                          className={inv.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : inv.status === 'PARTIALLY_PAID'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'}>
                          {inv.status === 'PAID' ? t('مدفوع', 'Paid', lang)
                            : inv.status === 'PARTIALLY_PAID' ? t('جزئي', 'Partial', lang)
                            : inv.status || '—'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              {t('إغلاق', 'Close', lang)}
            </Button>
            {detailPlatform && (
              <>
                <Button
                  variant="outline"
                  className="gap-1.5 text-rose-700 hover:text-rose-800 border-rose-200 hover:bg-rose-50"
                  onClick={() => printStatement(detailPlatform)}
                >
                  <Printer className="size-4" />
                  {t('طباعة الكشف', 'Print Statement', lang)}
                </Button>
                <Button
                  onClick={() => settleByPlatform(detailPlatform)}
                  disabled={settling}
                  className="gap-2 bg-rose-600 hover:bg-rose-700"
                >
                  <DollarSign className="size-4" />
                  {settling ? t('جاري التسوية...', 'Settling...', lang) : t('تسوية الإيصالات المعلّقة', 'Settle Pending', lang)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('حذف المنصة', 'Delete Platform', lang)}
        description={t(
          'سيتم حذف المنصة نهائياً. لن تُحذف الإيصالات المرتبطة بها. هل أنت متأكد؟',
          'This platform will be permanently deleted. Linked invoices will not be deleted. Are you sure?',
          lang
        )}
        onConfirm={remove}
        confirmLabel={t('حذف', 'Delete', lang)}
      />

      {/* ══════════════ نافذة التسوية الحقيقية ══════════════ */}
      <Dialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="size-5 text-emerald-600" />
              {t('تسوية منصة', 'Platform Settlement', lang)}
              {settleTarget?.platform && (
                <span className="text-muted-foreground font-normal">— {settleTarget.platform.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {settleTarget && (
            <>
              {/* ملخّص كشف المنصة — تفصيل محاسبي كامل (تلقائي من الفواتير) */}
              <div className="grid grid-cols-2 gap-1.5 text-xs bg-muted/40 rounded-lg p-3 mb-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('عدد الطلبات', 'Orders', lang)}</span>
                  <span className="font-semibold">{settleTarget.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('طريقة التسوية', 'Settlement', lang)}</span>
                  <Badge variant="outline" className="text-[10px] h-5">{settleTarget.settlementMethod}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('المبيعات قبل الضريبة', 'Sales (pre-tax)', lang)}</span>
                  <span className="font-mono" dir="ltr">{formatCurrency(settleTarget.salesPreTax, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('ضريبة المبيعات', 'Sales VAT', lang)}</span>
                  <span className="font-mono text-muted-foreground" dir="ltr">{formatCurrency(settleTarget.salesVat, lang)}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="font-medium">{t('إجمالي المبيعات', 'Total Sales', lang)}</span>
                  <span className="font-mono font-semibold" dir="ltr">{formatCurrency(settleTarget.salesTotal, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('العمولة', 'Commission', lang)} ({settleTarget.commissionRate.toFixed(2)}%)</span>
                  <span className="font-mono text-rose-700" dir="ltr">{formatCurrency(settleTarget.commission, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('ضريبة العمولة', 'Commission VAT', lang)}</span>
                  <span className="font-mono text-rose-600" dir="ltr">{formatCurrency(settleTarget.commissionVat, lang)}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="font-medium">{t('صافي المستحق', 'Net Payable', lang)}</span>
                  <span className="font-mono font-semibold text-emerald-700" dir="ltr">{formatCurrency(settleTarget.net, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('المحصل سابقاً', 'Already Paid', lang)}</span>
                  <span className="font-mono text-blue-700" dir="ltr">{formatCurrency(settleTarget.paid, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">{t('المتبقي', 'Pending', lang)}</span>
                  <span className="font-mono font-bold text-amber-700" dir="ltr">{formatCurrency(settleTarget.pending, lang)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('تاريخ التسوية', 'Settlement Date', lang)} *</Label>
                    <Input type="date" value={settleForm.date} onChange={e => setSettleForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('مبلغ التسوية', 'Settlement Amount', lang)} *</Label>
                    <Input type="number" min="0" step="0.01" value={settleForm.settledAmount} onChange={e => setSettleForm(f => ({ ...f, settledAmount: e.target.value }))} dir="ltr" />
                  </div>
                </div>
                {/* فترة التسوية + تاريخ الاستحقاق */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Calendar className="size-3" /> {t('فترة من', 'Period From', lang)}</Label>
                    <Input type="date" value={settleForm.periodFrom} onChange={e => setSettleForm(f => ({ ...f, periodFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Calendar className="size-3" /> {t('فترة إلى', 'Period To', lang)}</Label>
                    <Input type="date" value={settleForm.periodTo} onChange={e => setSettleForm(f => ({ ...f, periodTo: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Calendar className="size-3" /> {t('تاريخ الاستحقاق', 'Due Date', lang)}</Label>
                    <Input type="date" value={settleForm.dueDate} onChange={e => setSettleForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('طريقة الاستلام', 'Receipt Method', lang)}</Label>
                    <Select value={settleForm.paymentMethod} onValueChange={v => setSettleForm(f => ({ ...f, paymentMethod: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BANK_TRANSFER">{t('تحويل بنكي', 'Bank Transfer', lang)}</SelectItem>
                        <SelectItem value="CASH">{t('نقداً', 'Cash', lang)}</SelectItem>
                        <SelectItem value="CARD">{t('بطاقة', 'Card', lang)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('الحساب المستلم عليه', 'Receiving Account', lang)}</Label>
                    <Select value={settleForm.settlementAccountCode} onValueChange={v => setSettleForm(f => ({ ...f, settlementAccountCode: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1112">{t('البنك (1112)', 'Bank (1112)', lang)}</SelectItem>
                        <SelectItem value="1111">{t('الصندوق (1111)', 'Cash (1111)', lang)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Landmark className="size-3" /> {t('رقم مرجعي', 'Reference No.', lang)}
                  </Label>
                  <Input value={settleForm.referenceNo} onChange={e => setSettleForm(f => ({ ...f, referenceNo: e.target.value }))} placeholder={t('إشعار تحويل، رقم إيصال…', 'Transfer advice, receipt no…', lang)} dir="ltr" className="font-mono" />
                  <p className="text-[10px] text-muted-foreground">{t('سيظهر بوضوح في كشف التسوية وقائمة التسويات.', 'Will be shown prominently in the settlement statement and list.', lang)}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('ملاحظات', 'Notes', lang)}</Label>
                  <Input value={settleForm.notes} onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <p className="text-[11px] text-muted-foreground bg-emerald-50 border border-emerald-200 rounded p-2">
                  {t('سيُنشأ قيد محاسبي: مدين الحساب المستلم عليه / دائن ذمم المنصة (1115). يُخفّض الذمة تدريجياً.',
                     'Creates a journal entry: debit receiving account / credit platform receivable (1115). Reduces balance gradually.', lang)}
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSettleDialogOpen(false)}>
                  {t('إلغاء', 'Cancel', lang)}
                </Button>
                <Button onClick={submitSettlement} disabled={settling} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  {settling ? <RefreshCw className="size-4 animate-spin" /> : <Landmark className="size-4" />}
                  {t('تأكيد التسوية', 'Confirm Settlement', lang)}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}

// ─── مكوّنات مساعدة محلية ──────────────────────────────────────────────
function SummaryCard({ icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <Card className={`border ${tones[tone] || tones.slate}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] opacity-80 mb-1">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-base font-bold" dir="ltr">{value}</div>
      </CardContent>
    </Card>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold mt-0.5" dir="ltr">{value}</div>
    </div>
  );
}

// ─── مولّد HTML لكشف منصة قابل للطباعة ───────────────────────────────
// يبني مستنداً رسمياً يتضمّن: ترويسة الشركة، بيانات المنصة (الاسم/الكود/العمولة/طريقة التسوية)،
// فترة الكشف، ملخّصاً محاسبياً (طلبات/مبيعات/ضريبة/عمولة/صافي/محصل/معلّق)،
// جدول الإيصالات التفصيلي، وجدول التسويات المرحّلة (مع الرقم المرجعي بوضوح).
function buildStatementPrintHtml({ statement, settings, lang, dateFrom, dateTo, formatCurrency, formatDate, t }) {
  const primary = settings.primaryColor || '#e11d48';
  const p = statement.platform;
  const invs = statement.invoices || [];
  const setts = statement.settlements || [];
  const money = (v) => formatCurrency(Number(v) || 0, lang);
  const periodLabel = dateFrom || dateTo
    ? `${dateFrom || '…'} → ${dateTo || '…'}`
    : (invs.length
      ? `${formatDate(invs[invs.length - 1].date || invs[invs.length - 1].created_date, lang)} → ${formatDate(invs[0].date || invs[0].created_date, lang)}`
      : t('كل الفترات', 'All periods', lang));

  const companyName = lang === 'ar'
    ? (settings.companyName || settings.companyNameEn || '')
    : (settings.companyNameEn || settings.companyName || '');

  const contactBits = [
    settings.address && [settings.address, settings.city].filter(Boolean).join('، '),
    settings.phone && `${t('هاتف', 'Tel', lang)}: ${settings.phone}`,
    settings.vatNumber && `${t('الرقم الضريبي', 'VAT', lang)}: ${settings.vatNumber}`,
    settings.crNumber && `${t('السجل التجاري', 'CR', lang)}: ${settings.crNumber}`,
  ].filter(Boolean);

  const settlementMethodLabel = p.settlementMethod === 'GROSS'
    ? t('إجمالي (تحويل بالإجمالي + فاتورة عمولة)', 'Gross (full transfer + commission invoice)', lang)
    : t('صافي (المنصة تخصم العمولة)', 'Net (platform deducts commission)', lang);

  const infoRow = (label, val) => val
    ? `<div style="margin-bottom:3px"><span style="color:#6b7280;font-size:11px">${label}:</span> <strong>${val}</strong></div>`
    : '';

  // ─── صفوف الإيصالات ───
  const invoiceRows = invs.length ? invs.map(inv => `
    <tr style="border-top:1px solid #e5e7eb">
      <td style="padding:6px 8px;white-space:nowrap;color:#6b7280;font-family:monospace" dir="ltr">${formatDate(inv.date || inv.created_date, lang)}</td>
      <td style="padding:6px 8px;font-family:monospace;font-size:11px" dir="ltr">${inv.invoiceNo || '—'}</td>
      <td style="padding:6px 8px">${inv.clientName || '—'}</td>
      <td style="padding:6px 8px;text-align:end" dir="ltr">${money(inv.totalAmount)}</td>
      <td style="padding:6px 8px;text-align:end;color:#be123c" dir="ltr">${money(inv.platformCommission)}</td>
      <td style="padding:6px 8px;text-align:center">${inv.status || '—'}</td>
    </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:18px;color:#9ca3af">${t('لا توجد إيصالات', 'No invoices', lang)}</td></tr>`;

  // ─── صفوف التسويات ───
  const settlementRows = setts.length ? setts.map(st => {
    const methodLabel = st.paymentMethod === 'BANK_TRANSFER'
      ? t('تحويل بنكي', 'Bank Transfer', lang)
      : st.paymentMethod === 'CASH'
        ? t('نقداً', 'Cash', lang)
        : st.paymentMethod === 'CARD'
          ? t('بطاقة', 'Card', lang)
          : (st.paymentMethod || '—');
    return `
      <tr style="border-top:1px solid #e5e7eb">
        <td style="padding:6px 8px;white-space:nowrap;color:#6b7280;font-family:monospace" dir="ltr">${formatDate(st.date, lang)}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:11px" dir="ltr">${st.settlementNo || '—'}</td>
        <td style="padding:6px 8px;text-align:end;font-weight:600" dir="ltr">${money(st.settledAmount)}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:#1d4ed8" dir="ltr">${st.referenceNo || '—'}</td>
        <td style="padding:6px 8px">${methodLabel}</td>
      </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:18px;color:#9ca3af">${t('لا توجد تسويات مرحّلة', 'No posted settlements', lang)}</td></tr>`;

  // ─── بطاقات الملخّص ───
  const summaryTile = (label, value, color) => `
    <div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#f9fafb">
      <div style="font-size:10.5px;color:#6b7280;margin-bottom:3px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color}" dir="ltr">${value}</div>
    </div>`;

  return `
    <div style="max-width:920px;margin:0 auto">
      ${settings.headerImageUrl ? `<img src="${settings.headerImageUrl}" style="display:block;width:100%;object-fit:cover;margin-bottom:12px" />` : ''}
      <div style="border-bottom:3px solid ${primary};padding-bottom:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div style="display:flex;gap:12px;align-items:center">
            ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="height:60px;width:60px;object-fit:contain" />` : ''}
            <div style="font-weight:800;font-size:19px;color:${primary}">${companyName}</div>
          </div>
          <div style="text-align:end">
            <div style="font-weight:800;font-size:18px;color:${primary}">${t('كشف منصة توصيل', 'Delivery Platform Statement', lang)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${t('الفترة', 'Period', lang)}: <span dir="ltr">${periodLabel}</span></div>
          </div>
        </div>
        ${contactBits.length ? `<div style="font-size:10.5px;color:#475569;margin-top:10px;line-height:1.7">${contactBits.join('  •  ')}</div>` : ''}
      </div>

      <!-- بيانات المنصة -->
      <div style="display:flex;justify-content:space-between;gap:20px;font-size:12px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${t('المنصة', 'Platform', lang)}</div>
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.name} ${p.nameEn ? `<span style="color:#6b7280;font-weight:400;font-size:12px" dir="ltr">(${p.nameEn})</span>` : ''}</div>
          ${infoRow(t('الكود', 'Code', lang), p.code)}
          ${infoRow(t('نسبة العمولة', 'Commission Rate', lang), `${Number(p.commissionRate || 0).toFixed(2)}%`)}
          ${infoRow(t('طريقة التسوية', 'Settlement Method', lang), settlementMethodLabel)}
          ${p.phone ? infoRow(t('الهاتف', 'Phone', lang), p.phone) : ''}
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;text-align:center;min-width:200px;background:#fef2f2">
          <div style="font-size:11px;color:#6b7280">${t('المتبقي على المنصة', 'Pending from Platform', lang)}</div>
          <div style="font-size:24px;font-weight:800;color:#b45309;margin-top:4px" dir="ltr">${money(statement.pending)}</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:4px">${t('صافي مستحق', 'Net payable', lang)}: <span dir="ltr">${money(statement.net)}</span> • ${t('محصل', 'Paid', lang)}: <span dir="ltr">${money(statement.paid)}</span></div>
        </div>
      </div>

      <!-- ملخّص محاسبي -->
      <div style="display:flex;gap:8px;margin-bottom:18px">
        ${summaryTile(t('عدد الطلبات', 'Orders', lang), statement.orders, '#475569')}
        ${summaryTile(t('المبيعات قبل الضريبة', 'Sales (pre-tax)', lang), money(statement.salesPreTax), '#047857')}
        ${summaryTile(t('ضريبة المبيعات', 'Sales VAT', lang), money(statement.salesVat), '#475569')}
        ${summaryTile(t('إجمالي المبيعات', 'Total Sales', lang), money(statement.salesTotal), '#047857')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:18px">
        ${summaryTile(t('العمولة', 'Commission', lang), money(statement.commission), '#be123c')}
        ${summaryTile(t('ضريبة العمولة', 'Commission VAT', lang), money(statement.commissionVat), '#be123c')}
        ${summaryTile(t('صافي المستحق', 'Net Payable', lang), money(statement.net), '#0d9488')}
        ${summaryTile(t('المحصل', 'Paid', lang), money(statement.paid), '#1d4ed8')}
        ${summaryTile(t('المتبقي', 'Pending', lang), money(statement.pending), '#b45309')}
      </div>

      <!-- جدول الإيصالات -->
      <div style="font-weight:700;font-size:12px;color:${primary};margin-bottom:6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${t('تفاصيل الإيصالات', 'Invoice Details', lang)} (${invs.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px">
        <thead>
          <tr style="background:${primary};color:#fff">
            <th style="text-align:start;padding:7px 8px">${t('التاريخ', 'Date', lang)}</th>
            <th style="text-align:start;padding:7px 8px">${t('رقم الإيصال', 'Invoice No.', lang)}</th>
            <th style="text-align:start;padding:7px 8px">${t('الزبون', 'Customer', lang)}</th>
            <th style="text-align:end;padding:7px 8px">${t('الإجمالي', 'Total', lang)}</th>
            <th style="text-align:end;padding:7px 8px">${t('العمولة', 'Commission', lang)}</th>
            <th style="text-align:center;padding:7px 8px">${t('الحالة', 'Status', lang)}</th>
          </tr>
        </thead>
        <tbody>${invoiceRows}</tbody>
      </table>

      <!-- جدول التسويات -->
      <div style="font-weight:700;font-size:12px;color:${primary};margin-bottom:6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">${t('التسويات المرحّلة', 'Posted Settlements', lang)} (${setts.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px">
        <thead>
          <tr style="background:${primary};color:#fff">
            <th style="text-align:start;padding:7px 8px">${t('التاريخ', 'Date', lang)}</th>
            <th style="text-align:start;padding:7px 8px">${t('رقم التسوية', 'Settlement No.', lang)}</th>
            <th style="text-align:end;padding:7px 8px">${t('المبلغ', 'Amount', lang)}</th>
            <th style="text-align:start;padding:7px 8px">${t('الرقم المرجعي', 'Reference No.', lang)}</th>
            <th style="text-align:start;padding:7px 8px">${t('الطريقة', 'Method', lang)}</th>
          </tr>
        </thead>
        <tbody>${settlementRows}</tbody>
      </table>

      ${settings.footerImageUrl ? `<img src="${settings.footerImageUrl}" style="display:block;width:100%;object-fit:cover;margin-top:24px" />` : ''}
      <div style="margin-top:24px;border-top:2px solid ${primary};padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748b">
        <span>${companyName}</span>
        <span>${t('تم إصدار هذا الكشف آلياً بتاريخ', 'Generated automatically on', lang)} ${formatDate(new Date().toISOString(), lang)}</span>
      </div>
    </div>`;
}
