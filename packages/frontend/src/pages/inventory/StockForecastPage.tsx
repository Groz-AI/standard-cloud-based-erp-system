import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore } from '@/stores/notifications';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { playSuccessSound } from '@/lib/sounds';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, TrendingUp, Package, ShoppingCart, RefreshCw,
  Bell, BellOff, ArrowUp, Clock, Zap, Info,
  ChevronRight, Search, Filter
} from 'lucide-react';

interface Recommendation {
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  current_stock: number;
  reorder_point: number;
  avg_daily_demand: number;
  forecasted_demand: number;
  days_of_stock: number;
  urgency: 'critical' | 'high' | 'medium' | 'info';
  recommendation: string;
  suggested_quantity: number;
  estimated_cost: number;
  trend: string;
}

interface Summary {
  total_products_analyzed: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts: number;
  total_estimated_cost: number;
  generated_at: string;
}

const urgencyConfig = {
  critical: {
    bg: 'bg-gradient-to-r from-red-500/20 to-red-600/10',
    border: 'border-red-500/50',
    badge: 'bg-red-500 text-white',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    pulse: true,
    label: 'Critical',
  },
  high: {
    bg: 'bg-gradient-to-r from-orange-500/20 to-orange-600/10',
    border: 'border-orange-500/50',
    badge: 'bg-orange-500 text-white',
    icon: ArrowUp,
    iconColor: 'text-orange-500',
    pulse: false,
    label: 'High',
  },
  medium: {
    bg: 'bg-gradient-to-r from-amber-500/20 to-amber-600/10',
    border: 'border-amber-500/50',
    badge: 'bg-amber-500 text-white',
    icon: Clock,
    iconColor: 'text-amber-500',
    pulse: false,
    label: 'Medium',
  },
  info: {
    bg: 'bg-gradient-to-r from-blue-500/20 to-blue-600/10',
    border: 'border-blue-500/50',
    badge: 'bg-blue-500 text-white',
    icon: Info,
    iconColor: 'text-blue-500',
    pulse: false,
    label: 'Info',
  },
};

const recommendationLabels: Record<string, string> = {
  OUT_OF_STOCK: 'Out of Stock - Immediate reorder required',
  STOCK_BELOW_DEMAND: 'Stock below tomorrow\'s forecasted demand',
  LOW_STOCK_DAYS: 'Only 3 days of stock remaining',
  BELOW_REORDER_POINT: 'Below reorder point',
  NO_RECENT_SALES: 'No sales in 30 days - Review inventory',
};

