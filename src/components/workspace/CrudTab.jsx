import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Inbox, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

/**
 * Reusable CRUD tab for workspace sub-sections.
 * Props:
 *  - entityName: base44 entity name (e.g. 'WorkOrder')
 *  - filter: query filter object (e.g. { projectId })
 *  - defaults: object|fn(rows) => initial form values for a new record
 *  - columns: [{ header:{ar,en}, cell:(row)=>node }]
 *  - fields: (form, set) => node  — the form body rendered inside the dialog
 *  - validate: (form) => string|null  — return error message or null
 *  - buildPayload: (form) => object  — payload sent to create/update
 *  - labels: { new:{ar,en}, edit:{ar,en}, empty:{ar,en}, title:{ar,en} }
 *  - summary: (rows) => node  — optional header summary
 *  - onChanged: () => void  — optional callback after any mutation
 */
export default function CrudTab({
  entityName, filter, defaults, columns, fields, validate, buildPayload, labels, summary, onChanged, rowActions, beforeSave, operationHandlers, canEditRow, canDeleteRow,
}) {
  const { lang } = useStore();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const makeDefaults = (list) => (typeof defaults === 'function' ? defaults(list) : { ...defaults });

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities[entityName].filter(filter, '-created_date');
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [JSON.stringify(filter)]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const openAdd = () => {
    setEditingId(null);
    setForm(makeDefaults(rows));
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm({ ...row });
    setDialogOpen(true);
  };

  const save = async () => {
    const err = validate ? validate(form) : null;
    if (err) {
      toast({ title: t('حقل مطلوب', 'Required', lang), description: err, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (beforeSave) {
        const blockMsg = await beforeSave(form, editingId);
        if (blockMsg) {
          toast({ title: t('غير مسموح', 'Not allowed', lang), description: blockMsg, variant: 'destructive' });
          setSaving(false);
          return;
        }
      }
      const payload = buildPayload(form);
      // حين تُمرَّر معالجات عمليات (operationHandlers) يمر الحفظ عبر الخادم فيُنشئ
      // قيداً محاسبياً ذرّياً، وفشل القيد يُلغي العملية. وإلا كتابة مباشرة كالمعتاد.
      if (editingId) {
        if (operationHandlers?.update) await operationHandlers.update(editingId, payload);
        else await base44.entities[entityName].update(editingId, payload);
        toast({ title: t('تم التحديث', 'Updated', lang) });
      } else {
        if (operationHandlers?.create) await operationHandlers.create(payload);
        else await base44.entities[entityName].create(payload);
        toast({ title: t('تمت الإضافة', 'Created', lang) });
      }
      setDialogOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: t('خطأ', 'Error', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await base44.entities[entityName].delete(deleteTarget.id);
      toast({ title: t('تم الحذف', 'Deleted', lang) });
      setDeleteTarget(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: t('خطأ', 'Error', lang), description: e.message, variant: 'destructive' });
    }
  };

  const colCount = columns.length + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">{summary ? summary(rows) : null}</div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="size-4" /> {t(labels.new.ar, labels.new.en, lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c, i) => (
                  <TableHead key={i}>{t(c.header.ar, c.header.en, lang)}</TableHead>
                ))}
                <TableHead className="text-end">{t('إجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={colCount} className="text-center py-10"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center py-12 text-muted-foreground">
                    <Inbox className="size-10 mx-auto mb-2 text-muted-foreground/40" />
                    {t(labels.empty.ar, labels.empty.en, lang)}
                  </TableCell>
                </TableRow>
              ) : rows.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  {columns.map((c, i) => <TableCell key={i}>{c.cell(row)}</TableCell>)}
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {rowActions?.(row, load)}
                      {(canEditRow ? canEditRow(row) : true) && (
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(row)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {(canDeleteRow ? canDeleteRow(row) : true) && (
                        <Button size="icon" variant="ghost" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteTarget(row)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>{editingId ? t(labels.edit.ar, labels.edit.en, lang) : t(labels.new.ar, labels.new.en, lang)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {fields(form, set)}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t(labels.title?.ar || 'حذف السجل', labels.title?.en || 'Delete Record', lang)}
        description={t('هل أنت متأكد من الحذف؟ لا يمكن التراجع.', 'Are you sure you want to delete? This cannot be undone.', lang)}
      />
    </div>
  );
}