import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Upload, ExternalLink, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const CATEGORIES = {
  CONTRACT: { ar: 'عقد', en: 'Contract' },
  ID: { ar: 'هوية', en: 'ID' },
  PASSPORT: { ar: 'جواز', en: 'Passport' },
  IQAMA: { ar: 'إقامة', en: 'Iqama' },
  CERTIFICATE: { ar: 'شهادة', en: 'Certificate' },
  OTHER: { ar: 'أخرى', en: 'Other' },
};
const empty = { name: '', category: 'OTHER', fileUrl: '', expiryDate: '', notes: '' };

export default function EmployeeDocumentsTab({ employeeId, onChange }) {
  const { lang } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await base44.entities.EmployeeDocument.filter({ employeeId }, '-created_date'));
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل المستندات', 'Failed to load documents', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [employeeId]);

  const openNew = () => { setForm(empty); setOpen(true); };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, fileUrl: file_url, name: f.name || file.name }));
    } catch (err) {
      toast.error(err?.message || t('فشل رفع الملف', 'Failed to upload file', lang));
    } finally { setUploading(false); }
  };

  const save = async () => {
    try {
      await base44.entities.EmployeeDocument.create({
        employeeId, name: form.name, category: form.category,
        fileUrl: form.fileUrl, expiryDate: form.expiryDate,
        uploadedDate: new Date().toISOString().slice(0, 10), notes: form.notes,
      });
      toast.success(t('تم حفظ المستند', 'Document saved', lang));
      setOpen(false); load(); onChange?.();
    } catch (err) {
      toast.error(err?.message || t('فشل حفظ المستند', 'Failed to save document', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.EmployeeDocument.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null); load(); onChange?.();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const isExpiring = (d) => d && new Date(d) < new Date(Date.now() + 30 * 864e5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} {t('مستند', 'documents', lang)}</div>
        <Button size="sm" onClick={openNew} className="bg-violet-600 hover:bg-violet-700"><Plus className="size-4" /> {t('مستند جديد', 'New Document', lang)}</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground"><FileText className="size-10 mx-auto mb-2 opacity-40" />{t('لا توجد مستندات', 'No documents', lang)}</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(r => {
            const cat = CATEGORIES[r.category] || CATEGORIES.OTHER;
            return (
              <Card key={r.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="size-5 text-violet-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{lang === 'ar' ? cat.ar : cat.en}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-rose-600 shrink-0" onClick={() => setDeleteId(r.id)}><Trash2 className="size-3.5" /></Button>
                </div>
                {r.expiryDate && (
                  <div className={`text-xs flex items-center gap-1 ${isExpiring(r.expiryDate) ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                    {isExpiring(r.expiryDate) && <AlertTriangle className="size-3" />}
                    {t('ينتهي', 'Expires', lang)}: {formatDate(r.expiryDate, lang)}
                  </div>
                )}
                {r.fileUrl && (
                  <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="size-3" /> {t('فتح الملف', 'Open file', lang)}
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t('مستند جديد', 'New Document', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>{t('اسم المستند', 'Document Name', lang)}</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>{t('النوع', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('تاريخ الانتهاء', 'Expiry Date', lang)}</Label><Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الملف', 'File', lang)}</Label>
              <div className="flex items-center gap-2">
                <Input type="file" onChange={handleUpload} className="text-xs" />
                {uploading && <Upload className="size-4 animate-pulse text-violet-600" />}
              </div>
              {form.fileUrl && <div className="text-xs text-emerald-600 mt-1">{t('تم الرفع', 'Uploaded', lang)} ✓</div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.name || uploading} className="bg-violet-600 hover:bg-violet-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف', 'Delete', lang)} description={t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang)} />
    </div>
  );
}