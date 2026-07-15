import React, { useState } from 'react';
import { Eye, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import FilePreviewDialog from '@/components/shared/FilePreviewDialog';
import { toast } from 'sonner';

export default function InvoiceAttachmentField({ label, url, name, onChange, className = '' }) {
  const { lang } = useStore();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange({ url: file_url, name: file.name, type: file.type });
      toast.success(t('تم رفع الملف', 'File uploaded', lang));
    } catch (err) {
      toast.error(err?.message || t('فشل رفع الملف', 'Failed to upload file', lang));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label || t('مرفق الفاتورة', 'Invoice Attachment', lang)}</Label>
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        {url ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2 text-sm">
              <Paperclip className="size-4 text-emerald-600 shrink-0" />
              <span className="truncate">{name || t('ملف مرفق', 'Attached file', lang)}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPreviewOpen(true)}>
                <Eye className="size-3.5" />{t('معاينة', 'Preview', lang)}
              </Button>
              <Button type="button" size="icon" variant="ghost" className="size-8 text-rose-600" onClick={() => onChange({ url: '', name: '', type: '' })}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 rounded-md border border-dashed bg-background px-3 py-4 text-sm cursor-pointer hover:bg-accent">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? t('جاري الرفع...', 'Uploading...', lang) : t('رفع صورة أو PDF للفاتورة', 'Upload invoice image or PDF', lang)}
            <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={e => upload(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <FilePreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} url={url} name={name} />
    </div>
  );
}