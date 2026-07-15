import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';

// محرّر بنود أمر الشراء — كل بند يُختار من أصناف المخزون أو يُدخل يدوياً.
export default function OrderLinesEditor({ lines, onChange, boqItems }) {
  const { lang } = useStore();

  const addLine = () => onChange([...(lines || []), { boqItemId: '', itemNo: '', description: '', unit: '', orderedQty: 0, unitPrice: 0 }]);
  const removeLine = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const setLine = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onPickItem = (i, itemId) => {
    const b = (boqItems || []).find(x => x.id === itemId);
    if (!b) { setLine(i, { boqItemId: '' }); return; }
    setLine(i, {
      boqItemId: b.id, itemNo: b.code || '', description: b.name || '',
      unit: b.unit || '', unitPrice: Number(b.costPrice || b.unitCost) || 0,
    });
  };

  const linesTotal = (lines || []).reduce((s, l) => s + (Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('بنود الأمر', 'Order Items', lang)}</span>
        <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1"><Plus className="size-3.5" />{t('بند', 'Line', lang)}</Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">{t('الصنف', 'Item', lang)}</TableHead>
              <TableHead className="w-20">{t('الوحدة', 'Unit', lang)}</TableHead>
              <TableHead className="w-24">{t('الكمية', 'Qty', lang)}</TableHead>
              <TableHead className="w-28">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
              <TableHead className="w-28">{t('الإجمالي', 'Total', lang)}</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lines || []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">{t('أضف بنوداً للأمر', 'Add items to the order', lang)}</TableCell></TableRow>
            ) : lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  {(boqItems || []).length > 0 ? (
                    <Select value={l.boqItemId || 'custom'} onValueChange={v => v === 'custom' ? setLine(i, { boqItemId: '' }) : onPickItem(i, v)}>
                      <SelectTrigger><SelectValue placeholder={t('اختر صنفاً', 'Select item', lang)} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">{t('— إدخال يدوي —', '— Custom —', lang)}</SelectItem>
                        {boqItems.map(b => <SelectItem key={b.id} value={b.id}>{b.code ? `${b.code} — ` : ''}{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {(!l.boqItemId || (boqItems || []).length === 0) && (
                    <Input className="mt-1" value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder={t('وصف الصنف', 'Item description', lang)} />
                  )}
                </TableCell>
                <TableCell><Input value={l.unit || ''} onChange={e => setLine(i, { unit: e.target.value })} className="w-16" /></TableCell>
                <TableCell><Input type="number" value={l.orderedQty} onChange={e => setLine(i, { orderedQty: e.target.value })} className="w-20" /></TableCell>
                <TableCell><Input type="number" value={l.unitPrice} onChange={e => setLine(i, { unitPrice: e.target.value })} className="w-24" /></TableCell>
                <TableCell className="text-sm font-medium">{formatCurrency((Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0), lang)}</TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeLine(i)}><Trash2 className="size-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-end text-sm">{t('إجمالي البنود قبل الضريبة', 'Lines subtotal', lang)}: <strong>{formatCurrency(linesTotal, lang)}</strong></div>
    </div>
  );
}