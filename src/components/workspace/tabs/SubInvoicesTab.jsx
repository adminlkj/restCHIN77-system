import React, { useState } from 'react';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import CrudTab from '@/components/workspace/CrudTab';
import InvoiceAttachmentField from '@/components/shared/InvoiceAttachmentField';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { ar: 'مقدّمة', en: 'Submitted', color: 'bg-blue-100 text-blue-700' },
  APPROVED: { ar: 'معتمدة', en: 'Approved', color: 'bg-indigo-100 text-indigo-700' },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partially Paid', color: 'bg-amber-100 text-amber-700' },
  PAID: { ar: 'مدفوعة', en: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { ar: 'مرفوضة', en: 'Rejected', color: 'bg-rose-100 text-rose-700' },
};

const TYPES = { PROGRESS: { ar: 'مستخلص جاري', en: 'Progress' }, FINAL: { ar: 'نهائي', en: 'Final' }, SUPPLY: { ar: 'توريد', en: 'Supply' } };

// المستحق للدفع = الأساسي - المحتجز + الضريبة.
const computeTotal = (f) => {
  const base = Number(f.baseAmount) || 0;
  const retention = Number(f.retentionAmount) || 0;
  const net = Math.max(base - retention, 0);
  const vat = Math.round(base * 0.15 * 100) / 100;
  return { net, vat, total: net + vat };
};

