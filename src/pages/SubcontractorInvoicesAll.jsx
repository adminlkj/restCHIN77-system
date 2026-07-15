import React, { useState, useEffect } from 'react';
import { ReceiptText, RefreshCw, Search, Paperclip } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, STATUS_TONE } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import FilePreviewDialog from '@/components/shared/FilePreviewDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: STATUS_TONE.NEUTRAL },
  SUBMITTED: { ar: 'مقدّمة', en: 'Submitted', color: STATUS_TONE.INFO },
  APPROVED: { ar: 'معتمدة', en: 'Approved', color: STATUS_TONE.INFO },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partial', color: STATUS_TONE.PENDING },
  PAID: { ar: 'مدفوعة', en: 'Paid', color: STATUS_TONE.SUCCESS },
  REJECTED: { ar: 'مرفوضة', en: 'Rejected', color: STATUS_TONE.DANGER },
};

// عرض موحّد لكل مستخلصات مقاولي الباطن عبر النظام (للقراءة والمتابعة).
export default function SubcontractorInvoicesAll() {
  const { lang, setSubcontractorContext, setActiveItem } = useStore();
  const [rows, setRows] = useState([]);
  const [subs, setSubs] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, subList] = await Promise.all([
        base44.entities.SubcontractorInvoice.list('-date', 500),
        base44.entities.Subcontractor.list('-created_date', 500),
      ]);
      setRows(inv);
      setSubs(Object.fromEntries(subList.map(s => [s.id, s])));
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل كشوف الحسابات', 'Failed to load receipts', lang));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    const name = subs[r.subcontractorId]?.name || '';
    return !search || r.invoiceNo?.toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase());
  });

  const openSub = (id) => { const s = subs[id]; if (s) { setSubcontractorContext(s.id, s.name); setActiveItem('subcontractor-workspace'); } };

  const exportColumns = [
    { header: { ar: 'الرقم', en: 'No' }, value: (r) => r.invoiceNo },
    { header: { ar: 'مورّد الخدمات', en: 'Service Provider' }, value: (r) => subs[r.subcontractorId]?.name || '' },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الإجمالي', en: 'Total' }, value: (r) => r.totalAmount || 0 },
    { header: { ar: 'المدفوع', en: 'Paid' }, value: (r) => r.paidAmount || 0 },
    { header: { ar: 'المرفق', en: 'Attachment' }, value: (r) => r.invoiceAttachmentName || '' },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('كشوف حساب وإيصالات مورّدي الخدمات', 'Service Provider Receipts', lang)}
      subtitle={t('كل كشوف الحسابات المقدّمة من مورّدي الخدمات', 'All receipts submitted by service providers', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'كشوف حساب مورّدي الخدمات', en: 'Service Provider Receipts' }} />
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالرقم أو مورّد الخدمات...', 'Search by number or service provider...', lang)} className="ps-9" />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرقم', 'No', lang)}</TableHead>
                <TableHead>{t('مورّد الخدمات', 'Service Provider', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="text-end">{t('المدفوع', 'Paid', lang)}</TableHead>
                <TableHead>{t('المرفق', 'Attachment', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground"><ReceiptText className="size-10 mx-auto mb-2 text-muted-foreground/40" />{t('لا توجد كشوف حسابات', 'No receipts', lang)}</TableCell></TableRow>
              ) : filtered.map(r => {
                const s = STATUS[r.status] || STATUS.DRAFT;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openSub(r.subcontractorId)}>
                    <TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell>
                    <TableCell className="font-medium">{subs[r.subcontractorId]?.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                    <TableCell className="text-end">{formatCurrency(r.totalAmount, lang)}</TableCell>
                    <TableCell className="text-end text-emerald-600">{formatCurrency(r.paidAmount, lang)}</TableCell>
                    <TableCell>
                      {r.invoiceAttachmentUrl ? (
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={(e) => { e.stopPropagation(); setPreviewFile({ url: r.invoiceAttachmentUrl, name: r.invoiceAttachmentName || r.invoiceNo }); }}>
                          <Paperclip className="size-3.5" />{t('عرض', 'View', lang)}
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        url={previewFile?.url}
        name={previewFile?.name}
      />
    </ModuleLayout>
  );
}