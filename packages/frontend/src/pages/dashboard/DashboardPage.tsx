import { useAuthStore } from '@/stores/auth';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { 
  Package, ShoppingCart, AlertTriangle, Loader2, 
  Warehouse, Receipt, BarChart3, TrendingUp,
  ArrowUpRight, Users, Clock, DollarSign, Zap, RefreshCw
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface DashboardStats {
  todaySales: number;
  orderCount: number;
  customerCount: number;
  lowStockCount: number;
  productCount: number;
  totalCustomers: number;
}

interface RecentSale {
  id: string;
  customer: string;
  items: number;
  total: number;
  date: string;
}

interface TopProduct {
  name: string;
  sales: number;
  revenue: number;
}

export default function DashboardPage() {
  const { user, tenant, currentStoreId } = useAuthStore();
  const { t } = useTranslation();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? t('dashboard.goodMorning') : currentHour < 18 ? t('dashboard.goodAfternoon') : t('dashboard.goodEvening');

  // Fetch dashboard stats from real database - auto-refresh every 30 seconds
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats', { params: { storeId: currentStoreId } });
      return res.data.data;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch recent sales from real database - auto-refresh every 30 seconds
  const { data: recentSales, isLoading: salesLoading, refetch: refetchSales } = useQuery<RecentSale[]>({
    queryKey: ['dashboard-recent-sales', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/dashboard/recent-sales', { params: { storeId: currentStoreId, limit: 5 } });
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  // Fetch top products from real database - auto-refresh every 30 seconds
  const { data: topProducts, isLoading: topProductsLoading, refetch: refetchTopProducts } = useQuery<TopProduct[]>({
    queryKey: ['dashboard-top-products', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/dashboard/top-products', { params: { storeId: currentStoreId, limit: 5 } });
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  const handleRefresh = async () => {
    await Promise.all([refetchStats(), refetchSales(), refetchTopProducts()]);
  };

  const isRefreshing = statsLoading || salesLoading || topProductsLoading;

  const statCards = [
    { 
      name: t('dashboard.todaySales'), 
      value: stats?.todaySales ?? 0, 
      icon: DollarSign, 
      isCurrency: true, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-500/10',
      trend: '+12.5%',
      trendUp: true
    },
    { 
      name: t('dashboard.ordersToday'), 
      value: stats?.orderCount ?? 0, 
      icon: ShoppingCart, 
      isCurrency: false, 
      color: 'text-blue-600', 
      bg: 'bg-blue-500/10',
      trend: '+4',
      trendUp: true
    },
    { 
      name: t('dashboard.activeCustomers'), 
      value: stats?.customerCount ?? 0, 
      icon: Users, 
      isCurrency: false, 
      color: 'text-violet-600', 
      bg: 'bg-violet-500/10',
      trend: '+2',
      trendUp: true
    },
    { 
      name: t('dashboard.lowStockAlerts'), 
      value: stats?.lowStockCount ?? 0, 
      icon: AlertTriangle, 
      isCurrency: false, 
      color: 'text-amber-600', 
      bg: 'bg-amber-500/10',
      trend: t('dashboard.actionNeeded'),
      trendUp: false
    },
  ];

  const quickActions = [
    { name: t('dashboard.openPOS'), href: '/pos', icon: ShoppingCart, color: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25' },
    { name: t('dashboard.addProduct'), href: '/products', icon: Package, color: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/25' },
    { name: t('dashboard.receiveStock'), href: '/inventory/receive', icon: Warehouse, color: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25' },
    { name: t('dashboard.analytics'), href: '/reports', icon: BarChart3, color: 'from-slate-700 to-slate-800', shadow: 'shadow-slate-500/25' },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Welcome Header - Glass Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-8 md:p-10 text-white shadow-xl shadow-indigo-500/20">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium uppercase tracking-wider">
              <Clock className="h-4 w-4" />
              <span>{formatDateTime(new Date().toISOString())}</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight">{greeting}, {user?.firstName}</h1>
            <p className="text-lg text-white/90 max-w-xl">
              {t('dashboard.storeOverview')} <span className="font-semibold text-white">{stats?.lowStockCount ?? 0} {t('dashboard.items')}</span> {t('dashboard.itemsLowStock')}.
            </p>
          </div>
          <div className="flex gap-3">
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              className="bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 shadow-none"
            >
              <RefreshCw className={`h-5 w-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
            <Link to="/inventory/forecast">
              <Button size="lg" variant="secondary" className="bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 shadow-none">
                <TrendingUp className="h-5 w-5 mr-2" />
                {t('dashboard.forecast')}
              </Button>
            </Link>
            <Link to="/pos">
              <Button size="lg" className="bg-white text-indigo-600 hover:bg-white/90 shadow-lg border-0 font-semibold">
                <ShoppingCart className="h-5 w-5 mr-2" />
                {t('dashboard.openPOS')}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6 sm:mb-8">
        {statsLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-white shadow-sm border border-slate-100 p-6 animate-pulse" />
          ))
        ) : (
          statCards.map((stat, i) => (
            <div 
              key={stat.name} 
              className="group bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                  <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">
                    {stat.isCurrency 
                      ? formatCurrency(stat.value, tenant?.currencyCode) 
                      : stat.value.toLocaleString()}
                  </h3>
                </div>
                <div className={cn("p-3 rounded-xl transition-colors group-hover:bg-opacity-20", stat.bg)}>
                  <stat.icon className={cn("h-6 w-6 transition-transform group-hover:scale-110", stat.color)} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className={cn(
                  "inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full",
                  stat.trendUp !== false ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                )}>
                  {stat.trendUp !== false ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                  {stat.trend}
                </span>
                <span className="text-xs text-slate-400">vs last 30 days</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          {t('dashboard.quickActions')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link key={action.name} to={action.href}>
              <div className={cn(
                "relative overflow-hidden group bg-gradient-to-br rounded-2xl p-6 text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer",
                action.color,
                action.shadow
              )}>
                <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 bg-white/20 rounded-full blur-2xl group-hover:bg-white/30 transition-all"></div>
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                    <action.icon className="h-7 w-7 text-white" />
                  </div>
                  <span className="font-semibold tracking-wide text-sm">{action.name}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Sales */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-slate-900">{t('dashboard.recentTransactions')}</h2>
                <p className="text-xs text-slate-500">{t('dashboard.latestSales')}</p>
              </div>
            </div>
            <Link to="/pos/receipts">
              <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                {t('common.viewAll')}
              </Button>
            </Link>
          </div>
          
          <div className="flex-1 overflow-auto">
            {salesLoading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !recentSales || recentSales.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center h-64">
                <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                  <Receipt className="h-8 w-8 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-900">{t('dashboard.noSalesYet')}</p>
                <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
                  {t('dashboard.salesAppear')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{sale.customer || t('dashboard.walkInCustomer')}</p>
                        <p className="text-xs text-slate-500 font-medium">
                          {sale.items} {sale.items !== 1 ? t('dashboard.items') : t('dashboard.item')} • {formatDateTime(sale.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{formatCurrency(sale.total, tenant?.currencyCode)}</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 mt-1">
                        Paid
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-slate-900">{t('dashboard.topProducts')}</h2>
                <p className="text-xs text-slate-500">{t('dashboard.bestSelling')}</p>
              </div>
            </div>
            <Link to="/products">
              <Button variant="ghost" size="sm" className="text-violet-600 hover:text-violet-700 hover:bg-violet-50">
                {t('common.manage')}
              </Button>
            </Link>
          </div>
          
          <div className="flex-1 overflow-auto">
            {topProductsLoading ? (
              <div className="p-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              </div>
            ) : !topProducts || topProducts.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center h-64">
                <div className="h-16 w-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                  <Package className="h-8 w-8 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-900">{t('common.noData')}</p>
                <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
                  {t('dashboard.salesAppear')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {topProducts.map((product, index) => (
                  <div key={product.name} className="p-4 px-6 flex items-center gap-4 hover:bg-slate-50/80 transition-colors group">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm transition-transform group-hover:scale-110",
                      index === 0 ? 'bg-amber-400 shadow-amber-200' : 
                      index === 1 ? 'bg-slate-400 shadow-slate-200' : 
                      index === 2 ? 'bg-orange-400 shadow-orange-200' : 'bg-slate-200 text-slate-600'
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(product.sales * 10, 100)}%` }}></div>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">{product.sales} sold</span>
                      </div>
                    </div>
                    <p className="font-bold text-slate-900">{formatCurrency(product.revenue, tenant?.currencyCode)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
