import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, Flag } from 'lucide-react';
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
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import { calcVAT, OperationEngine } from '@/lib/businessEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const STATUSES = {
  DRAFT:     { ar: 'مسودة', en: 'Draft', color: 'bg-slate-100 text-slate-700' },
  ACTIVE:    { ar: 'نشط', en: 'Active', color: 'bg-cyan-100 text-cyan-700' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-blue-100 text-blue-700' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700' },
};
const RATE_TYPES = {
  DAILY:   { ar: 'يومي', en: 'Daily' },
  WEEKLY:  { ar: 'أسبوعي', en: 'Weekly' },
  MONTHLY: { ar: 'شهري', en: 'Monthly' },
  HOURLY:  { ar: 'بالساعة', en: 'Hourly' },
};
const empty = {
  contractNo: '', equipmentId: '', equipmentName: '', clientId: '', clientName: '',
  startDate: '', endDate: '', rateType: 'DAILY', rate: '', deliveryFees: '',
  paymentTermDays: 30, status: 'DRAFT', notes: '',
};

export default function RentalContracts() {
  const { lang, activeClientId, activeClientName } = useStore();
  const [items, setItems]         = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteId, setDeleteId]         = useState(null);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(empty);
  const [saving, setSaving]             = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, eq, cl] = await Promise.all([
        base44.entities.RentalContract.list('-created_date', 200),
        base44.entities.Equipment.list(),
        base44.entities.Client.list(),
      ]);
      setItems(r); setEquipment(eq); setClients(cl);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.contractNo?.toLowerCase().includes(search.toLowerCase()) || i.equipmentName?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const buildDefaultForm = () => ({
    ...empty,
    contractNo: nextCodeFromList(items, 'RNT-CON', 'contractNo'),
    clientId:   activeClientId   || '',
    clientName: activeClientName || '',
  });

  const openNew  = () => { setEditing(null); setForm(buildDefaultForm()); setDialogOpen(true); };
  const openEdit = (item) => { if (item.status !== 'DRAFT') return; setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const setStatus = async (item, status) => {
    try {
      await OperationEngine.updateRentalContract(item.id, { ...item, status }, equipment, clients, item.status);
      toast.success(t('تم تحديث حالة العقد', 'Contract status updated', lang));
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل تحديث الحالة', 'Status update failed', lang));
    }
  };

  // SSOT: الحساب من Business Engine
  const rate     = parseFloat(form.rate) || 0;
  const delivery = parseFloat(form.deliveryFees) || 0;
  const base     = rate + delivery;
  const { vat: vatAmt, total: totalAmt } = calcVAT(base);

  const save = async () => {
    if (!form.contractNo || !form.equipmentId || !form.clientId)
      return toast.error(t('الحقول المطلوبة ناقصة', 'Required fields missing', lang));
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      return toast.error(t('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 'End date must be after start date', lang));
    setSaving(true);
    try {
      const selectedEq = equipment.find(e => e.id === form.equipmentId);
      if (!editing && selectedEq?.status && selectedEq.status !== 'AVAILABLE') {
        throw new Error(t('لا يمكن إنشاء عقد لمعدة غير متاحة', 'Cannot create a contract for unavailable equipment', lang));
      }
      if (editing) {
        await OperationEngine.updateRentalContract(editing.id, { ...form, status: 'DRAFT' }, equipment, clients, editing.status);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await OperationEngine.createRentalContract({ ...form, status: 'DRAFT' }, equipment, clients);
        toast.success(t('تم حفظ العقد كمسودة', 'Contract saved as draft', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const contract = items.find(i => i.id === deleteId);
      if (contract?.status !== 'DRAFT') throw new Error(t('لا يمكن حذف عقد غير مسودة', 'Only draft contracts can be deleted', lang));
      const [invoices, deliveries] = await Promise.all([
        base44.entities.RentalInvoice.filter({ rentalContractId: deleteId }).catch(() => []),
        base44.entities.DeliveryOrder.filter({ equipmentId: contract.equipmentId }).catch(() => []),
      ]);
      if (invoices.length || deliveries.length) throw new Error(t('لا يمكن حذف عقد له فواتير أو أوامر تسليم مرتبطة', 'Cannot delete a contract with linked invoices or delivery orders', lang));
      await base44.entities.RentalContract.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch (e) { toast.error(e?.message || t('فشل الحذف', 'Delete failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'رقم العقد', en: 'Contract No' }, value: (r) => r.contractNo },
    { header: { ar: 'المعدة', en: 'Equipment' }, value: (r) => r.equipmentName },
    { header: { ar: 'العميل', en: 'Client' }, value: (r) => r.clientName },
    { header: { ar: 'نوع السعر', en: 'Rate Type' }, value: (r) => { const rt = RATE_TYPES[r.rateType]; return rt ? (lang === 'ar' ? rt.ar : rt.en) : r.rateType; } },
    { header: { ar: 'السعر', en: 'Rate' }, value: (r) => r.rate || 0 },
    { header: { ar: 'الإجمالي+ضريبة', en: 'Total+VAT' }, value: (r) => r.totalAmount || 0 },
    { header: { ar: 'تاريخ البدء', en: 'Start' }, value: (r) => r.startDate },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('عقود التأجير', 'Rental Contracts', lang)}
      subtitle={t('عقود تأجير المعدات للعملاء', 'Equipment rental agreements', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'عقود التأجير', en: 'Rental Contracts' }} />
          <Button onClick={openNew} className="gap-2 bg-cyan-600 hover:bg-cyan-700"><Plus className="size-4" />{t('عقد جديد', 'New Contract', lang)}</Button>
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
            {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
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
                <TableHead>{t('المعدة', 'Equipment', lang)}</TableHead>
                <TableHead>{t('العميل', 'Client', lang)}</TableHead>
                <TableHead>{t('نوع السعر', 'Rate Type', lang)}</TableHead>
                <TableHead>{t('السعر', 'Rate', lang)}</TableHead>
                <TableHead>{t('الإجمالي+ضريبة', 'Total+VAT', lang)}</TableHead>
                <TableHead>{t('تاريخ البدء', 'Start', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد عقود', 'No contracts', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUSES[item.status] || STATUSES.DRAFT;
                    const rt = RATE_TYPES[item.rateType] || { ar: item.rateType, en: item.rateType };
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.contractNo}</TableCell>
                        <TableCell className="font-medium">{item.equipmentName || '—'}</TableCell>
                        <TableCell className="text-sm">{item.clientName || '—'}</TableCell>
                        <TableCell className="text-xs"><span className="bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full px-2 py-0.5">{lang === 'ar' ? rt.ar : rt.en}</span></TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.rate, lang)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.totalAmount, lang)}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.startDate, lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-emerald-700" title={t('تفعيل', 'Activate', lang)} onClick={() => setStatus(item, 'ACTIVE')}><CheckCircle2 className="size-3.5" /></Button>}
                            {item.status === 'ACTIVE' && <Button variant="ghost" size="icon" className="size-8 text-blue-700" title={t('إكمال', 'Complete', lang)} onClick={() => setStatus(item, 'COMPLETED')}><Flag className="size-3.5" /></Button>}
                            {(item.status === 'DRAFT' || item.status === 'ACTIVE') && <Button variant="ghost" size="icon" className="size-8 text-rose-700" title={t('إلغاء', 'Cancel', lang)} onClick={() => setStatus(item, 'CANCELLED')}><XCircle className="size-3.5" /></Button>}
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل عقد التأجير', 'Edit Contract', lang) : t('عقد تأجير جديد', 'New Rental Contract', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم العقد', 'Contract No.', lang)} *</Label><Input value={form.contractNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('المعدة', 'Equipment', lang)} *</Label>
              <Select value={form.equipmentId} onValueChange={v => { const eq = equipment.find(e => e.id === v); setForm(f => ({ ...f, equipmentId: v, equipmentName: eq?.name || '', rate: eq?.dailyRate || f.rate })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر معدة', 'Select equipment', lang)} /></SelectTrigger>
                <SelectContent>{equipment.filter(e => e.status === 'AVAILABLE' || e.id === form.equipmentId).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('العميل', 'Client', lang)} *</Label>
              <Select value={form.clientId} onValueChange={v => { const c = clients.find(c => c.id === v); setForm(f => ({ ...f, clientId: v, clientName: c?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر عميل', 'Select client', lang)} /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('نوع السعر', 'Rate Type', lang)}</Label>
              <Select value={form.rateType} onValueChange={v => setForm(f => ({ ...f, rateType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(RATE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('السعر', 'Rate', lang)}</Label><Input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('رسوم التوصيل', 'Delivery Fees', lang)}</Label><Input type="number" value={form.deliveryFees} onChange={e => setForm(f => ({ ...f, deliveryFees: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('مبلغ الضريبة 15%', 'VAT 15%', lang)}</Label><Input readOnly value={vatAmt.toFixed(2)} className="bg-muted" /></div>
            <div className="space-y-1.5"><Label>{t('الإجمالي شامل الضريبة', 'Total incl. VAT', lang)}</Label><Input readOnly value={totalAmt.toFixed(2)} className="bg-muted font-bold" /></div>
            <div className="space-y-1.5">
              <Label>{t('شروط الدفع (يوم)', 'Payment Terms (days)', lang)}</Label>
              <Select value={String(form.paymentTermDays || 30)} onValueChange={v => setForm(f => ({ ...f, paymentTermDays: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[30, 45, 60, 90].map(d => <SelectItem key={d} value={String(d)}>{t(`${d} يوم`, `${d} days`, lang)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('تاريخ البدء', 'Start Date', lang)}</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الانتهاء', 'End Date', lang)}</Label><Input type="date" value={form.endDate} min={form.startDate || undefined} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُفعّل لاحقاً)', 'Draft (activate later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : editing ? t('حفظ', 'Save', lang) : t('حفظ كمسودة', 'Save Draft', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف عقد التأجير', 'Delete Rental Contract', lang)}
        description={t('سيتم حذف العقد المسودة فقط إذا لم يكن له فواتير أو أوامر مرتبطة.', 'Only draft contracts without linked invoices or orders can be deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}