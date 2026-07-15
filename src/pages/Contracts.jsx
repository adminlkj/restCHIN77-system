import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, Printer } from 'lucide-react';
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
import { t, formatCurrency, formatDate, CONTRACT_STATUS, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import ContractDocument from '@/components/shared/ContractDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { canTransition } from '@/lib/workflowEngine';
import { toast } from 'sonner';

const empty = { contractNo: '', projectId: '', projectName: '', clientId: '', clientName: '', totalValue: '', startDate: '', endDate: '', status: 'DRAFT', description: '', notes: '' };

export default function Contracts() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, p, cl] = await Promise.all([base44.entities.Contract.list('-created_date', 200), base44.entities.Project.list(), base44.entities.Client.list()]);
      setItems(c); setProjects(p); setClients(cl);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.contractNo?.toLowerCase().includes(search.toLowerCase()) || i.projectName?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, contractNo: nextCodeFromList(items, 'CON', 'contractNo') });
    setDialogOpen(true);
  };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.contractNo || !form.projectId) return toast.error(t('رقم العقد والطلب مطلوبان', 'Contract No. and Order are required', lang));
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      return toast.error(t('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 'End date must be after start date', lang));
    setSaving(true);
    try {
      const proj = projects.find(p => p.id === form.projectId);
      const cl = clients.find(c => c.id === form.clientId);
      const data = { ...form, totalValue: parseFloat(form.totalValue) || 0, projectName: proj?.name || form.projectName, clientName: cl?.name || form.clientName };
      if (editing) { await base44.entities.Contract.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Contract.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.ProgressBilling.filter({ contractId: deleteId }),
        base44.entities.SalesInvoice.filter({ contractId: deleteId }),
        base44.entities.ChangeOrder.filter({ contractId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف عقد عليه مستخلصات أو إيصالات أو أوامر تغيير', 'Cannot delete a contract with linked billings, receipts or change orders', lang));
        return;
      }
      await base44.entities.Contract.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const setStatus = async (item, newStatus) => {
    if (!canTransition('CONTRACT', item.status, newStatus))
      return toast.error(t('لا يمكن تغيير الحالة', 'This status change is not allowed', lang));
    try {
      await base44.entities.Contract.update(item.id, { status: newStatus });
      toast.success(t('تم تحديث الحالة', 'Status updated', lang)); load();
    } catch { toast.error(t('فشل التحديث', 'Update failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'رقم العقد', en: 'Contract No' }, value: (r) => r.contractNo },
    { header: { ar: 'المشروع', en: 'Project' }, value: (r) => r.projectName },
    { header: { ar: 'الزبون', en: 'Customer' }, value: (r) => r.clientName },
    { header: { ar: 'القيمة', en: 'Value' }, value: (r) => r.totalValue || 0 },
    { header: { ar: 'تاريخ البدء', en: 'Start' }, value: (r) => r.startDate },
    { header: { ar: 'تاريخ الانتهاء', en: 'End' }, value: (r) => r.endDate },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = CONTRACT_STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('العقود', 'Contracts', lang)}
      subtitle={t('عقود الطلبات مع الزبائن', 'Order contracts with customers', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'العقود', en: 'Contracts' }} />
          <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('عقد جديد', 'New Contract', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
            {Object.entries(CONTRACT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم العقد', 'Contract No.', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead>{t('تاريخ البدء', 'Start', lang)}</TableHead>
                <TableHead>{t('تاريخ الانتهاء', 'End', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد عقود', 'No contracts', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const st = CONTRACT_STATUS[item.status] || CONTRACT_STATUS.DRAFT;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{item.contractNo}</TableCell>
                      <TableCell className="font-medium">{item.projectName || '—'}</TableCell>
                      <TableCell className="text-sm">{item.clientName || '—'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(item.totalValue, lang)}</TableCell>
                      <TableCell className="text-xs">{formatDate(item.startDate, lang)}</TableCell>
                      <TableCell className="text-xs">{formatDate(item.endDate, lang)}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-emerald-700" title={t('تفعيل', 'Activate', lang)} onClick={() => setStatus(item, 'ACTIVE')}><CheckCircle2 className="size-3.5" /></Button>}
                          {(item.status === 'DRAFT' || item.status === 'ACTIVE') && <Button variant="ghost" size="icon" className="size-8 text-rose-700" title={t('إلغاء', 'Cancel', lang)} onClick={() => setStatus(item, 'CANCELLED')}><XCircle className="size-3.5" /></Button>}
                          {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                          {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>}
                          <Button variant="ghost" size="icon" className="size-8" title={t('معاينة وطباعة', 'Preview & Print', lang)} onClick={() => setPreview(item)}><Printer className="size-3.5" /></Button>
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل العقد', 'Edit Contract', lang) : t('عقد جديد', 'New Contract', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم العقد', 'Contract No.', lang)} *</Label><Input value={form.contractNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('الطلب', 'Order', lang)} *</Label>
              <Select value={form.projectId} onValueChange={v => { const p = projects.find(p => p.id === v); setForm(f => ({ ...f, projectId: v, projectName: p?.name || '', clientId: p?.clientId || f.clientId, clientName: p?.clientName || f.clientName })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر طلب', 'Select order', lang)} /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الزبون', 'Customer', lang)}</Label>
              <Select value={form.clientId} onValueChange={v => { const c = clients.find(c => c.id === v); setForm(f => ({ ...f, clientId: v, clientName: c?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر زبون', 'Select customer', lang)} /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('القيمة الإجمالية', 'Total Value', lang)}</Label><Input type="number" value={form.totalValue} onChange={e => setForm(f => ({ ...f, totalValue: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ البدء', 'Start Date', lang)}</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الانتهاء', 'End Date', lang)}</Label><Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CONTRACT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف العقد', 'Delete Contract', lang)}
        description={t('سيتم حذف العقد نهائياً.', 'This contract will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'عقد طلب', en: 'Order Contract' }}>
        {preview && <ContractDocument contract={preview} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}