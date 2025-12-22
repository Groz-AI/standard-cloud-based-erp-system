import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  Settings, Save, Building2, DollarSign, Clock, Receipt, Package,
  Loader2, AlertTriangle, Globe, Percent
} from 'lucide-react';

interface SettingsData {
  companyName: string;
  currencyCode: string;
  timezone: string;
  taxRate: number;
  receiptFooter: string;
  lowStockThreshold: number;
  allowNegativeStock: boolean;
  requireCustomer: boolean;
  autoGenerateSku: boolean;
}

const currencies = [
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
];

const timezones = [
  { id: 'Africa/Cairo', name: 'Cairo (UTC+2)' },
  { id: 'Europe/London', name: 'London (UTC+0)' },
  { id: 'America/New_York', name: 'New York (UTC-5)' },
  { id: 'Asia/Dubai', name: 'Dubai (UTC+4)' },
  { id: 'Asia/Riyadh', name: 'Riyadh (UTC+3)' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<SettingsData>({
    companyName: '',
    currencyCode: 'EGP',
    timezone: 'Africa/Cairo',
    taxRate: 14,
    receiptFooter: 'Thank you for your business!',
    lowStockThreshold: 10,
    allowNegativeStock: false,
    requireCustomer: false,
    autoGenerateSku: true,
  });
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await api.get('/admin/settings');
      return res.data;
    },
  });

  useEffect(() => {
    if (settingsData?.settings) {
      setSettings(settingsData.settings);
    }
  }, [settingsData]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsData) => {
      const res = await api.put('/admin/settings', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast({ title: 'Settings Saved', description: 'Your settings have been updated successfully' });
      setHasChanges(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    },
  });

  const handleChange = (key: keyof SettingsData, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(settings);
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-6' : ''}`}
      />
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            System Settings
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Configure your system preferences</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className="gap-2"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">You have unsaved changes</span>
        </div>
      )}

      {/* Company Settings */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Company Information</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Company Name</label>
            <Input
              value={settings.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              placeholder="Your Company Name"
            />
          </div>
        </div>
      </div>

      {/* Regional Settings */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Regional Settings</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Currency
            </label>
            <select
              value={settings.currencyCode}
              onChange={(e) => handleChange('currencyCode', e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} - {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <Clock className="h-4 w-4" /> Timezone
            </label>
            <select
              value={settings.timezone}
              onChange={(e) => handleChange('timezone', e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              {timezones.map((tz) => (
                <option key={tz.id} value={tz.id}>{tz.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
              <Percent className="h-4 w-4" /> Tax Rate (%)
            </label>
            <Input
              type="number"
              value={settings.taxRate}
              onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
              min="0"
              max="100"
              step="0.1"
            />
          </div>
        </div>
      </div>

      {/* POS Settings */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">POS Settings</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Receipt Footer Message</label>
            <Input
              value={settings.receiptFooter}
              onChange={(e) => handleChange('receiptFooter', e.target.value)}
              placeholder="Thank you for your business!"
            />
            <p className="text-xs text-muted-foreground mt-1">This message appears at the bottom of receipts</p>
          </div>
          <div className="flex items-center justify-between py-3 border-t">
            <div>
              <p className="font-medium">Require Customer for Sales</p>
              <p className="text-sm text-muted-foreground">Force selecting a customer before completing a sale</p>
            </div>
            <Toggle
              value={settings.requireCustomer}
              onChange={(v) => handleChange('requireCustomer', v)}
            />
          </div>
        </div>
      </div>

      {/* Inventory Settings */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Inventory Settings</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Low Stock Alert Threshold</label>
            <Input
              type="number"
              value={settings.lowStockThreshold}
              onChange={(e) => handleChange('lowStockThreshold', parseInt(e.target.value) || 0)}
              min="0"
            />
            <p className="text-xs text-muted-foreground mt-1">Products below this quantity will trigger low stock alerts</p>
          </div>
          <div className="flex items-center justify-between py-3 border-t">
            <div>
              <p className="font-medium">Allow Negative Stock</p>
              <p className="text-sm text-muted-foreground">Allow selling products even when stock is zero</p>
            </div>
            <Toggle
              value={settings.allowNegativeStock}
              onChange={(v) => handleChange('allowNegativeStock', v)}
            />
          </div>
          <div className="flex items-center justify-between py-3 border-t">
            <div>
              <p className="font-medium">Auto-Generate SKU</p>
              <p className="text-sm text-muted-foreground">Automatically generate SKU codes for new products</p>
            </div>
            <Toggle
              value={settings.autoGenerateSku}
              onChange={(v) => handleChange('autoGenerateSku', v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
