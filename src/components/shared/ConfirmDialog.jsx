import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, confirmLabel = 'حذف', confirmVariant = 'destructive' }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5 text-rose-600" />
            </div>
            <DialogTitle>{title || 'تأكيد الحذف'}</DialogTitle>
          </div>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant={confirmVariant} onClick={() => { onConfirm(); onOpenChange(false); }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}