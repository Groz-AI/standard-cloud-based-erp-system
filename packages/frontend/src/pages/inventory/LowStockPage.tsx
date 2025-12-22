import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Package, Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  current_stock: number;
  reorder_point: number;
  alert_threshold: number;
}

export default function LowStockPage() {
  const { t } = useTranslation();
  const { currentStoreId } = useAuthStore();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['low-stock', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/inventory/low-stock', { 
        params: { storeId: currentStoreId, threshold: 10 } 
      });
      return res.data;
    },
  });

  const alerts: LowStockItem[] = data?.alerts || [];
  const count = data?.count || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
            </div>
            {t('inventory.lowStockAlerts')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {count} {t('inventory.productsNeedRestock')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} size="sm">
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </Button>
          <Link to="/inventory/receive">
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              <Package className="h-4 w-4 mr-2" />
              {t('sidebar.receiveStock')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white rounded-xl sm:rounded-2xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-2">{t('inventory.checkingStock')}</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Package className="h-10 w-10 text-emerald-600" />
            </div>
            <p className="font-semibold text-lg text-emerald-600">{t('inventory.allStockOk')}</p>
            <p className="text-muted-foreground mt-1">{t('inventory.noLowStock')}</p>
          </div>
        ) : (
          <div className="divide-y">
            {alerts.map((item) => {
              const stockPercent = (item.current_stock / item.alert_threshold) * 100;
              const isOutOfStock = item.current_stock <= 0;
              const isCritical = item.current_stock < item.alert_threshold * 0.3;
              
              return (
                <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                        isOutOfStock ? 'bg-red-100' : isCritical ? 'bg-amber-100' : 'bg-yellow-100'
                      }`}>
                        <AlertTriangle className={`h-6 w-6 ${
                          isOutOfStock ? 'text-red-600' : isCritical ? 'text-amber-600' : 'text-yellow-600'
                        }`} />
                      </div>
                      <div>
                        <Link to={`/products/${item.id}`} className="font-medium hover:text-primary transition-colors">
                          {item.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">{item.sku}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-bold ${
                            isOutOfStock ? 'text-red-600' : isCritical ? 'text-amber-600' : 'text-yellow-600'
                          }`}>
                            {Math.floor(item.current_stock)}
                          </span>
                          <span className="text-muted-foreground">/ {item.alert_threshold}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('inventory.currentReorderPoint')}</p>
                      </div>
                      <div className="w-32">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              isOutOfStock ? 'bg-red-500' : isCritical ? 'bg-amber-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${Math.min(100, stockPercent)}%` }}
                          />
                        </div>
                        <p className="text-xs text-center mt-1 text-muted-foreground">
                          {isOutOfStock ? t('stock.outOfStock') : isCritical ? t('stock.critical') : t('pos.low')}
                        </p>
                      </div>
                      <Link to="/inventory/receive">
                        <Button size="sm" variant="outline">
                          Restock <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <p className="text-red-600 font-semibold text-2xl">
              {alerts.filter(a => parseFloat(String(a.current_stock)) <= 0).length}
            </p>
            <p className="text-red-600 text-sm">Out of Stock</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-amber-600 font-semibold text-2xl">
              {alerts.filter(a => parseFloat(String(a.current_stock)) > 0 && parseFloat(String(a.current_stock)) < a.alert_threshold * 0.3).length}
            </p>
            <p className="text-amber-600 text-sm">Critical Level</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
            <p className="text-yellow-600 font-semibold text-2xl">
              {alerts.filter(a => parseFloat(String(a.current_stock)) >= a.alert_threshold * 0.3).length}
            </p>
            <p className="text-yellow-600 text-sm">Low Stock</p>
          </div>
        </div>
      )}
    </div>
  );
}
