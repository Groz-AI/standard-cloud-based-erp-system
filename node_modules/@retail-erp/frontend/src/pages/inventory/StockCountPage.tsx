import { useTranslation } from 'react-i18next';

export default function StockCountPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('inventory.stockCount')}</h1>
      <p className="text-muted-foreground">{t('inventory.stockCountDesc')}</p>
    </div>
  );
}
