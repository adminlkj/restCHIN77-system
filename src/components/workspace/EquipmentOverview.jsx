import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, EQUIPMENT_STATUS } from '@/lib/utils-binaa';

function Stat({ label, value, Icon, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
    cyan: 'bg-cyan-50 text-cyan-700',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg flex items-center justify-center ${tones[tone] || tones.blue}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold text-foreground truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value || '—'}</div>
    </div>
  );
}

export default function EquipmentOverview({ equipment, revenue, costs }) {
  const { lang } = useStore();
  const profit = revenue - costs;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const st = EQUIPMENT_STATUS[equipment.status] || EQUIPMENT_STATUS.AVAILABLE;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t('الإيرادات', 'Revenue', lang)} value={formatCurrency(revenue, lang)} Icon={TrendingUp} tone="emerald" />
        <Stat label={t('التكاليف', 'Costs', lang)} value={formatCurrency(costs, lang)} Icon={TrendingDown} tone="rose" />
        <Stat label={t('صافي الربح', 'Net Profit', lang)} value={formatCurrency(profit, lang)} Icon={Wallet} tone={profit >= 0 ? 'emerald' : 'rose'} />
        <Stat label={t('هامش الربح', 'Profit Margin', lang)} value={`${margin}%`} Icon={Percent} tone="cyan" />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">{t('البيانات الأساسية', 'Basic Data', lang)}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label={t('كود المعدة', 'Equipment Code', lang)} value={equipment.code} />
          <Field label={t('الاسم', 'Name', lang)} value={equipment.name} />
          <Field label={t('النوع', 'Type', lang)} value={equipment.type} />
          <Field label={t('الماركة / الموديل', 'Brand / Model', lang)} value={[equipment.brand, equipment.model].filter(Boolean).join(' / ')} />
          <Field label={t('رقم اللوحة', 'Plate No.', lang)} value={equipment.plateNumber} />
          <Field
            label={t('الحالة', 'Status', lang)}
            value={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>}
          />
          <Field label={t('السعر اليومي', 'Daily Rate', lang)} value={formatCurrency(equipment.dailyRate, lang)} />
          <Field label={t('السعر الشهري', 'Monthly Rate', lang)} value={formatCurrency(equipment.monthlyRate, lang)} />
          <Field label={t('القيمة الحالية', 'Current Value', lang)} value={formatCurrency(equipment.currentValue, lang)} />
          <Field label={t('تاريخ الشراء', 'Purchase Date', lang)} value={formatDate(equipment.purchaseDate, lang)} />
          <Field label={t('تكلفة الشراء', 'Purchase Cost', lang)} value={formatCurrency(equipment.purchaseCost, lang)} />
        </div>
        {equipment.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-1">{t('ملاحظات', 'Notes', lang)}</div>
            <p className="text-sm text-foreground">{equipment.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}