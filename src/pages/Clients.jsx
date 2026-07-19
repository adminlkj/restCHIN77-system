import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, Users, FileText, Tag, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, nextCodeFromList, formatCurrency } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import PartyStatementSection from '@/components/partners/PartyStatementSection';
import SmartEntityCard from '@/components/shared/SmartEntityCard';
import { toast } from 'sonner';

const empty = {
  code: '', name: '', nameAr: '', phone: '', email: '', address: '',
  taxNumber: '', contactPerson: '', notes: '',
  // حقول الائتمان والتصنيف (مُضافة لاحقاً لكيان العميل)
  isCash: true, // true = نقدي (بدون ذمة)، false = آجل (له ذمة)
  discountPercentage: 0, // نسبة خصم ثابتة % على الفواتير
  creditLimit: 0, // الحد الائتماني الأقصى (0 = غير محدود) — للعملاء الآجلين فقط
  creditDays: 0, // مدة السماح بالأيام (0 = فوري) — للعملاء الآجلين فقط
  customerCategory: 'REGULAR', // REGULAR | VIP | WHOLESALE | EMPLOYEE | PLATFORM
};
const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

const CATEGORIES = ['REGULAR', 'VIP', 'WHOLESALE', 'EMPLOYEE', 'PLATFORM'];
const categoryLabels = (lang) => ({
  REGULAR: t('عادي', 'Regular', lang),
  VIP: 'VIP',
  WHOLESALE: t('جملة', 'Wholesale', lang),
  EMPLOYEE: t('موظف', 'Employee', lang),
  PLATFORM: t('منصة', 'Platform', lang),
});
const categoryBadgeClass = {
  REGULAR: 'bg-slate-100 text-slate-700',
  VIP: 'bg-amber-100 text-amber-700',
  WHOLESALE: 'bg-violet-100 text-violet-700',
  EMPLOYEE: 'bg-blue-100 text-blue-700',
  PLATFORM: 'bg-fuchsia-100 text-fuchsia-700',
};

