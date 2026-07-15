import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import PartyStatementSection from '@/components/partners/PartyStatementSection';
import { toast } from 'sonner';

export default function PartnerFollowUp() {
  const { lang } = useStore();
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cl, sp, pl] = await Promise.all([
          base44.entities.Client.list('name', 1000),
          base44.entities.Supplier.list('name', 1000),
          base44.entities.DeliveryPlatform.list('name', 1000).catch(() => []),
        ]);
        setClients(cl || []);
        setSuppliers(sp || []);
        setPlatforms(pl || []);
      } catch (err) {
        toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load', lang));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <ModuleLayout
      title={t('متابعة العملاء والموردين والمنصات', 'Clients, Suppliers & Platforms Follow-up', lang)}
      subtitle={t('أرصدة وكشوفات مستقلة من القيود المرحّلة', 'Independent balances and statements from posted journal entries', lang)}
    >
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</div>
      ) : (
        <Tabs defaultValue="clients" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <TabsList>
            <TabsTrigger value="clients">{t('العملاء', 'Clients', lang)}</TabsTrigger>
            <TabsTrigger value="suppliers">{t('الموردون', 'Suppliers', lang)}</TabsTrigger>
            <TabsTrigger value="platforms">{t('المنصات', 'Platforms', lang)}</TabsTrigger>
          </TabsList>
          <TabsContent value="clients" className="mt-4"><PartyStatementSection partyType="CLIENT" parties={clients} /></TabsContent>
          <TabsContent value="suppliers" className="mt-4"><PartyStatementSection partyType="SUPPLIER" parties={suppliers} /></TabsContent>
          <TabsContent value="platforms" className="mt-4"><PartyStatementSection partyType="PLATFORM" parties={platforms} /></TabsContent>
        </Tabs>
      )}
    </ModuleLayout>
  );
}