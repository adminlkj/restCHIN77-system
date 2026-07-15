import React from 'react';
import { CheckCircle2, Flag, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { t, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const ORDER_TYPE = {
  DELIVERY: { ar: 'تسليم', en: 'Delivery', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  RETURN: { ar: 'استرجاع', en: 'Return', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
};
const DO_STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  CONFIRMED: { ar: 'مؤكد', en: 'Confirmed', color: 'bg-blue-100 text-blue-700 border border-blue-200' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

export default function DeliveryOrdersTab({ equipmentId }) {
  const { lang } = useStore();

  const setStatus = async (row, status, reload) => {
    await base44.entities.DeliveryOrder.update(row.id, { status });
    if (status === 'COMPLETED') {
      await base44.entities.Equipment.update(equipmentId, { status: row.orderType === 'RETURN' ? 'AVAILABLE' : 'RENTED' });
    }
    await reload();
  };

  return (
    <CrudTab
      entityName="DeliveryOrder"
      filter={{ equipmentId }}
      defaults={(rows) => ({
        equipmentId,
        orderNo: nextCodeFromList(rows, 'DO', 'orderNo'),
        orderType: 'DELIVERY',
        date: new Date().toISOString().slice(0, 10),
        clientName: '',
        location: '',
        meterReading: 0,
        status: 'DRAFT',
        notes: '',
      })}
      validate={(f) => (!f.orderNo?.trim() ? t('أدخل رقم الأمر', 'Enter order number', lang) : null)}
      buildPayload={(f) => ({
        equipmentId,
        orderNo: f.orderNo,
        orderType: f.orderType,
        date: f.date || null,
        clientName: f.clientName,
        location: f.location,
        meterReading: Number(f.meterReading) || 0,
        status: 'DRAFT',
        notes: f.notes,
      })}
      rowActions={(row, reload) => (
        <>
          {row.status === 'DRAFT' && <Button variant="outline" size="sm" className="h-8 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => setStatus(row, 'CONFIRMED', reload)}><CheckCircle2 className="size-3.5" />{t('تأكيد', 'Confirm', lang)}</Button>}
          {row.status === 'CONFIRMED' && <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setStatus(row, 'COMPLETED', reload)}><Flag className="size-3.5" />{t('إكمال', 'Complete', lang)}</Button>}
          {(row.status === 'DRAFT' || row.status === 'CONFIRMED') && <Button variant="ghost" size="icon" className="size-8 text-rose-700" title={t('إلغاء', 'Cancel', lang)} onClick={() => setStatus(row, 'CANCELLED', reload)}><XCircle className="size-3.5" /></Button>}
        </>
      )}
      canEditRow={(row) => row.status === 'DRAFT'}
      canDeleteRow={(row) => row.status === 'DRAFT'}
      labels={{
        new: { ar: 'أمر تسليم/استرجاع', en: 'New Delivery/Return' },
        edit: { ar: 'تعديل الأمر', en: 'Edit Order' },
        empty: { ar: 'لا توجد أوامر تسليم أو استرجاع', en: 'No delivery/return orders' },
        title: { ar: 'حذف الأمر', en: 'Delete Order' },
      }}
      summary={(rows) => (
        <>{t('الأوامر', 'Orders', lang)}: <span className="font-bold text-foreground">{rows.length}</span></>
      )}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.orderNo}</span> },
        { header: { ar: 'النوع', en: 'Type' }, cell: r => {
          const ty = ORDER_TYPE[r.orderType] || ORDER_TYPE.DELIVERY;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ty.color}`}>{lang === 'ar' ? ty.ar : ty.en}</span>;
        } },
        { header: { ar: 'العميل', en: 'Client' }, cell: r => <span className="text-sm">{r.clientName || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'العداد', en: 'Meter' }, cell: r => <span className="tabular-nums">{r.meterReading || 0}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = DO_STATUS[r.status] || DO_STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('رقم الأمر', 'Order No', lang)} *</Label>
            <Input value={form.orderNo || ''} readOnly className="bg-muted font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('النوع', 'Type', lang)}</Label>
            <Select value={form.orderType || 'DELIVERY'} onValueChange={v => set('orderType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_TYPE).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('العميل', 'Client', lang)}</Label>
            <Input value={form.clientName || ''} onChange={e => set('clientName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الموقع', 'Location', lang)}</Label>
            <Input value={form.location || ''} onChange={e => set('location', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)}</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('قراءة العداد', 'Meter Reading', lang)}</Label>
            <Input type="number" value={form.meterReading ?? 0} onChange={e => set('meterReading', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Input readOnly value={t('مسودة (تُؤكد لاحقاً)', 'Draft (confirm later)', lang)} className="bg-muted text-muted-foreground" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('ملاحظات', 'Notes', lang)}</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </>
      )}
    />
  );
}