import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useBranches } from '@/hooks/useBranches';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const STATUS = {
  DRAFT:     { ar: 'مسودة',   en: 'Draft',     color: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { ar: 'مقدّم',   en: 'Submitted', color: 'bg-blue-100 text-blue-700' },
  APPROVED:  { ar: 'معتمد',   en: 'Approved',  color: 'bg-indigo-100 text-indigo-700' },
  CONVERTED: { ar: 'محوّل لأمر شراء', en: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { ar: 'مرفوض',   en: 'Rejected',  color: 'bg-rose-100 text-rose-700' },
};

const empty = {
  requestNo: '', date: '', projectId: '', projectName: '', requestedBy: '',
  description: '', estimatedAmount: '', status: 'DRAFT', notes: '',
};

export default function PurchaseRequests() {
  const { lang, activeProjectId, activeProjectName } = useStore();
  const [items, setItems] = useState([]);
  // الفروع من cache مشترك بدلاً من جلبها مستقلة عند كل mount.
  const { branches: projects } = useBranches();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // الفروع من cache مشترك — لا تُجلب هنا.
      const r = await base44.entities.PurchaseRequest.list('-created_date', 200);
      setItems(r);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.requestNo?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      ...empty,
      requestNo: nextCodeFromList(items, 'PR', 'requestNo'),
      date: new Date().toISOString().slice(0, 10),
      projectId: activeProjectId || '',
      projectName: activeProjectName || '',
    });
    setDialogOpen(true);
  };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };
  const setStatus = async (item, newStatus) => {
    try {
      await base44.entities.PurchaseRequest.update(item.id, { status: newStatus });
      toast.success(t('تم تحديث الحالة', 'Status updated', lang)); load();
    } catch { toast.error(t('فشل التحديث', 'Update failed', lang)); }
  };

  const save = async () => {
    if (!form.requestNo?.trim()) return toast.error(t('رقم الطلب مطلوب', 'Request No. required', lang));
    setSaving(true);
    try {
      const data = { ...form, requestNo: form.requestNo || nextCodeFromList(items, 'PR', 'requestNo'), estimatedAmount: Number(form.estimatedAmount) || 0 };
      if (editing) { await base44.entities.PurchaseRequest.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.PurchaseRequest.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.PurchaseRequest.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'رقم الطلب', en: 'Request No' }, value: (r) => r.requestNo },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الطلب', en: 'Order' }, value: (r) => r.projectName },
    { header: { ar: 'الوصف', en: 'Description' }, value: (r) => r.description },
    { header: { ar: 'القيمة التقديرية', en: 'Estimated' }, value: (r) => r.estimatedAmount || 0 },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('طلبات الشراء', 'Purchase Requests', lang)}
      subtitle={t('بداية سلسلة المشتريات — طلب مواد قبل إصدار أمر الشراء', 'Start of the procurement chain — request materials before a purchase order', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'طلبات الشراء', en: 'Purchase Requests' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="size-4" />{t('طلب جديد', 'New Request', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الطلب', 'Request No.', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('القيمة التقديرية', 'Estimated', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد طلبات شراء', 'No purchase requests', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUS[item.status] || STATUS.DRAFT;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.requestNo}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="text-sm">{item.projectName || '—'}</TableCell>
                        <TableCell className="text-sm max-w-[220px] truncate">{item.description || '—'}</TableCell>
                        <TableCell>{formatCurrency(item.estimatedAmount, lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-emerald-700" title={t('اعتماد', 'Approve', lang)} onClick={() => setStatus(item, 'APPROVED')}><CheckCircle2 className="size-3.5" /></Button>}
                            {item.status !== 'APPROVED' && item.status !== 'REJECTED' && <Button variant="ghost" size="icon" className="size-8 text-rose-700" title={t('رفض', 'Reject', lang)} onClick={() => setStatus(item, 'REJECTED')}><XCircle className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل الطلب', 'Edit Request', lang) : t('طلب شراء جديد', 'New Purchase Request', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم الطلب', 'Request No.', lang)} *</Label><Input value={form.requestNo} readOnly className="bg-muted" /></div>
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الطلب', 'Order', lang)}</Label>
              <Select value={form.projectId || 'none'} onValueChange={v => { const p = projects.find(p => p.id === v); setForm(f => ({ ...f, projectId: v === 'none' ? '' : v, projectName: p?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('بدون', 'None', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('بدون', 'None', lang)}</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('طالب الشراء', 'Requested By', lang)}</Label><Input value={form.requestedBy} onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('القيمة التقديرية', 'Estimated Amount', lang)}</Label><Input type="number" value={form.estimatedAmount} onChange={e => setForm(f => ({ ...f, estimatedAmount: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف طلب الشراء', 'Delete Request', lang)}
        description={t('سيتم حذف الطلب نهائياً.', 'This request will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}