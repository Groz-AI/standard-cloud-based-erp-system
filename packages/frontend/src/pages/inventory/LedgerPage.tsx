import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/lib/utils';
import { ClipboardList, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function LedgerPage() {
  const { t } = useTranslation();
  const { currentStoreId } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['stock-ledger', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/inventory/ledger', { params: { storeId: currentStoreId, limit: 100 } });
      return res.data;
    },
  });

  const transactions = data?.transactions || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('inventory.stockLedger')}</h1>
        <p className="text-muted-foreground">{t('inventory.ledgerDesc')}</p>
      </div>
      <div className="bg-white rounded-xl border shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('inventory.noTransactions')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('inventory.transactionsWillAppear')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="text-left p-4 font-medium">{t('common.date')}</th>
                <th className="text-left p-4 font-medium">{t('products.product')}</th>
                <th className="text-left p-4 font-medium">{t('common.type')}</th>
                <th className="text-right p-4 font-medium">{t('inventory.change')}</th>
                <th className="text-right p-4 font-medium">{t('inventory.balance')}</th>
                <th className="text-left p-4 font-medium">{t('common.reference')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="p-4 text-muted-foreground">{formatDateTime(tx.created_at)}</td>
                  <td className="p-4">
                    <p className="font-medium">{tx.product_name}</p>
                    <p className="text-sm text-muted-foreground">{tx.sku}</p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      tx.transaction_type === 'receive' ? 'bg-emerald-100 text-emerald-700' :
                      tx.transaction_type === 'sale' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {tx.transaction_type === 'receive' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className={`p-4 text-right font-medium ${parseFloat(tx.quantity_change) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {parseFloat(tx.quantity_change) > 0 ? '+' : ''}{parseFloat(tx.quantity_change).toFixed(0)}
                  </td>
                  <td className="p-4 text-right">{parseFloat(tx.quantity_after).toFixed(0)}</td>
                  <td className="p-4 text-muted-foreground">{tx.reference_number || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