export default function StockForecastPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenant, currentStoreId } = useAuthStore();
  const { soundEnabled, toggleSound, addNotifications } = useNotificationStore();
  const [search, setSearch] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [lastNotified, setLastNotified] = useState<Set<string>>(new Set());

  // Handle creating a purchase order from recommendation
  const handleCreateOrder = (rec: Recommendation) => {
    playSuccessSound();
    // Navigate to purchasing page with product data in state
    navigate('/inventory/receive', {
      state: {
        prefillProduct: {
          id: rec.product_id,
          name: rec.product_name,
          sku: rec.sku,
          quantity: rec.suggested_quantity,
        }
      }
    });
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['stock-forecast', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/forecasting/recommendations', {
        params: { storeId: currentStoreId }
      });
      return res.data as { recommendations: Recommendation[]; summary: Summary };
    },
    enabled: !!currentStoreId,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Trigger notifications for new critical/high alerts
  useEffect(() => {
    if (data?.recommendations) {
      const criticalItems = data.recommendations.filter(
        r => (r.urgency === 'critical' || r.urgency === 'high') && !lastNotified.has(r.product_id)
      );
      
      if (criticalItems.length > 0) {
        const newNotifications = criticalItems.map(item => ({
          type: item.urgency as 'critical' | 'high',
          title: item.urgency === 'critical' ? '🚨 Critical Stock Alert' : '⚠️ Low Stock Warning',
          message: recommendationLabels[item.recommendation] || item.recommendation,
          productName: item.product_name,
          sku: item.sku,
          currentStock: item.current_stock,
          suggestedQuantity: item.suggested_quantity,
        }));
        
        addNotifications(newNotifications);
        setLastNotified(prev => new Set([...prev, ...criticalItems.map(i => i.product_id)]));
      }
    }
  }, [data?.recommendations]);

  const recommendations = data?.recommendations || [];
  const summary = data?.summary;

  // Filter recommendations
  const filteredRecommendations = recommendations.filter(r => {
    const matchesSearch = search === '' || 
      r.product_name.toLowerCase().includes(search.toLowerCase()) ||
      r.sku.toLowerCase().includes(search.toLowerCase());
    const matchesUrgency = urgencyFilter === 'all' || r.urgency === urgencyFilter;
    return matchesSearch && matchesUrgency;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            {t('inventory.stockForecast')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('inventory.forecastDesc')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleSound()}
            className={soundEnabled ? 'text-emerald-600' : 'text-muted-foreground'}
          >
            {soundEnabled ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
            {soundEnabled ? t('inventory.soundOn') : t('inventory.soundOff')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <SummaryCard
            title="Products Analyzed"
            value={summary.total_products_analyzed}
            icon={Package}
            color="bg-slate-500"
          />
          <SummaryCard
            title="Critical Alerts"
            value={summary.critical_alerts}
            icon={AlertTriangle}
            color="bg-red-500"
            pulse={summary.critical_alerts > 0}
          />
          <SummaryCard
            title="High Priority"
            value={summary.high_alerts}
            icon={ArrowUp}
            color="bg-orange-500"
          />
          <SummaryCard
            title="Medium Priority"
            value={summary.medium_alerts}
            icon={Clock}
            color="bg-amber-500"
          />
          <SummaryCard
            title="Est. Reorder Cost"
            value={formatCurrency(summary.total_estimated_cost, tenant?.currencyCode)}
            icon={ShoppingCart}
            color="bg-emerald-500"
            isText
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white rounded-xl border p-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical Only</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="info">Info</option>
          </select>
        </div>
        {summary && (
          <p className="text-sm text-muted-foreground ml-auto">
            Last updated: {new Date(summary.generated_at).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <RefreshCw className="h-12 w-12 mx-auto text-primary animate-spin" />
          <p className="mt-4 text-muted-foreground">Analyzing sales data and calculating forecasts...</p>
        </div>
      )}

      {/* Recommendations List */}
      {!isLoading && filteredRecommendations.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <TrendingUp className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">All Stock Levels Healthy</h3>
          <p className="text-muted-foreground mt-2">
            No stock recommendations at this time. All products have sufficient inventory.
          </p>
        </div>
      )}

      {!isLoading && filteredRecommendations.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          {filteredRecommendations.map((rec) => (
            <RecommendationCard
              key={rec.product_id}
              recommendation={rec}
              currency={tenant?.currencyCode}
              onCreateOrder={handleCreateOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, pulse = false, isText = false }: {
  title: string;
  value: number | string;
  icon: any;
  color: string;
  pulse?: boolean;
  isText?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${pulse ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className={`font-bold ${isText ? 'text-lg' : 'text-2xl'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation: rec, currency, onCreateOrder }: { recommendation: Recommendation; currency?: string; onCreateOrder: (rec: Recommendation) => void }) {
  const config = urgencyConfig[rec.urgency];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border-2 ${config.border} ${config.bg} p-5 transition-all hover:shadow-lg`}>
      <div className="flex items-start gap-4">
        {/* Urgency Icon */}
        <div className={`h-12 w-12 rounded-xl ${config.badge} flex items-center justify-center flex-shrink-0 ${config.pulse ? 'animate-pulse' : ''}`}>
          <Icon className="h-6 w-6" />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg truncate">{rec.product_name}</h3>
              <p className="text-sm text-muted-foreground">SKU: {rec.sku} • {rec.category || 'Uncategorized'}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.badge}`}>
              {config.label}
            </span>
          </div>

          {/* Recommendation Message */}
          <p className="mt-2 text-sm font-medium">
            {recommendationLabels[rec.recommendation] || rec.recommendation}
          </p>

          {/* Stats Grid */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatBox
              label="Current Stock"
              value={rec.current_stock}
              highlight={rec.current_stock <= 0}
            />
            <StatBox
              label="Daily Demand"
              value={rec.avg_daily_demand.toFixed(1)}
              suffix="/day"
            />
            <StatBox
              label="Tomorrow's Forecast"
              value={rec.forecasted_demand}
              suffix="units"
            />
            <StatBox
              label="Days of Stock"
              value={rec.days_of_stock === 999 ? '∞' : rec.days_of_stock}
              highlight={rec.days_of_stock <= 3}
            />
            <StatBox
              label="Suggested Order"
              value={rec.suggested_quantity}
              suffix="units"
              highlight
              positive
            />
          </div>

          {/* Action Footer */}
          {rec.suggested_quantity > 0 && (
            <div className="mt-4 pt-4 border-t border-black/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Estimated Cost:</span>
                <span className="font-semibold">{formatCurrency(rec.estimated_cost, currency)}</span>
              </div>
              <Button size="sm" className="gap-2 w-full sm:w-auto" onClick={() => onCreateOrder(rec)}>
                <span className="hidden sm:inline">Create Purchase Order</span>
                <span className="sm:hidden">Create PO</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, suffix, highlight = false, positive = false }: {
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? (positive ? 'bg-emerald-100' : 'bg-red-100') : 'bg-white/50'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? (positive ? 'text-emerald-600' : 'text-red-600') : ''}`}>
        {value}
        {suffix && <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </div>
  );
}
