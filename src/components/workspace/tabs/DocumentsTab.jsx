import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Eye, Loader2 } from 'lucide-react';
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
import FilePreviewDialog from '@/components/shared/FilePreviewDialog';
import { toast } from 'sonner';

const CATEGORIES = {
  CONTRACT: { ar: 'عقد', en: 'Contract', color: 'bg-blue-100 text-blue-700' },
  DRAWING: { ar: 'مخطط', en: 'Drawing', color: 'bg-purple-100 text-purple-700' },
  PHOTO: { ar: 'صورة', en: 'Photo', color: 'bg-emerald-100 text-emerald-700' },
  PERMIT: { ar: 'تصريح', en: 'Permit', color: 'bg-amber-100 text-amber-700' },
  REPORT: { ar: 'تقرير', en: 'Report', color: 'bg-teal-100 text-teal-700' },
  OTHER: { ar: 'أخرى', en: 'Other', color: 'bg-gray-100 text-gray-700' },
};

export default function DocumentsTab({ projectId }) {
  const { lang } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'OTHER' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.ProjectDocument.filter({ projectId }, '-created_date');
      setRows(data);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل المستندات', 'Failed to load documents', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [projectId]);

  const openNew = () => { setForm({ name: '', category: 'OTHER' }); setFile(null); setOpen(true); };

  const save = async () => {
    setUploading(true);
    try {
      let fileUrl = '';
      if (file) {
        const res = await base44.integrations.Core.UploadFile({ file });
        fileUrl = res.file_url;
      }
      await base44.entities.ProjectDocument.create({
        projectId,
        name: form.name || file?.name || t('مستند', 'Document', lang),
        category: form.category,
        fileUrl,
        uploadedDate: new Date().toISOString().slice(0, 10),
      });
      toast.success(t('تم رفع المستند', 'Document uploaded', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل رفع المستند', 'Failed to upload document', lang));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    try {
      await base44.entities.ProjectDocument.delete(deleteId);
      toast.success(t('تم حذف المستند', 'Document deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل حذف المستند', 'Failed to delete document', lang));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="size-4" /> {t('رفع مستند', 'Upload Document', lang)}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">...</div>
      ) : rows.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">{t('لا توجد مستندات', 'No documents', lang)}</Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(r => {
            const c = CATEGORIES[r.category] || CATEGORIES.OTHER;
            return (
              <Card key={r.id} className="p-4 flex items-start gap-3">
                <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.color}`}>{lang === 'ar' ? c.ar : c.en}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(r.uploadedDate, lang)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {r.fileUrl && (
                      <button onClick={() => setPreview({ url: r.fileUrl, name: r.name })} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Eye className="size-3.5" /> {t('معاينة', 'Preview', lang)}
                      </button>
                    )}
                    <Button variant="ghost" size="icon" className="size-7 text-rose-600 ms-auto" onClick={() => setDeleteId(r.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('رفع مستند', 'Upload Document', lang)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>{t('اسم المستند', 'Document Name', lang)}</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>{t('التصنيف', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('الملف', 'File', lang)}</Label><Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={uploading || (!file && !form.name)} className="bg-emerald-600 hover:bg-emerald-700">
              {uploading && <Loader2 className="size-4 animate-spin" />} {t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف المستند', 'Delete Document', lang)}
        description={t('هل أنت متأكد من حذف هذا المستند؟', 'Are you sure?', lang)} />

      <FilePreviewDialog open={!!preview} onOpenChange={o => !o && setPreview(null)} url={preview?.url} name={preview?.name} />
    </div>
  );
}