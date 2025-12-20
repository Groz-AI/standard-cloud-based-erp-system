import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useNotificationStore, StockNotification } from '@/stores/notifications';
import { Button } from '@/components/ui/button';
import {
  Bell, X, AlertTriangle, ArrowUp, Clock, Info,
  Volume2, VolumeX, Check, ChevronRight, Package, Zap
} from 'lucide-react';

const urgencyConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
    iconBg: 'bg-red-500',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: ArrowUp,
    iconBg: 'bg-orange-500',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  medium: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Clock,
    iconBg: 'bg-amber-500',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Info,
    iconBg: 'bg-blue-500',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { currentStoreId } = useAuthStore();
  const {
    notifications,
    unreadCount,
    soundEnabled,
    toggleSound,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    addNotifications,
  } = useNotificationStore();

  const [isOpen, setIsOpen] = useState(false);

  // Fetch alerts count periodically
  const { data: alertsData } = useQuery({
    queryKey: ['stock-alerts-count', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/forecasting/alerts-count', {
        params: { storeId: currentStoreId }
      });
      return res.data;
    },
    enabled: !!currentStoreId,
    refetchInterval: 60 * 1000, // Check every minute
  });

  // Fetch full recommendations when there are critical alerts
  const { data: recommendationsData } = useQuery({
    queryKey: ['stock-recommendations-brief', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/forecasting/recommendations', {
        params: { storeId: currentStoreId }
      });
      return res.data;
    },
    enabled: !!currentStoreId && (alertsData?.critical || 0) > 0,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  // Add notifications for critical items
  useEffect(() => {
    if (recommendationsData?.recommendations) {
      const criticalItems = recommendationsData.recommendations.filter(
        (r: any) => r.urgency === 'critical' || r.urgency === 'high'
      );
      
      // Only add new notifications (check by product_id to avoid duplicates)
      const existingProductIds = new Set(
        notifications
          .filter(n => !n.dismissed)
          .map(n => n.sku)
      );
      
      const newItems = criticalItems.filter(
        (item: any) => !existingProductIds.has(item.sku)
      );
      
      if (newItems.length > 0) {
        const newNotifications = newItems.slice(0, 5).map((item: any) => ({
          type: item.urgency as 'critical' | 'high',
          title: item.urgency === 'critical' ? '🚨 Critical Stock Alert' : '⚠️ Low Stock Warning',
          message: item.recommendation === 'OUT_OF_STOCK' 
            ? 'Out of stock - Immediate reorder required'
            : item.recommendation === 'STOCK_BELOW_DEMAND'
            ? 'Stock below forecasted demand'
            : 'Low stock levels detected',
          productName: item.product_name,
          sku: item.sku,
          currentStock: item.current_stock,
          suggestedQuantity: item.suggested_quantity,
        }));
        
        addNotifications(newNotifications);
      }
    }
  }, [recommendationsData]);

  const activeNotifications = notifications.filter(n => !n.dismissed);
  const criticalCount = alertsData?.critical || 0;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell className={`h-5 w-5 ${unreadCount > 0 ? 'text-primary' : 'text-slate-500'}`} />
        
        {/* Badge */}
        {(unreadCount > 0 || criticalCount > 0) && (
          <span className={`absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full text-xs font-bold flex items-center justify-center text-white ${criticalCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-primary'}`}>
            {unreadCount || criticalCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] bg-white rounded-2xl shadow-2xl border z-50 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b bg-gradient-to-r from-violet-500 to-purple-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5" />
                  <h3 className="font-semibold">Stock Alerts</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSound}
                    className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
                    title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
                  >
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Quick Stats */}
              {criticalCount > 0 && (
                <div className="mt-3 flex items-center gap-2 text-white/90 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{criticalCount} critical stock issue{criticalCount !== 1 ? 's' : ''} detected</span>
                </div>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {activeNotifications.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                    <Check className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="mt-3 font-medium">All Clear!</p>
                  <p className="text-sm text-muted-foreground mt-1">No stock alerts at the moment</p>
                </div>
              ) : (
                <div className="divide-y">
                  {activeNotifications.slice(0, 10).map((notif) => (
                    <NotificationItem
                      key={notif.id}
                      notification={notif}
                      onRead={() => markAsRead(notif.id)}
                      onDismiss={() => dismissNotification(notif.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t bg-slate-50 flex items-center justify-between">
              {activeNotifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  navigate('/inventory/forecast');
                  setIsOpen(false);
                }}
                className="ml-auto gap-1"
              >
                View All Recommendations
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
  onDismiss,
}: {
  notification: StockNotification;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const config = urgencyConfig[notification.type];
  const Icon = config.icon;

  return (
    <div
      className={`p-4 ${notification.read ? 'bg-white' : config.bg} hover:bg-slate-50 transition-colors cursor-pointer`}
      onClick={onRead}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className={`h-10 w-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-5 w-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium text-sm ${!notification.read ? config.text : ''}`}>
              {notification.title}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              <X className="h-3 w-3 text-slate-400" />
            </button>
          </div>
          
          {notification.productName && (
            <p className="text-sm font-medium mt-1 flex items-center gap-1">
              <Package className="h-3 w-3" />
              {notification.productName}
            </p>
          )}
          
          <p className="text-xs text-muted-foreground mt-1">{notification.message}</p>
          
          {notification.currentStock !== undefined && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="text-red-600 font-medium">
                Stock: {notification.currentStock}
              </span>
              {notification.suggestedQuantity && notification.suggestedQuantity > 0 && (
                <span className="text-emerald-600 font-medium">
                  Order: +{notification.suggestedQuantity}
                </span>
              )}
            </div>
          )}
          
          <p className="text-xs text-muted-foreground mt-2">
            {formatTimeAgo(notification.timestamp)}
          </p>
        </div>

        {/* Unread indicator */}
        {!notification.read && (
          <div className={`h-2 w-2 rounded-full ${config.dot} flex-shrink-0 mt-2`} />
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(date).toLocaleDateString();
}
