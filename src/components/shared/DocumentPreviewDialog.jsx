import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { printHtml } from '@/lib/printDocument';

/**
 * حوار معاينة + طباعة موحّد لأي مستند رسمي (سند قبض/صرف/استلام...).
 * Props:
 *  - open, onOpenChange
 *  - title: { ar, en } | string  — عنوان الحوار واسم نافذة الطباعة
 *  - children: عنصر المستند (يستقبل innerRef عبر التغليف هنا)
 */
export default function DocumentPreviewDialog({ open, onOpenChange, title, children }) {
  const { lang } = useStore();
  const ref = useRef(null);

  const heading = typeof title === 'string' ? title : t(title.ar, title.en, lang);

  const handlePrint = () => {
    if (ref.current) printHtml(ref.current.innerHTML, { title: heading, lang });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{heading}</DialogTitle>
            <Button size="sm" onClick={handlePrint} className="gap-1.5 me-6">
              <Printer className="size-4" /> {t('طباعة', 'Print', lang)}
            </Button>
          </div>
        </DialogHeader>
        <div className="bg-white rounded-lg border p-6" ref={ref}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}