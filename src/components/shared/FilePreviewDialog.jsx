import React from 'react';
import { Download, ExternalLink, FileText, Printer } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// معاينة مستند داخل التطبيق: الصور تُعرض مباشرة، وملفات PDF داخل إطار،
// وأي نوع آخر يُعرض كرابط تحميل/فتح.
export default function FilePreviewDialog({ open, onOpenChange, url, name }) {
  const { lang } = useStore();
  const ext = (url || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';

  const printFile = () => {
    if (!url) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const content = isImage
      ? `<img src="${url}" style="max-width:100%;height:auto;display:block;margin:auto;" />`
      : `<iframe src="${url}" style="width:100%;height:100vh;border:0;"></iframe>`;
    w.document.write(`<html><head><title>${name || 'Document'}</title></head><body style="margin:0;">${content}<script>window.onload=function(){setTimeout(function(){window.print();},500)}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between gap-2">
          <DialogTitle className="truncate text-base">{name || t('معاينة المستند', 'Document Preview', lang)}</DialogTitle>
          {url && (
            <div className="flex items-center gap-1 shrink-0">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={printFile}><Printer className="size-3.5" />{t('طباعة', 'Print', lang)}</Button>
              <a href={url} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline" size="sm" className="gap-1"><ExternalLink className="size-3.5" />{t('فتح', 'Open', lang)}</Button>
              </a>
              <a href={url} download={name || true}>
                <Button type="button" size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700"><Download className="size-3.5" />{t('تحميل', 'Download', lang)}</Button>
              </a>
            </div>
          )}
        </DialogHeader>

        <div className="bg-muted/40 flex items-center justify-center min-h-[60vh] max-h-[80vh] overflow-auto p-4">
          {!url ? (
            <p className="text-muted-foreground text-sm">{t('لا يوجد ملف', 'No file', lang)}</p>
          ) : isImage ? (
            <img src={url} alt={name || ''} className="max-w-full max-h-[74vh] object-contain rounded" />
          ) : isPdf ? (
            <iframe src={url} title={name || 'pdf'} className="w-full h-[78vh] rounded bg-white" />
          ) : (
            <div className="text-center space-y-3">
              <FileText className="size-14 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('لا يمكن معاينة هذا النوع مباشرة', 'This file type cannot be previewed inline', lang)}</p>
              <a href={url} target="_blank" rel="noreferrer">
                <Button className="gap-1 bg-emerald-600 hover:bg-emerald-700"><ExternalLink className="size-4" />{t('فتح الملف', 'Open File', lang)}</Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}