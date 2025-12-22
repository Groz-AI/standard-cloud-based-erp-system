import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, TrendingUp, Package, Users, DollarSign, Loader2,
  ShoppingCart, AlertTriangle, ArrowUp, ArrowDown, Percent
} from 'lucide-react';

type ReportType = 'sales' | 'inventory' | 'customers' | 'profit';

// Use local date formatting to respect Cairo timezone
const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ReportsPage() {
  const { t } = useTranslation();
  const [activeReport, setActiveReport] = useState<ReportType>('sales');
  const [dateRange, setDateRange] = useState({
    start: formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    end: formatLocalDate(new Date()),
  });

  const { tenant, currentStoreId } = useAuthStore();

  const reports = [
    { id: 'sales' as ReportType, name: t('reports.salesReport'), icon: TrendingUp, color: 'bg-blue-500' },
    { id: 'inventory' as ReportType, name: t('reports.inventoryReport'), icon: Package, color: 'bg-amber-500' },
    { id: 'customers' as ReportType, name: t('reports.customerReport'), icon: Users, color: 'bg-purple-500' },
    { id: 'profit' as ReportType, name: t('reports.profitMargins'), icon: DollarSign, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('reports.title')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('reports.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="w-32 sm:w-40 text-sm"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="w-32 sm:w-40 text-sm"
          />
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 flex-wrap overflow-x-auto pb-2">
        {reports.map((report) => (
          <Button
            key={report.id}
            variant={activeReport === report.id ? 'default' : 'outline'}
            onClick={() => setActiveReport(report.id)}
            className="gap-2"
          >
            <report.icon className="h-4 w-4" />
            {report.name}
          </Button>
        ))}
      </div>

      {/* Report Content */}
      {activeReport === 'sales' && <SalesReport dateRange={dateRange} storeId={currentStoreId || undefined} currency={tenant?.currencyCode} />}
      {activeReport === 'inventory' && <InventoryReport storeId={currentStoreId || undefined} currency={tenant?.currencyCode} />}
      {activeReport === 'customers' && <CustomerReport dateRange={dateRange} storeId={currentStoreId || undefined} currency={tenant?.currencyCode} />}
      {activeReport === 'profit' && <ProfitReport dateRange={dateRange} storeId={currentStoreId || undefined} currency={tenant?.currencyCode} />}
    </div>
  );
}

// =====================================================
// SALES REPORT COMPONENT
// =====================================================
function SalesReport({ dateRange, storeId, currency }: { dateRange: { start: string; end: string }; storeId?: string; currency?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-sales', dateRange, storeId],
    queryFn: async () => {
      const res = await api.get('/reports/sales-summary', {
        params: { startDate: dateRange.start, endDate: dateRange.end, storeId }
      });
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;

  const metrics = data?.metrics || {};
  const dailySales = data?.dailySales || [];
  const topProducts = data?.topProducts || [];
  const salesByPayment = data?.salesByPayment || [];
  const hourlyDistribution = data?.hourlyDistribution || [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(parseFloat(metrics.total_revenue) || 0, currency)}
          icon={DollarSign}
          color="bg-emerald-500"
        />
        <MetricCard
          title="Transactions"
          value={parseInt(metrics.total_transactions) || 0}
          icon={ShoppingCart}
          color="bg-blue-500"
        />
        <MetricCard
          title="Avg. Transaction"
          value={formatCurrency(parseFloat(metrics.avg_transaction) || 0, currency)}
          icon={BarChart3}
          color="bg-purple-500"
        />
        <MetricCard
          title="Discounts Given"
          value={formatCurrency(parseFloat(metrics.total_discounts) || 0, currency)}
          icon={Percent}
          color="bg-amber-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sales Chart */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Daily Sales Trend</h3>
          {dailySales.length === 0 ? (
            <EmptyState message="No sales data for this period" />
          ) : (
            <div className="space-y-2">
              {dailySales.slice(-14).map((day: any) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-24">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded"
                      style={{
                        width: `${Math.min(100, (parseFloat(day.revenue) / Math.max(...dailySales.map((d: any) => parseFloat(d.revenue) || 1))) * 100)}%`
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-24 text-right">
                    {formatCurrency(parseFloat(day.revenue) || 0, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Top Selling Products</h3>
          {topProducts.length === 0 ? (
            <EmptyState message="No product sales data" />
          ) : (
            <div className="space-y-3">
              {topProducts.map((product: any, idx: number) => (
                <div key={product.sku} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.units_sold} units</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(parseFloat(product.revenue) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment Methods & Peak Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Sales by Payment Method</h3>
          {salesByPayment.length === 0 ? (
            <EmptyState message="No payment data" />
          ) : (
            <div className="space-y-3">
              {salesByPayment.map((method: any) => (
                <div key={method.payment_method} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium capitalize">{method.payment_method || 'Cash'}</p>
                    <p className="text-sm text-muted-foreground">{method.transactions} transactions</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(parseFloat(method.revenue) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Peak Hours */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Peak Sales Hours</h3>
          {hourlyDistribution.length === 0 ? (
            <EmptyState message="No hourly data" />
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: 24 }, (_, h) => {
                const hourData = hourlyDistribution.find((d: any) => parseInt(d.hour) === h);
                const maxRevenue = Math.max(...hourlyDistribution.map((d: any) => parseFloat(d.revenue) || 0), 1);
                const intensity = hourData ? (parseFloat(hourData.revenue) / maxRevenue) : 0;
                return (
                  <div
                    key={h}
                    className="aspect-square rounded flex items-center justify-center text-xs"
                    style={{
                      backgroundColor: intensity > 0 ? `rgba(59, 130, 246, ${0.2 + intensity * 0.8})` : '#f1f5f9',
                      color: intensity > 0.5 ? 'white' : 'inherit'
                    }}
                    title={`${h}:00 - ${formatCurrency(parseFloat(hourData?.revenue) || 0, currency)}`}
                  >
                    {h}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3 text-center">Hour of day (0-23) - Darker = Higher sales</p>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// INVENTORY REPORT COMPONENT
// =====================================================
function InventoryReport({ storeId, currency }: { storeId?: string; currency?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory', storeId],
    queryFn: async () => {
      const res = await api.get('/reports/inventory', { params: { storeId } });
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;

  const summary = data?.summary || {};
  const lowStockItems = data?.lowStockItems || [];
  const outOfStockCount = data?.outOfStockCount || 0;
  const stockByCategory = data?.stockByCategory || [];
  const recentMovements = data?.recentMovements || [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Products"
          value={parseInt(summary.total_products) || 0}
          icon={Package}
          color="bg-blue-500"
        />
        <MetricCard
          title="Total Units"
          value={parseInt(summary.total_units) || 0}
          icon={BarChart3}
          color="bg-purple-500"
        />
        <MetricCard
          title="Stock Value (Cost)"
          value={formatCurrency(parseFloat(summary.total_value) || 0, currency)}
          icon={DollarSign}
          color="bg-emerald-500"
        />
        <MetricCard
          title="Out of Stock"
          value={outOfStockCount}
          icon={AlertTriangle}
          color="bg-red-500"
          alert={outOfStockCount > 0}
        />
      </div>

      {/* Stock Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Low Stock Alerts
          </h3>
          {lowStockItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>All products are well stocked!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {lowStockItems.map((item: any) => (
                <div key={item.sku} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600">{item.current_stock}</p>
                    <p className="text-xs text-muted-foreground">Reorder: {item.reorder_point}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock by Category */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Stock by Category</h3>
          {stockByCategory.length === 0 ? (
            <EmptyState message="No category data" />
          ) : (
            <div className="space-y-3">
              {stockByCategory.map((cat: any) => (
                <div key={cat.category} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium">{cat.category}</p>
                    <p className="text-xs text-muted-foreground">{cat.products} products, {cat.units} units</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(parseFloat(cat.value) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold mb-4">Stock Movement Summary (Last 30 Days)</h3>
        {recentMovements.length === 0 ? (
          <EmptyState message="No recent stock movements" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recentMovements.map((mov: any) => (
              <div key={mov.reference_type} className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground capitalize">{mov.reference_type.replace('_', ' ')}</p>
                <p className="text-2xl font-bold">{mov.count}</p>
                <p className="text-sm text-muted-foreground">{mov.units} units</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// CUSTOMER REPORT COMPONENT
// =====================================================
function CustomerReport({ dateRange, storeId, currency }: { dateRange: { start: string; end: string }; storeId?: string; currency?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-customers', dateRange, storeId],
    queryFn: async () => {
      const res = await api.get('/reports/customers', {
        params: { startDate: dateRange.start, endDate: dateRange.end, storeId }
      });
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;

  const summary = data?.summary || {};
  const topCustomers = data?.topCustomers || [];
  const customerTypes = data?.customerTypes || [];
  const walkInVsRegistered = data?.walkInVsRegistered || [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Total Customers"
          value={parseInt(summary.total_customers) || 0}
          icon={Users}
          color="bg-purple-500"
        />
        <MetricCard
          title="Active This Period"
          value={parseInt(summary.active_customers) || 0}
          icon={TrendingUp}
          color="bg-emerald-500"
        />
        <MetricCard
          title="Customer Engagement"
          value={summary.total_customers > 0 ? `${Math.round((summary.active_customers / summary.total_customers) * 100)}%` : '0%'}
          icon={Percent}
          color="bg-blue-500"
        />
      </div>

      {/* Customer Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Top Customers</h3>
          {topCustomers.length === 0 ? (
            <EmptyState message="No customer purchase data" />
          ) : (
            <div className="space-y-3">
              {topCustomers.map((customer: any, idx: number) => (
                <div key={customer.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{customer.first_name} {customer.last_name}</p>
                    <p className="text-xs text-muted-foreground">{customer.total_orders} orders</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(parseFloat(customer.total_spent) || 0, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Types */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Customer Analysis</h3>
          <div className="space-y-4">
            {/* New vs Returning */}
            <div>
              <p className="text-sm font-medium mb-2">New vs Returning Customers</p>
              {customerTypes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No data</p>
              ) : (
                <div className="flex gap-4">
                  {customerTypes.map((type: any) => (
                    <div key={type.customer_type} className={`flex-1 p-4 rounded-lg ${type.customer_type === 'new' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                      <p className="text-sm font-medium capitalize">{type.customer_type}</p>
                      <p className="text-2xl font-bold">{type.count}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(parseFloat(type.revenue) || 0, currency)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Walk-in vs Registered */}
            <div>
              <p className="text-sm font-medium mb-2">Walk-in vs Registered</p>
              {walkInVsRegistered.length === 0 ? (
                <p className="text-muted-foreground text-sm">No data</p>
              ) : (
                <div className="flex gap-4">
                  {walkInVsRegistered.map((type: any) => (
                    <div key={type.type} className={`flex-1 p-4 rounded-lg ${type.type === 'Registered' ? 'bg-purple-50' : 'bg-slate-50'}`}>
                      <p className="text-sm font-medium">{type.type}</p>
                      <p className="text-2xl font-bold">{type.transactions}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(parseFloat(type.revenue) || 0, currency)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PROFIT REPORT COMPONENT
// =====================================================
function ProfitReport({ dateRange, storeId, currency }: { dateRange: { start: string; end: string }; storeId?: string; currency?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['report-profit', dateRange, storeId],
    queryFn: async () => {
      const res = await api.get('/reports/profit', {
        params: { startDate: dateRange.start, endDate: dateRange.end, storeId }
      });
      return res.data;
    },
  });

  if (isLoading) return <LoadingState />;

  const metrics = data?.metrics || {};
  const profitByProduct = data?.profitByProduct || [];
  const profitByCategory = data?.profitByCategory || [];
  const dailyProfit = data?.dailyProfit || [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue || 0, currency)}
          icon={DollarSign}
          color="bg-blue-500"
        />
        <MetricCard
          title="Total Cost"
          value={formatCurrency(metrics.totalCost || 0, currency)}
          icon={ArrowDown}
          color="bg-red-500"
        />
        <MetricCard
          title="Gross Profit"
          value={formatCurrency(metrics.grossProfit || 0, currency)}
          icon={ArrowUp}
          color="bg-emerald-500"
        />
        <MetricCard
          title="Profit Margin"
          value={`${metrics.marginPercent || 0}%`}
          icon={Percent}
          color="bg-purple-500"
        />
      </div>

      {/* Profit Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Profitable Products */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Most Profitable Products</h3>
          {profitByProduct.length === 0 ? (
            <EmptyState message="No profit data" />
          ) : (
            <div className="space-y-3">
              {profitByProduct.map((product: any, idx: number) => {
                const margin = product.revenue > 0 ? ((product.profit / product.revenue) * 100).toFixed(1) : 0;
                return (
                  <div key={product.sku} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs flex items-center justify-center font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.units_sold} sold · {margin}% margin</p>
                    </div>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(parseFloat(product.profit) || 0, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Profit by Category */}
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h3 className="font-semibold mb-4">Profit by Category</h3>
          {profitByCategory.length === 0 ? (
            <EmptyState message="No category profit data" />
          ) : (
            <div className="space-y-3">
              {profitByCategory.map((cat: any) => {
                const margin = cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0;
                return (
                  <div key={cat.category} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium">{cat.category}</p>
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(parseFloat(cat.profit) || 0, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Revenue: {formatCurrency(parseFloat(cat.revenue) || 0, currency)}</span>
                      <span>{margin}% margin</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daily Profit Trend */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-semibold mb-4">Daily Profit Trend</h3>
        {dailyProfit.length === 0 ? (
          <EmptyState message="No daily profit data" />
        ) : (
          <div className="space-y-2">
            {dailyProfit.slice(-14).map((day: any) => (
              <div key={day.date} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-24">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded"
                    style={{
                      width: `${Math.min(100, (parseFloat(day.profit) / Math.max(...dailyProfit.map((d: any) => parseFloat(d.profit) || 1))) * 100)}%`
                    }}
                  />
                </div>
                <span className="text-sm font-medium w-24 text-right text-emerald-600">
                  {formatCurrency(parseFloat(day.profit) || 0, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================
// HELPER COMPONENTS
// =====================================================
function MetricCard({ title, value, icon: Icon, color, alert = false }: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-6 ${alert ? 'border-red-300' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`text-2xl font-bold ${alert ? 'text-red-600' : ''}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
      <p className="mt-4 text-muted-foreground">Loading report data...</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
      <p>{message}</p>
    </div>
  );
}
