import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, FolderOpen, ArrowLeft, ArrowRight } from 'lucide-react';
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
import { t, formatDate, PROJECT_STATUS, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { validate } from '@/lib/validationEngine';
import { canTransition } from '@/lib/workflowEngine';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

// الكيان Project يُستخدم كـ "طلب/فرع" في سياق المطعم. الحقول محصورة على: كود، اسم، زبون، تواريخ، حالة، وصف.
// أُزيلت حقول البناء: location (موقع الإنشاء)، contractValue (قيمة العقد)، projectType (نوع مشروع البناء).
const emptyForm = { code: '', name: '', nameAr: '', clientId: '', clientName: '', startDate: '', endDate: '', status: 'PLANNING', description: '' };

export default function Projects() {
  const { lang, setProjectContext, setClientContext, activeProjectId, setActiveItem } = useStore();
  const perm = usePermissions('projects');
  const OpenArrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const openWorkspace = (item) => {
    setProjectContext(item.id, item.name);
    if (item.clientId) setClientContext(item.clientId, item.clientName);
    setActiveItem('project-workspace');
  };
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([base44.entities.Project.list('-created_date', 200), base44.entities.Client.list()]);
      setItems(p); setClients(c);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load data', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm, code: nextCodeFromList(items, 'PRJ') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    const { valid, errors } = validate('PROJECT', form);
    if (!valid) return toast.error(errors[0]);
    if (editing && !canTransition('PROJECT', editing.status, form.status))
      return toast.error(t(`لا يمكن الانتقال من الحالة الحالية إلى المحددة`, 'This status change is not allowed by the workflow', lang));
    setSaving(true);
    try {
      const cl = clients.find(c => c.id === form.clientId);
      const data = { ...form, code: form.code || nextCodeFromList(items, 'PRJ'), clientName: cl?.name || form.clientName };
      if (editing) { await base44.entities.Project.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Project.create(data); toast.success(t('تم إنشاء الطلب', 'Order created', lang)); }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      // فحوصات الكيانات المرتبطة بالطلب (مطعمية فقط) — أُزيلت فحوصات البناء:
      // Contract, BOQItem, ProgressBilling, ChangeOrder, ProjectDocument, ContractItem,
      // WorkOrder, DailyReport (بقايا نظام المقاولات).
      const checks = await Promise.all([
        base44.entities.SalesInvoice.filter({ projectId: deleteId }),
        base44.entities.PurchaseOrder.filter({ projectId: deleteId }),
        base44.entities.Expense.filter({ projectId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف طلب عليه مستندات أو حركات مرتبطة', 'Cannot delete an order with linked documents or transactions', lang));
        return;
      }
      await base44.entities.Project.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'اسم الطلب', en: 'Order Name' }, value: (r) => r.name },
    { header: { ar: 'الزبون', en: 'Customer' }, value: (r) => r.clientName },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => (PROJECT_STATUS[r.status] ? (lang === 'ar' ? PROJECT_STATUS[r.status].ar : PROJECT_STATUS[r.status].en) : r.status) },
    { header: { ar: 'تاريخ البدء', en: 'Start Date' }, value: (r) => r.startDate },
  ];

  return (
    <ModuleLayout
      title={t('الطلبات', 'Orders', lang)}
      subtitle={t('إدارة طلبات المطعم والفروع', 'Manage restaurant orders and branches', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الطلبات', en: 'Orders' }} />
          {perm.canCreate && (
            <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="size-4" /> {t('طلب جديد', 'New Order', lang)}
            </Button>
          )}
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
            <SelectItem value="ALL">{t('كل الحالات', 'All Status', lang)}</SelectItem>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <FolderOpen className="size-4 shrink-0" />
        <span>{t('كل طلب هو مركز عمل متكامل — اضغط "فتح" لعرض الإيصالات والمصروفات والمستندات الخاصة به.', 'Each order is a full workspace — click "Open" to view its receipts, expenses and documents.', lang)}</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الكود', 'Code', lang)}</TableHead>
                <TableHead>{t('اسم الطلب', 'Order Name', lang)}</TableHead>
                <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('تاريخ البدء', 'Start Date', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد طلبات', 'No orders found', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const st = PROJECT_STATUS[item.status] || PROJECT_STATUS.PLANNING;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{item.code}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => openWorkspace(item)}
                          className={`font-medium text-start hover:text-emerald-700 hover:underline transition-colors ${activeProjectId === item.id ? 'text-emerald-700' : ''}`}
                          title={lang === 'ar' ? 'افتح مركز عمل الطلب' : 'Open order workspace'}
                        >
                          {activeProjectId === item.id && <span className="inline-block size-1.5 rounded-full bg-emerald-500 me-1.5 align-middle" />}
                          {item.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.clientName || '—'}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(item.startDate, lang)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            onClick={() => openWorkspace(item)}
                            className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700"
                            title={lang === 'ar' ? 'افتح مركز عمل الطلب' : 'Open order workspace'}
                          >
                            <FolderOpen className="size-3.5" />
                            {t('فتح', 'Open', lang)}
                            <OpenArrow className="size-3.5" />
                          </Button>
                          {perm.canEdit && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                          {perm.canDelete && <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} {t('طلب', 'orders', lang)}</span>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('تعديل الطلب', 'Edit Order', lang) : t('طلب جديد', 'New Order', lang)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('كود الطلب', 'Order Code', lang)} *</Label><Input value={form.code} readOnly className="bg-muted" placeholder="PRJ-0001" /></div>
            <div className="space-y-1.5"><Label>{t('اسم الطلب', 'Order Name', lang)} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('الاسم بالعربية', 'Name in Arabic', lang)}</Label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} dir="rtl" /></div>
            <div className="space-y-1.5">
              <Label>{t('الزبون', 'Customer', lang)}</Label>
              <Select value={form.clientId} onValueChange={v => { const cl = clients.find(c => c.id === v); setForm(f => ({ ...f, clientId: v, clientName: cl?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر زبون', 'Select customer', lang)} /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('تاريخ البدء', 'Start Date', lang)}</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الانتهاء', 'End Date', lang)}</Label><Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PROJECT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الطلب', 'Delete Order', lang)}
        description={t('سيتم حذف الطلب نهائياً. هل أنت متأكد؟', 'This order will be permanently deleted. Are you sure?', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}