import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, PieChart } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';

/**
 * Auto-computed profitability: Revenue − Costs = Profit.
 * All figures are derived from the project's related records passed in.
 */
export default function ProfitabilityTab({ revenue = 0, costs = 0, contractValue = 0 }) {
  const { lang } = useStore();
  const profit = revenue - costs;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const budgetUsed = contractValue > 0 ? (costs / contractValue) * 100 : 0;

  const cards = [
    { label: { ar: 'الإيرادات', en: 'Revenue' }, value: revenue, Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: { ar: 'التكاليف', en: 'Costs' }, value: costs, Icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: { ar: 'صافي الربح', en: 'Net Profit' }, value: profit, Icon: Wallet, color: profit >= 0 ? 'text-teal-600' : 'text-rose-600', bg: profit >= 0 ? 'bg-teal-50' : 'bg-rose-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`size-11 rounded-xl flex items-center justify-center ${c.bg}`}>
                <c.Icon className={`size-5 ${c.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t(c.label.ar, c.label.en, lang)}</p>
                <p className={`text-lg font-bold ${c.color}`}>{formatCurrency(c.value, lang)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PieChart className="size-4 text-muted-foreground" />
            {t('مؤشرات الربحية', 'Profitability Indicators', lang)}
          </div>
          <div className="space-y-3">
            <Indicator label={t('هامش الربح', 'Profit Margin', lang)} value={`${margin.toFixed(1)}%`} percent={Math.max(0, Math.min(100, margin))} color="bg-emerald-500" />
            <Indicator label={t('استهلاك الموازنة (من قيمة العقد)', 'Budget Used (of contract)', lang)} value={`${budgetUsed.toFixed(1)}%`} percent={Math.max(0, Math.min(100, budgetUsed))} color={budgetUsed > 90 ? 'bg-rose-500' : 'bg-amber-500'} />
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground">
            {t('قيمة العقد', 'Contract value', lang)}: <span className="font-semibold text-foreground">{formatCurrency(contractValue, lang)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicator({ label, value, percent, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}