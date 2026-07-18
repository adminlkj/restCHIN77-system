import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, FileWarning, HandCoins, FileClock, Wrench, RefreshCw, CheckCircle2, CheckCheck, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';

const DAY = 864e5;
// فاصل التحديث التلقائي: دقيقتان (بدلاً من إعادة الجلب عند كل تغيير في store).
const REFRESH_INTERVAL = 120_000;

export default function NotificationCenter() {
  // نأخذ فقط ما نحتاجه من store (lang + setActiveItem + setEmployeeContext).
  // لا نأخذ كائن store كاملاً لتفادي إعادة بناء useCallback عند كل render.
  const { lang, setActiveItem, setEmployeeContext } = useStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  // قراءة الإشعارات المقروءة من localStorage
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('binaa-read-notifications') || '[]'); } catch { return []; }
  });
  const boxRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ─── بناء الإشعارات ───
  // deps: lang فقط (setActiveItem/setEmployeeContext أصبحت stable بعد إصلاح store.jsx).
  // هذا يمنع إعادة الجلب عند كل تنقّل/تغيير سياق — الجلب يتم:
  //   1) مرة واحدة عند التحميل
  //   2) كل دقيقتين (REFRESH_INTERVAL)
  //   3) عند الضغط على زر التحديث يدوياً
  const build = useCallback(async () => {
    setLoading(true);
    const now = Date.now();
    try {
      const [invoices, advances, docs, maintenance, supplierInvoices, payrollRuns, purchaseOrders] = await Promise.all([
        base44.entities.SalesInvoice.list('-date', 300).catch(() => []),
        base44.entities.EmployeeAdvance.list('-date', 300).catch(() => []),
        base44.entities.EmployeeDocument.list('-created_date', 300).catch(() => []),
        base44.entities.MaintenanceRecord.list('-date', 300).catch(() => []),
        base44.entities.SupplierInvoice.list('-date', 300).catch(() => []),
        base44.entities.PayrollRun.list('-created_date', 300).catch(() => []),
        base44.entities.PurchaseOrder.list('-created_date', 300).catch(() => []),
      ]);
      const items = [];

      // 1. فواتير عملاء متأخرة
      invoices.forEach(inv => {
        const unpaid = (inv.totalAmount || 0) - (inv.paidAmount || 0);
        const overdue = inv.dueDate && new Date(inv.dueDate).getTime() < now;
        if (unpaid > 0.5 && (overdue || inv.status === 'OVERDUE')) {
          items.push({
            id: `inv-${inv.id}`, Icon: FileWarning, tone: 'rose',
            titleAr: `فاتورة متأخرة: ${inv.invoiceNo}`, titleEn: `Overdue invoice: ${inv.invoiceNo}`,
            metaAr: `${inv.clientName || ''} · متبقٍ ${formatCurrency(unpaid, lang)}`,
            metaEn: `${inv.clientName || ''} · ${formatCurrency(unpaid, lang)} due`,
            go: () => setActiveItem('sales'),
          });
        }
      });

      // 2. فواتير موردين مستحقة السداد
      supplierInvoices.forEach(inv => {
        const unpaid = (inv.totalAmount || 0) - (inv.paidAmount || 0);
        const dueSoon = inv.dueDate && new Date(inv.dueDate).getTime() < now + 7 * DAY;
        if (unpaid > 0.5 && ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) && dueSoon) {
          items.push({
            id: `sup-${inv.id}`, Icon: FileWarning, tone: 'amber',
            titleAr: `فاتورة مورد مستحقة: ${inv.invoiceNo}`, titleEn: `Supplier invoice due: ${inv.invoiceNo}`,
            metaAr: `${inv.supplierName || ''} · ${formatCurrency(unpaid, lang)}`,
            metaEn: `${inv.supplierName || ''} · ${formatCurrency(unpaid, lang)}`,
            go: () => setActiveItem('supplier-invoices'),
          });
        }
      });

      // 3. سلف موظفين مفتوحة
      advances.filter(a => a.status !== 'SETTLED').forEach(a => {
        const rem = (a.amount || 0) - (a.deductedAmount || 0);
        if (rem > 0.5) items.push({
          id: `adv-${a.id}`, Icon: HandCoins, tone: 'amber',
          titleAr: 'سلفة موظف مفتوحة', titleEn: 'Open employee advance',
          metaAr: `متبقٍ ${formatCurrency(rem, lang)}`, metaEn: `${formatCurrency(rem, lang)} remaining`,
          go: () => { setEmployeeContext(a.employeeId, ''); setActiveItem('employee-workspace'); },
        });
      });

      // 4. وثائق تنتهي خلال 30 يوم
      docs.filter(d => d.expiryDate && new Date(d.expiryDate).getTime() < now + 30 * DAY).forEach(d => {
        items.push({
          id: `doc-${d.id}`, Icon: FileClock, tone: 'orange',
          titleAr: `وثيقة تنتهي قريباً: ${d.name}`, titleEn: `Document expiring: ${d.name}`,
          metaAr: `تنتهي ${formatDate(d.expiryDate, lang)}`, metaEn: `Expires ${formatDate(d.expiryDate, lang)}`,
          go: () => { setEmployeeContext(d.employeeId, ''); setActiveItem('employee-workspace'); },
        });
      });

      // 5. صيانة معدات قيد التنفيذ
      maintenance.filter(m => m.status === 'OPEN' || m.status === 'IN_PROGRESS').forEach(m => {
        items.push({
          id: `mnt-${m.id}`, Icon: Wrench, tone: 'cyan',
          titleAr: 'صيانة معدة قيد التنفيذ', titleEn: 'Equipment maintenance in progress',
          metaAr: m.description || '', metaEn: m.description || '',
          go: () => setActiveItem('equipment-maintenance'),
        });
      });

      // 6. مسيرات رواتب معلقة
      payrollRuns.filter(p => p.status === 'DRAFT').forEach(p => {
        items.push({
          id: `pay-${p.id}`, Icon: FileClock, tone: 'cyan',
          titleAr: `مسير رواتب معلق: ${p.code}`, titleEn: `Pending payroll: ${p.code}`,
          metaAr: `${formatCurrency(p.netAmount || 0, lang)}`, metaEn: `${formatCurrency(p.netAmount || 0, lang)}`,
          go: () => setActiveItem('payroll-runs'),
        });
      });

      // 7. أوامر شراء معلقة (DRAFT/APPROVED بدون استلام)
      purchaseOrders.filter(po => ['DRAFT', 'APPROVED'].includes(po.status)).forEach(po => {
        items.push({
          id: `po-${po.id}`, Icon: FileClock, tone: 'amber',
          titleAr: `أمر شراء معلق: ${po.orderNo}`, titleEn: `Pending purchase order: ${po.orderNo}`,
          metaAr: `${po.supplierName || ''} · ${formatCurrency((po.totalAmount || 0) + (po.vatAmount || 0), lang)}`,
          metaEn: `${po.supplierName || ''} · ${formatCurrency((po.totalAmount || 0) + (po.vatAmount || 0), lang)}`,
          go: () => setActiveItem('purchase-orders'),
        });
      });

      setTasks(items);
    } catch { /* silent — notifications are non-critical */ }
    finally { setLoading(false); }
  }, [lang, setActiveItem, setEmployeeContext]);

  // ─── تحميل مرة واحدة عند التحميل + تحديث دوري كل دقيقتين ───
  // بدلاً من إعادة الجلب عند كل تغيير في store (الذي كان يسبب 7 طلبات لكل تنقّل).
  useEffect(() => {
    build();
    const timer = setInterval(build, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [build]);

  const tones = {
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };

  // الإشعارات غير المقروءة فقط
  const unread = tasks.filter(t => !readIds.includes(t.id));
  const count = unread.length;

  // وضع علامة مقروء لإشعار واحد
  const markRead = (id) => {
    const newRead = [...new Set([...readIds, id])];
    setReadIds(newRead);
    localStorage.setItem('binaa-read-notifications', JSON.stringify(newRead));
  };

  // وضع علامة مقروء للكل
  const markAllRead = () => {
    const allIds = tasks.map(t => t.id);
    const newRead = [...new Set([...readIds, ...allIds])];
    setReadIds(newRead);
    localStorage.setItem('binaa-read-notifications', JSON.stringify(newRead));
  };

  // حذف إشعار (إخفاؤه نهائياً)
  const dismiss = (id) => {
    markRead(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen(o => !o)} className="relative size-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute top-1 end-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full end-0 mt-2 w-96 bg-white border border-border rounded-xl shadow-lg z-50 max-h-[70vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <span className="text-sm font-bold text-foreground">{t('الإشعارات', 'Notifications', lang)}</span>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button onClick={markAllRead} title={t('تحديد الكل كمقروء', 'Mark all read', lang)}
                  className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                  <CheckCheck className="size-4 text-muted-foreground" />
                </button>
              )}
              <button onClick={build} title={t('تحديث', 'Refresh', lang)}
                className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                <RefreshCw className={`size-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div className="overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</div>
            ) : count === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="size-12 mx-auto mb-3 text-emerald-500" />
                <p className="text-sm text-muted-foreground">{t('لا توجد إشعارات جديدة', 'No new notifications', lang)}</p>
              </div>
            ) : (
              unread.map(item => {
                const Icon = item.Icon;
                return (
                  <div key={item.id}
                    className="group w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 text-start border-b border-border/50 last:border-0 transition-colors">
                    <button onClick={() => { item.go(); markRead(item.id); setOpen(false); }}
                      className="flex items-start gap-3 flex-1 min-w-0 text-start">
                      <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${tones[item.tone]}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight text-foreground">{lang === 'ar' ? item.titleAr : item.titleEn}</div>
                        {(lang === 'ar' ? item.metaAr : item.metaEn) && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{lang === 'ar' ? item.metaAr : item.metaEn}</div>
                        )}
                      </div>
                    </button>
                    {/* زر الحذف يظهر عند hover */}
                    <button onClick={(e) => { e.stopPropagation(); dismiss(item.id); }}
                      title={t('حذف', 'Dismiss', lang)}
                      className="size-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {count > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/20">
              <button onClick={markAllRead} className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">
                {t('تحديد الكل كمقروء', 'Mark all as read', lang)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
