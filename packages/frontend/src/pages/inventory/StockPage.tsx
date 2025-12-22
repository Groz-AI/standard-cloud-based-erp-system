import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Loader2, Package, Search, Filter, Box, RefreshCw, AlertTriangle, XCircle, CheckCircle, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export default function StockPage() {
  const { currentStoreId } = useAuthStore();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const { data: stock, isLoading, refetch } = useQuery({
    queryKey: ['stock', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/inventory/stock', { params: { storeId: currentStoreId } });
      return res.data;
    },
  });

  const handleRefresh = () => {
    refetch();
  };

  const handleExport = () => {
    if (!filteredStock || filteredStock.length === 0) {
      alert(t('common.noData'));
      return;
    }

    // Create CSV content
    const headers = [t('stock.product'), t('stock.sku'), t('stock.onHand'), t('stock.available'), t('stock.status')];
    const rows = filteredStock.map((item: any) => {
      const qty = parseFloat(item.quantity || 0);
      const available = parseFloat(item.available_quantity || item.quantity || 0);
      const status = available === 0 ? t('stock.outOfStockFilter') : available < 10 ? t('stock.lowStockFilter') : t('stock.inStock');
      return [
        `"${item.product_name}"`,
        item.sku,
        qty.toFixed(0),
        available.toFixed(0),
        status
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row: string[]) => row.join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `stock-on-hand-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter by search term and stock status
  const filteredStock = stock?.filter((item: any) => {
    const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    const available = parseFloat(item.available_quantity || item.quantity || 0);
    
    if (stockFilter === 'out-of-stock') return available === 0;
    if (stockFilter === 'low-stock') return available > 0 && available < 10;
    if (stockFilter === 'in-stock') return available >= 10;
    
    return true; // 'all'
  }) || [];

  const totalItems = stock?.length || 0;
  const totalQuantity = stock?.reduce((acc: number, item: any) => acc + parseFloat(item.quantity || 0), 0) || 0;
  
  // Calculate stock health
  const outOfStock = stock?.filter((item: any) => parseFloat(item.available_quantity || item.quantity || 0) === 0).length || 0;
  const lowStock = stock?.filter((item: any) => {
    const avail = parseFloat(item.available_quantity || item.quantity || 0);
    return avail > 0 && avail < 10;
  }).length || 0;
  // const inStock = stock?.filter((item: any) => parseFloat(item.available_quantity || item.quantity || 0) >= 10).length || 0;
  
  // Determine overall stock status
  const getStockStatus = () => {
    if (outOfStock > 0) return { label: t('stock.critical'), color: 'text-red-600', bg: 'bg-red-50', icon: XCircle };
    if (lowStock > totalItems * 0.3) return { label: t('stock.warning'), color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle };
    return { label: t('stock.good'), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle };
  };
  
  const stockStatus = getStockStatus();

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{t('stock.title')}</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-lg">{t('stock.description')}</p>
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Button 
            onClick={handleRefresh} 
            disabled={isLoading}
            variant="outline" 
            className="bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-semibold"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          <div className="relative">
            <Button 
              variant="outline" 
              className="bg-white"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {t('common.filter')} {stockFilter !== 'all' && `(${stockFilter.replace('-', ' ')})`}
            </Button>
            {showFilterMenu && (
              <div className="absolute top-full mt-2 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-48 z-10">
                <button
                  onClick={() => { setStockFilter('all'); setShowFilterMenu(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    stockFilter === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {t('stock.allItems')}
                </button>
                <button
                  onClick={() => { setStockFilter('in-stock'); setShowFilterMenu(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    stockFilter === 'in-stock' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {t('stock.inStock')}
                </button>
                <button
                  onClick={() => { setStockFilter('low-stock'); setShowFilterMenu(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    stockFilter === 'low-stock' ? 'bg-amber-50 text-amber-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {t('stock.lowStockFilter')}
                </button>
                <button
                  onClick={() => { setStockFilter('out-of-stock'); setShowFilterMenu(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    stockFilter === 'out-of-stock' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  {t('stock.outOfStockFilter')}
                </button>
              </div>
            )}
          </div>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('common.export')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all">
          <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Package className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{t('stock.totalProducts')}</p>
            <h3 className="text-2xl font-bold text-slate-900">{totalItems}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all">
          <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Box className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{t('stock.totalUnits')}</p>
            <h3 className="text-2xl font-bold text-slate-900">{totalQuantity.toLocaleString()}</h3>
          </div>
        </div>
        <div className={cn("bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all")}>
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", stockStatus.bg)}>
            <stockStatus.icon className={cn("h-6 w-6", stockStatus.color)} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{t('stock.stockStatus')}</p>
            <h3 className={cn("text-2xl font-bold", stockStatus.color)}>{stockStatus.label}</h3>
            {outOfStock > 0 && (
              <p className="text-xs text-red-600 font-medium mt-1">{outOfStock} {t('stock.outOfStock')}</p>
            )}
            {lowStock > 0 && outOfStock === 0 && (
              <p className="text-xs text-amber-600 font-medium mt-1">{lowStock} {t('stock.lowStock')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('stock.searchPlaceholder')} 
              className="pl-10 bg-white border-slate-200 focus:border-primary/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !stock || stock.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center">
              <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                <Package className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{t('stock.noStockData')}</h3>
              <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                {t('stock.stockWillAppear')}
              </p>
            </div>
          ) : filteredStock.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              {t('stock.noProductsFound')} "{searchTerm}"
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-sm text-slate-600 w-1/2">{t('stock.product')}</th>
                  <th className="text-left py-4 px-6 font-semibold text-sm text-slate-600">{t('stock.sku')}</th>
                  <th className="text-right py-4 px-6 font-semibold text-sm text-slate-600">{t('stock.onHand')}</th>
                  <th className="text-right py-4 px-6 font-semibold text-sm text-slate-600">{t('stock.available')}</th>
                  <th className="text-center py-4 px-6 font-semibold text-sm text-slate-600">{t('stock.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredStock.map((item: any) => {
                  const qty = parseFloat(item.quantity);
                  const available = parseFloat(item.available_quantity || item.quantity);
                  const isLow = available < 10; // Simple threshold for now
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-400 font-medium">
                            {item.product_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-primary transition-colors">{item.product_name}</p>
                            <p className="text-xs text-slate-500">ID: {item.product_id?.substring(0, 8) || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{item.sku}</span>
                      </td>
                      <td className="py-4 px-6 text-right font-medium text-slate-700">
                        {qty.toFixed(0)}
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900">
                        {available.toFixed(0)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                          isLow 
                            ? "bg-amber-50 text-amber-700 border border-amber-100" 
                            : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        )}>
                          {isLow ? t('stock.lowStockFilter') : t('stock.inStock')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
