import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, Truck, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import PartyStatementSection from '@/components/partners/PartyStatementSection';
import SmartEntityCard from '@/components/shared/SmartEntityCard';
import { toast } from 'sonner';

const empty = { code: '', name: '', nameAr: '', phone: '', email: '', address: '', taxNumber: '', contactPerson: '', notes: '' };
const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

export default function Suppliers() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('records'); // 'records' | 'statements'

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.Supplier.list('-created_date', 200)); }
    catch (err) { toast.error(errorMessage(err, t('فشل تحميل البيانات', 'Failed to load', lang))); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'SUP') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name) return toast.error(t('اسم المورد مطلوب', 'Supplier name required', lang));
    setSaving(true);
    try {
      const data = { ...form, code: form.code || nextCodeFromList(items, 'SUP') };
      if (editing) { await base44.entities.Supplier.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Supplier.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch (err) { toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang))); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.PurchaseOrder.filter({ supplierId: deleteId }),
        base44.entities.SupplierInvoice.filter({ supplierId: deleteId }),
        base44.entities.SupplierPayment.filter({ supplierId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف مورد له أوامر شراء أو فواتير أو مدفوعات', 'Cannot delete a supplier with orders, invoices or payments', lang));
        return;
      }
      await base44.entities.Supplier.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch (err) { toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang))); }
  };

  const fields = [
    ['code', t('الكود', 'Code', lang)], ['name', t('الاسم', 'Name', lang)], ['nameAr', t('الاسم بالعربية', 'Name (Arabic)', lang)],
    ['phone', t('الهاتف', 'Phone', lang)], ['email', t('البريد', 'Email', lang)],
    ['taxNumber', t('الرقم الضريبي', 'Tax No.', lang)], ['contactPerson', t('شخص التواصل', 'Contact', lang)],
  ];

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الاسم', en: 'Name' }, value: (r) => r.name },
    { header: { ar: 'الهاتف', en: 'Phone' }, value: (r) => r.phone },
    { header: { ar: 'البريد', en: 'Email' }, value: (r) => r.email },
    { header: { ar: 'الرقم الضريبي', en: 'Tax No.' }, value: (r) => r.taxNumber },
    { header: { ar: 'شخص التواصل', en: 'Contact' }, value: (r) => r.contactPerson },
  ];

  return (
    <ModuleLayout
      title={t('الموردون', 'Suppliers', lang)}
      subtitle={t('إدارة بيانات الموردين والكشوفات', 'Manage supplier records & statements', lang)}
      actions={view === 'records' ? (
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الموردون', en: 'Suppliers' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="size-4" />{t('مورد جديد', 'New Supplier', lang)}</Button>
        </div>
      ) : null}
    >
      <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
        <button onClick={() => setView('records')} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'records' ? 'bg-background shadow text-amber-700' : 'text-muted-foreground hover:text-foreground'}`}>
          <Truck className="size-4" />{t('بيانات الموردين', 'Supplier Records', lang)}
        </button>
        <button onClick={() => setView('statements')} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'statements' ? 'bg-background shadow text-amber-700' : 'text-muted-foreground hover:text-foreground'}`}>
          <FileText className="size-4" />{t('الكشوفات والسداد', 'Statements & Payments', lang)}
        </button>
      </div>

      {view === 'statements' ? (
        <PartyStatementSection partyType="SUPPLIER" parties={items} />
      ) : (
      <>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-44 bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-14 text-center text-muted-foreground">{t('لا يوجد موردون', 'No suppliers found', lang)}</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <SmartEntityCard
              key={item.id}
              accent="amber"
              title={item.name}
              subtitle={item.nameAr || item.contactPerson || item.address}
              code={item.code}
              initials={(item.name || 'SU').slice(0, 2).toUpperCase()}
              badges={[{ label: t('مورد', 'Supplier', lang), className: 'bg-amber-100 text-amber-700' }]}
              meta={[
                { label: t('الهاتف', 'Phone', lang), value: item.phone, dir: 'ltr' },
                { label: t('البريد', 'Email', lang), value: item.email, dir: 'ltr' },
                { label: t('الرقم الضريبي', 'Tax No.', lang), value: item.taxNumber },
                { label: t('شخص التواصل', 'Contact', lang), value: item.contactPerson },
              ]}
              actions={<><Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button></>}
            />
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{filtered.length} {t('مورد', 'suppliers', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? t('تعديل المورد', 'Edit Supplier', lang) : t('مورد جديد', 'New Supplier', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {fields.map(([field, label]) => <div key={field} className="space-y-1.5"><Label>{label}</Label><Input value={form[field] || ''} readOnly={field === 'code'} className={field === 'code' ? 'bg-muted' : ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} /></div>)}
            <div className="col-span-2 space-y-1.5"><Label>{t('العنوان', 'Address', lang)}</Label><Textarea value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف المورد', 'Delete Supplier', lang)}
        description={t('سيتم حذف المورد نهائياً.', 'This supplier will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
      </>
      )}
    </ModuleLayout>
  );
}