export default function SubInvoicesTab({ subcontractorId, subcontractorName, contracts = [] }) {
  const { lang } = useStore();
  const { toast } = useToast();
  const [approvingId, setApprovingId] = useState(null);

  // اعتماد المستخلص → ترحيل قيد الالتزام. reload يعيد تحميل الجدول عبر CrudTab.
  const approve = async (row, reload) => {
    setApprovingId(row.id);
    try {
      await OperationEngine.approveSubcontractorInvoice(row.id);
      toast({ title: t('تم اعتماد المستخلص وترحيل القيد', 'Invoice approved & posted', lang) });
      await reload();
    } catch (e) {
      toast({ title: t('فشل الاعتماد', 'Approval failed', lang), description: e.message, variant: 'destructive' });
    }
    setApprovingId(null);
  };

  return (
    <CrudTab
      entityName="SubcontractorInvoice"
      filter={{ subcontractorId }}
      operationHandlers={{
        create: (payload) => OperationEngine.createSubcontractorInvoice(payload),
        update: (id, payload) => OperationEngine.updateSubcontractorInvoice(id, payload),
      }}
      rowActions={(row, reload) => row.status === 'DRAFT' && (
        <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={approvingId === row.id} onClick={() => approve(row, reload)}>
          <CheckCircle2 className="size-3.5" />{approvingId === row.id ? t('جارٍ...', '...', lang) : t('اعتماد', 'Approve', lang)}
        </Button>
      )}
      canEditRow={(row) => row.status === 'DRAFT'}
      canDeleteRow={(row) => row.status === 'DRAFT'}
      defaults={(rows) => ({
        subcontractorId, subcontractorContractId: '', invoiceNo: nextCodeFromList(rows, 'SINV', 'invoiceNo'), invoiceType: 'PROGRESS',
        date: new Date().toISOString().slice(0, 10), dueDate: '',
        baseAmount: 0, retentionAmount: 0, paidAmount: 0, status: 'DRAFT', description: '', notes: '',
        invoiceAttachmentUrl: '', invoiceAttachmentName: '', invoiceAttachmentType: '',
      })}
      validate={(f) => (!f.invoiceNo?.trim() ? t('أدخل رقم المستخلص', 'Enter invoice number', lang) : null)}
      buildPayload={(f) => {
        const { vat, total } = computeTotal(f);
        return {
          subcontractorId, subcontractorName: subcontractorName || '', subcontractorContractId: f.subcontractorContractId || '',
          projectId: f.projectId || '', projectName: f.projectName || '',
          invoiceNo: f.invoiceNo, invoiceType: f.invoiceType, date: f.date || null, dueDate: f.dueDate || null,
          baseAmount: Number(f.baseAmount) || 0, retentionAmount: Number(f.retentionAmount) || 0,
          vatAmount: vat, totalAmount: total, paidAmount: 0,
          status: 'DRAFT', description: f.description, notes: f.notes,
          invoiceAttachmentUrl: f.invoiceAttachmentUrl || '', invoiceAttachmentName: f.invoiceAttachmentName || '', invoiceAttachmentType: f.invoiceAttachmentType || '',
        };
      }}
      labels={{
        new: { ar: 'مستخلص جديد', en: 'New Invoice' }, edit: { ar: 'تعديل المستخلص', en: 'Edit Invoice' },
        empty: { ar: 'لا توجد مستخلصات لهذا المقاول', en: 'No invoices for this subcontractor' }, title: { ar: 'حذف المستخلص', en: 'Delete Invoice' },
      }}
      summary={(rows) => {
        const total = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
        const paid = rows.reduce((s, r) => s + (r.paidAmount || 0), 0);
        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t('الإجمالي', 'Total', lang)}: <span className="font-bold text-foreground">{formatCurrency(total, lang)}</span></span>
            <span>{t('المدفوع', 'Paid', lang)}: <span className="font-bold text-emerald-600">{formatCurrency(paid, lang)}</span></span>
            <span>{t('المتبقي', 'Outstanding', lang)}: <span className="font-bold text-rose-600">{formatCurrency(total - paid, lang)}</span></span>
          </span>
        );
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.invoiceNo}</span> },
        { header: { ar: 'النوع', en: 'Type' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? TYPES[r.invoiceType]?.ar : TYPES[r.invoiceType]?.en}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الإجمالي', en: 'Total' }, cell: r => formatCurrency(r.totalAmount, lang) },
        { header: { ar: 'المدفوع', en: 'Paid' }, cell: r => <span className="text-emerald-600">{formatCurrency(r.paidAmount, lang)}</span> },
        { header: { ar: 'المرفق', en: 'Attachment' }, cell: r => r.invoiceAttachmentUrl ? <a href={r.invoiceAttachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"><Paperclip className="size-3.5" />{t('فتح', 'Open', lang)}</a> : <span className="text-xs text-muted-foreground">—</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = STATUS[r.status] || STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => {
        const { net, vat, total } = computeTotal(form);
        return (
          <>
            <div className="space-y-1.5"><Label>{t('رقم المستخلص', 'Invoice No', lang)} *</Label><Input value={form.invoiceNo || ''} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('النوع', 'Type', lang)}</Label>
              <Select value={form.invoiceType || 'PROGRESS'} onValueChange={v => set('invoiceType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {contracts.length > 0 && (
              <div className="space-y-1.5 md:col-span-2">
                <Label>{t('العقد المرتبط', 'Linked Contract', lang)}</Label>
                <Select value={form.subcontractorContractId || ''} onValueChange={v => { const c = contracts.find(x => x.id === v); set('subcontractorContractId', v); if (c?.projectId) { set('projectId', c.projectId); set('projectName', c.projectName || ''); } }}>
                  <SelectTrigger><SelectValue placeholder={t('اختياري', 'Optional', lang)} /></SelectTrigger>
                  <SelectContent>{contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.contractNo} — {c.title || ''}</SelectItem>)}</SelectContent>
                </Select>
                {form.projectName && <p className="text-[11px] text-muted-foreground">{t('المشروع:', 'Project:', lang)} {form.projectName}</p>}
              </div>
            )}
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الاستحقاق', 'Due Date', lang)}</Label><Input type="date" value={form.dueDate || ''} onChange={e => set('dueDate', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ الأساسي', 'Base Amount', lang)}</Label><Input type="number" value={form.baseAmount ?? 0} onChange={e => set('baseAmount', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ المحتجز', 'Retention', lang)}</Label><Input type="number" value={form.retentionAmount ?? 0} onChange={e => set('retentionAmount', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t('المدفوع', 'Paid Amount', lang)}</Label><Input readOnly value={`${formatCurrency(form.paidAmount || 0, lang)} — ${t('يُسجل من سندات السداد فقط', 'Recorded from payment vouchers only', lang)}`} className="bg-muted text-muted-foreground" /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
            <div className="md:col-span-2 rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('الصافي بعد المحتجز', 'Net after retention', lang)}</span><span className="tabular-nums">{formatCurrency(net, lang)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('الضريبة 15%', 'VAT 15%', lang)}</span><span className="tabular-nums">{formatCurrency(vat, lang)}</span></div>
              <div className="flex justify-between font-bold pt-1 border-t"><span>{t('المستحق للدفع', 'Payable Total', lang)}</span><span className="tabular-nums">{formatCurrency(total, lang)}</span></div>
            </div>
            <InvoiceAttachmentField
              className="md:col-span-2"
              label={t('مرفق فاتورة/مستخلص المقاول', 'Subcontractor invoice attachment', lang)}
              url={form.invoiceAttachmentUrl}
              name={form.invoiceAttachmentName}
              onChange={(file) => { set('invoiceAttachmentUrl', file.url); set('invoiceAttachmentName', file.name); set('invoiceAttachmentType', file.type); }}
            />
            <div className="space-y-1.5 md:col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          </>
        );
      }}
    />
  );
}