export default function Clients() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
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
    try {
      // نحمّل العملاء + القيود المرحّلة + دليل الحسابات لحساب الرصيد من المصدر الموحّد.
      // مصدر الحقيقة المالية = سطور القيود على حساب RECEIVABLES (1121) فقط — لا الفواتير.
      // هذا يضمن تطابق رصيد العميل مع ميزان المراجعة، ويتجاهل فواتير النقدية المدفوعة
      // (التي تُقيد على الصندوق لا الذمم) فلا تظهر رصيداً وهمياً للزبائن النقديين.
      const [clients, jes, accs] = await Promise.all([
        base44.entities.Client.list('-created_date', 200),
        base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
        base44.entities.ChartAccount.list('code', 1000).catch(() => []),
      ]);
      setItems(clients);
      setInvoices(jes || []);
      setPayments(accs || []);
    }
    catch (err) { toast.error(errorMessage(err, t('فشل تحميل البيانات', 'Failed to load', lang))); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // بحث ذكي: بالاسم أو الكود أو رقم الجوال (يطابق آخر الأرقام أيضاً للراحة).
  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = String(i.name || '').toLowerCase();
    const code = String(i.code || '').toLowerCase();
    const phone = String(i.phone || '').toLowerCase();
    // مطابقة آخر أرقام الجوال (مثلاً "99" تطابق "0133300199")
    const phoneTail = phone.replace(/\D/g, '').slice(-q.replace(/\D/g, '').length);
    const qDigits = q.replace(/\D/g, '');
    return name.includes(q) || code.includes(q) || phone.includes(q) || (qDigits.length >= 2 && phoneTail === qDigits);
  });

  // حساب أرصدة العملاء من القيود المرحّلة فقط (المصدر الموحّد للحقيقة المالية).
  // رصيد العميل = مدين − دائن على سطور حساب RECEIVABLES (1121) الموسومة بـ
  // partyType='CLIENT' وpartyId=clientId. هذا يطابق ميزان المراجعة 100% ويستثني
  // فواتير النقدية المدفوعة فوراً (لا تُنشئ ذمة).
  const balanceByClient = useMemo(() => {
    const accountMap = {};
    for (const a of (payments || [])) accountMap[a.code] = a; // payments يحمّل الآن الحسابات
    const map = {};
    for (const je of (invoices || [])) { // invoices يحمّل الآن القيود
      if (!je || !je.isPosted || !Array.isArray(je.lines)) continue;
      for (const l of je.lines) {
        const acc = accountMap[l.accountCode];
        if (!acc || acc.semanticRole !== 'RECEIVABLES') continue;
        if (l.partyType !== 'CLIENT' || !l.partyId) continue;
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        map[l.partyId] = (map[l.partyId] || 0) + (debit - credit);
      }
    }
    return map;
  }, [invoices, payments]);

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'CL') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name) return toast.error(t('اسم العميل مطلوب', 'Client name is required', lang));
    setSaving(true);
    try {
      // نضمن أنواع الأرقام صحيحة، وأن العملاء النقديين لا يحملون حقولاً ائتمانية.
      const isCash = form.isCash !== false;
      const data = {
        ...form,
        code: form.code || nextCodeFromList(items, 'CL'),
        isCash,
        discountPercentage: Number(form.discountPercentage || 0),
        customerCategory: form.customerCategory || 'REGULAR',
        // العملاء النقديون لا ذمة لهم — نضمن صفر للحد والمدة الائتمانية.
        creditLimit: isCash ? 0 : Number(form.creditLimit || 0),
        creditDays: isCash ? 0 : Number(form.creditDays || 0),
      };
      if (editing) { await base44.entities.Client.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Client.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch (err) { toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang))); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      // الكيانات البنائية (Contract, RentalContract) محذوفة — لا فحص لها هنا.
      const checks = await Promise.all([
        base44.entities.SalesInvoice.filter({ clientId: deleteId }),
        base44.entities.ClientPayment.filter({ clientId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف عميل له فواتير أو تحصيلات', 'Cannot delete a client with invoices or payments', lang));
        return;
      }
      await base44.entities.Client.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch (err) { toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang))); }
  };

  const fields = [
    ['code', t('الكود', 'Code', lang)], ['name', t('الاسم', 'Name', lang)], ['nameAr', t('الاسم بالعربية', 'Name (Arabic)', lang)],
    ['phone', t('الهاتف', 'Phone', lang)], ['email', t('البريد الإلكتروني', 'Email', lang)],
    ['taxNumber', t('الرقم الضريبي', 'Tax Number', lang)], ['contactPerson', t('شخص التواصل', 'Contact Person', lang)],
  ];

  const catLabels = categoryLabels(lang);

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الاسم', en: 'Name' }, value: (r) => r.name },
    { header: { ar: 'الهاتف', en: 'Phone' }, value: (r) => r.phone },
    { header: { ar: 'البريد الإلكتروني', en: 'Email' }, value: (r) => r.email },
    { header: { ar: 'الرقم الضريبي', en: 'Tax Number' }, value: (r) => r.taxNumber },
    { header: { ar: 'شخص التواصل', en: 'Contact' }, value: (r) => r.contactPerson },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => (r.isCash === false ? t('آجل', 'Account', lang) : t('نقدي', 'Cash', lang)) },
    { header: { ar: 'التصنيف', en: 'Category' }, value: (r) => catLabels[r.customerCategory] || r.customerCategory || '—' },
    { header: { ar: 'نسبة الخصم %', en: 'Discount %' }, value: (r) => r.discountPercentage ?? 0 },
    { header: { ar: 'الحد الائتماني', en: 'Credit Limit' }, value: (r) => (r.isCash === false ? (r.creditLimit || 0) : 0) },
    { header: { ar: 'مدة الائتمان (أيام)', en: 'Credit Days' }, value: (r) => (r.isCash === false ? (r.creditDays || 0) : 0) },
    { header: { ar: 'الرصيد الحالي', en: 'Current Balance' }, value: (r) => formatCurrency(balanceByClient[r.id] || 0, lang) },
  ];

  // هل النموذج الحالي يخص عميلاً آجلاً (له ذمة)؟
  const formIsAccount = form.isCash === false;
  // رصيد العميل قيد التحرير (للعرض كقراءة فقط داخل النموذج).
  const editingBalance = editing ? (balanceByClient[editing.id] || 0) : 0;
  const editingLimit = Number(form.creditLimit || 0);
  const overLimit = formIsAccount && editing && editingLimit > 0 && editingBalance > editingLimit;

  return (
    <ModuleLayout
      title={t('العملاء', 'Clients', lang)}
      subtitle={t('إدارة بيانات العملاء والكشوفات', 'Manage client records & statements', lang)}
      actions={view === 'records' ? (
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'العملاء', en: 'Clients' }} />
          <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('عميل جديد', 'New Client', lang)}</Button>
        </div>
      ) : null}
    >
      <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
        <button onClick={() => setView('records')} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'records' ? 'bg-background shadow text-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}>
          <Users className="size-4" />{t('بيانات العملاء', 'Client Records', lang)}
        </button>
        <button onClick={() => setView('statements')} className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'statements' ? 'bg-background shadow text-emerald-700' : 'text-muted-foreground hover:text-foreground'}`}>
          <FileText className="size-4" />{t('الكشوفات والتحصيل', 'Statements & Collections', lang)}
        </button>
      </div>

      {view === 'statements' ? (
        <PartyStatementSection partyType="CLIENT" parties={items} />
      ) : (
      <>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالاسم/الكود/الجوال...', 'Search by name/code/phone...', lang)} className="ps-9" />
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-44 bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-14 text-center text-muted-foreground">{t('لا يوجد عملاء', 'No clients found', lang)}</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => {
            const isAccount = item.isCash === false;
            const balance = balanceByClient[item.id] || 0;
            const limit = Number(item.creditLimit || 0);
            const overLimitNow = isAccount && limit > 0 && balance > limit;
            const badges = [
              { label: isAccount ? t('آجل', 'Account', lang) : t('نقدي', 'Cash', lang),
                className: isAccount ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700' },
              { label: catLabels[item.customerCategory] || catLabels.REGULAR,
                className: categoryBadgeClass[item.customerCategory] || categoryBadgeClass.REGULAR },
              ...(overLimitNow ? [{ label: t('تجاوز الحد', 'Over Limit', lang), className: 'bg-red-100 text-red-700' }] : []),
            ];
            const meta = [
              { label: t('الهاتف', 'Phone', lang), value: item.phone, dir: 'ltr' },
              { label: t('البريد', 'Email', lang), value: item.email, dir: 'ltr' },
              { label: t('الرقم الضريبي', 'Tax', lang), value: item.taxNumber },
              { label: t('شخص التواصل', 'Contact', lang), value: item.contactPerson },
              ...(item.discountPercentage ? [{ label: t('الخصم %', 'Disc %', lang), value: `${item.discountPercentage}%` }] : []),
              ...(isAccount ? [
                { label: t('الحد الائتماني', 'Credit Limit', lang),
                  value: limit > 0 ? formatCurrency(limit, lang) : t('غير محدود', 'Unlimited', lang) },
                { label: t('مدة الائتمان', 'Credit Days', lang),
                  value: item.creditDays ? `${item.creditDays} ${t('يوم', 'days', lang)}` : t('فوري', 'Immediate', lang) },
              ] : []),
              ...((balance !== 0 || isAccount) ? [{
                label: t('الرصيد الحالي', 'Balance', lang),
                value: formatCurrency(balance, lang),
              }] : []),
            ];
            return (
              <SmartEntityCard
                key={item.id}
                accent="emerald"
                title={item.name}
                subtitle={item.nameAr || item.contactPerson || item.address}
                code={item.code}
                initials={(item.name || 'CL').slice(0, 2).toUpperCase()}
                badges={badges}
                meta={meta}
                actions={<><Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button></>}
              />
            );
          })}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{filtered.length} {t('عميل', 'clients', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('تعديل العميل', 'Edit Client', lang) : t('عميل جديد', 'New Client', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {fields.map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label>{label}</Label>
                <Input value={form[field] || ''} readOnly={field === 'code'} className={field === 'code' ? 'bg-muted' : ''} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2 space-y-1.5"><Label>{t('العنوان', 'Address', lang)}</Label><Textarea value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>

          {/* قسم التصنيف والإعدادات الائتمانية */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Tag className="size-4 text-emerald-600" />
              {t('التصنيف والإعدادات الائتمانية', 'Classification & Credit', lang)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('نوع العميل', 'Customer Type', lang)}</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={form.isCash !== false} onCheckedChange={(v) => setForm(f => ({ ...f, isCash: v }))} />
                  <span className="text-sm text-muted-foreground">
                    {form.isCash !== false
                      ? t('نقدي (بدون ذمة)', 'Cash (no credit)', lang)
                      : t('آجل (له ذمة)', 'Account (credit)', lang)}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('التصنيف', 'Category', lang)}</Label>
                <Select value={form.customerCategory || 'REGULAR'} onValueChange={(v) => setForm(f => ({ ...f, customerCategory: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{catLabels[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('نسبة الخصم الثابتة %', 'Fixed Discount %', lang)}</Label>
                <Input type="number" min="0" step="0.01" value={form.discountPercentage ?? 0}
                  onChange={e => setForm(f => ({ ...f, discountPercentage: Number(e.target.value) }))} />
              </div>
            </div>

            {/* حقول ائتمانية تظهر فقط للعملاء الآجلين (isCash=false) */}
            {formIsAccount && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('الحد الائتماني (0 = غير محدود)', 'Credit Limit (0 = Unlimited)', lang)}</Label>
                  <Input type="number" min="0" step="0.01" value={form.creditLimit ?? 0}
                    onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('مدة الائتمان بالأيام (0 = فوري)', 'Credit Days (0 = Immediate)', lang)}</Label>
                  <Input type="number" min="0" step="1" value={form.creditDays ?? 0}
                    onChange={e => setForm(f => ({ ...f, creditDays: Number(e.target.value) }))} />
                </div>
                {editing && (
                  <div className="col-span-2 flex flex-wrap items-center gap-2 text-sm rounded-md bg-background border px-3 py-2">
                    <Wallet className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('الرصيد الحالي (محسوب من القيود المرحَّلة):', 'Current balance (from posted journal entries):', lang)}</span>
                    <span className={`font-semibold ${editingBalance > 0 ? 'text-emerald-700' : editingBalance < 0 ? 'text-amber-700' : 'text-foreground'}`}>
                      {formatCurrency(editingBalance, lang)}
                    </span>
                    {overLimit && (
                      <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                        {t('يتجاوز الحد الائتماني', 'Over credit limit', lang)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف العميل', 'Delete Client', lang)}
        description={t('سيتم حذف العميل نهائياً.', 'This client will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
      </>
      )}
    </ModuleLayout>
  );
}
