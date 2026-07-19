import React, { useState } from 'react';
import { Building2, FileText, Globe, Info, Store, Palette, Receipt, CalendarClock, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import CompanySettingsCard from '@/components/settings/CompanySettingsCard';
import BranchSettingsCard from '@/components/settings/BranchSettingsCard';
import PrintSettingsCard from '@/components/settings/PrintSettingsCard';
import FiscalControlCard from '@/components/settings/FiscalControlCard';
import SupervisorPasswordCard from '@/components/settings/SupervisorPasswordCard';

export default function Settings() {
  const { lang, toggleLang } = useStore();
  const [tab, setTab] = useState('general');

  const SECTIONS = [
    { key: 'general',  ar: 'عام',              en: 'General',          Icon: Globe },
    { key: 'company',  ar: 'بيانات الشركة',   en: 'Company',          Icon: Building2 },
    { key: 'branches', ar: 'إعدادات الفروع',  en: 'Branch Settings',  Icon: Store },
    { key: 'print',    ar: 'الطباعة والإيصال', en: 'Print & Receipt',  Icon: FileText },
    { key: 'fiscal',   ar: 'التحكم المالي',   en: 'Fiscal Control',   Icon: CalendarClock },
    { key: 'security', ar: 'الأمان',          en: 'Security',          Icon: ShieldCheck },
    { key: 'about',    ar: 'حول النظام',      en: 'About',            Icon: Info },
  ];

  return (
    <ModuleLayout
      title={t('إعدادات النظام', 'System Settings', lang)}
      subtitle={t('تكوين النظام والتفضيلات', 'System configuration and preferences', lang)}
    >
      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 mb-5 border-b pb-3">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === s.key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <s.Icon className="size-4" />
            {lang === 'ar' ? s.ar : s.en}
          </button>
        ))}
      </div>

      <div className="max-w-3xl">
        {tab === 'general' && (
          <div className="space-y-4">
            {/* اللغة */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="size-4" />{t('اللغة', 'Language', lang)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('اللغة الحالية للنظام', 'Current system language', lang)}: <strong>{lang === 'ar' ? 'العربية' : 'English'}</strong></p>
                <Button onClick={toggleLang} variant="outline" className="gap-2">
                  <Globe className="size-4" />
                  {lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
                </Button>
              </CardContent>
            </Card>

            {/* إعدادات سريعة */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4" />{t('إعدادات سريعة', 'Quick Settings', lang)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('روابط سريعة للأقسام الأكثر استخداماً', 'Quick links to most used sections', lang)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab('company')}>
                    <Building2 className="size-3.5" />{t('بيانات الشركة', 'Company Data', lang)}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab('branches')}>
                    <Store className="size-3.5" />{t('إعدادات الفروع', 'Branch Settings', lang)}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab('print')}>
                    <Palette className="size-3.5" />{t('إعدادات الطباعة', 'Print Settings', lang)}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'company' && <CompanySettingsCard />}

        {tab === 'branches' && <BranchSettingsCard />}

        {tab === 'print' && <PrintSettingsCard />}

        {tab === 'fiscal' && <FiscalControlCard />}

        {tab === 'security' && <SupervisorPasswordCard />}

        {tab === 'about' && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Info className="size-4" />{t('معلومات النظام', 'System Info', lang)}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('اسم النظام', 'System Name', lang)}</span>
                <span className="font-medium">{t('نظام إدارة المطاعم', 'Restaurant Management System', lang)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('الإصدار', 'Version', lang)}</span>
                <span className="font-medium">2.0.0</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('المجال', 'Domain', lang)}</span>
                <span className="font-medium">{t('إدارة المطاعم', 'Restaurant Management', lang)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('العملة', 'Currency', lang)}</span>
                <span className="font-medium">{t('ريال سعودي (SAR)', 'Saudi Riyal (SAR)', lang)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">{t('نسبة الضريبة', 'VAT Rate', lang)}</span>
                <span className="font-medium">15%</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">{t('التوافق', 'Compliance', lang)}</span>
                <span className="font-medium">{t('هيئة الزكاة والضريبة والجمارك', 'ZATCA Compliant', lang)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ModuleLayout>
  );
}
