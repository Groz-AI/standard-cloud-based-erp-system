import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/hooks/use-toast';
import { playSuccessSound, playErrorSound } from '@/lib/sounds';
import { Plus, Trash2, Package, Search, Loader2, Check, History, ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface AdjustmentItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  type: 'add' | 'remove';
}

interface AdjustmentRecord {
  id: string;
  product_name: string;
  sku: string;
  quantity_delta: number;
  store_name: string;
  notes: string;
  created_at: string;
}

export default function AdjustmentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [reason, setReason] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  const queryClient = useQueryClient();
  const { currentStoreId } = useAuthStore();

  // Fetch adjustment history
  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ['adjustments', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/inventory/adjustments', { params: { storeId: currentStoreId } });
      return res.data;
    },
  });

  const adjustments: AdjustmentRecord[] = adjustmentsData?.adjustments || [];

  // Fetch products for selection
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-for-adjust', search],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search } });
      return res.data;
    },
    enabled: showProducts,
  });

  const products: Product[] = productsData?.products || [];

  const adjustMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/inventory/adjustments', data);
      return res.data;
    },
    onSuccess: () => {
      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setItems([]);
      setReason('');
      toast({ title: 'Stock Adjusted!', description: 'Inventory has been updated successfully.' });
    },
    onError: (error: any) => {
      playErrorSound();
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to adjust stock', variant: 'destructive' });
    },
  });

  const addProduct = (product: Product) => {
    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      toast({ title: 'Already added', description: 'This product is already in the list', variant: 'destructive' });
      return;
    }
    setItems([...items, {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: 1,
      type: 'add',
    }]);
    setShowProducts(false);
    setSearch('');
  };

  const updateItem = (id: string, field: 'quantity' | 'type', value: number | string) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      toast({ title: 'Error', description: 'Add at least one product', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for adjustment', variant: 'destructive' });
      return;
    }
    adjustMutation.mutate({
      storeId: currentStoreId,
      items: items.map(i => ({
        productId: i.productId,
        quantity: i.type === 'add' ? i.quantity : -i.quantity,
      })),
      reason,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('inventory.stockAdjustments')}</h1>
          <p className="text-muted-foreground">{t('inventory.adjustmentsDesc')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ArrowUpDown className="h-4 w-4 inline mr-2" />
          {t('inventory.newAdjustment')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4 inline mr-2" />
          {t('inventory.adjustmentHistory')}
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-semibold">{t('inventory.adjustmentHistory')}</h2>
          </div>
          {adjustmentsLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('inventory.noAdjustmentHistory')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {adjustments.map((adj) => (
                <div key={adj.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{adj.product_name}</p>
                      <p className="text-sm text-muted-foreground">{adj.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${adj.quantity_delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {adj.quantity_delta >= 0 ? '+' : ''}{adj.quantity_delta}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(adj.created_at)}</p>
                    </div>
                  </div>
                  {adj.notes && (
                    <p className="text-sm text-muted-foreground mt-1">Reason: {adj.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Reason */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Adjustment *</label>
              <Input
                placeholder="e.g., Stock count correction, Damaged goods, Shrinkage..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          {/* Add Products */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Items to Adjust</h2>
              <Button onClick={() => setShowProducts(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Product
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No items added yet</p>
                <p className="text-sm mt-1">Click "Add Product" to select products to adjust</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">{item.sku}</p>
                    </div>
                    <div className="w-32">
                      <label className="text-xs text-muted-foreground">Type</label>
                      <select
                        value={item.type}
                        onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                        className="w-full h-9 border rounded-md px-2 text-sm"
                      >
                        <option value="add">Add (+)</option>
                        <option value="remove">Remove (-)</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                        className="h-9"
                      />
                    </div>
                    <div className="w-20 text-center">
                      {item.type === 'add' ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" /> +{item.quantity}
                        </span>
                      ) : (
                        <span className="text-red-600 font-semibold flex items-center gap-1">
                          <TrendingDown className="h-4 w-4" /> -{item.quantity}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          {items.length > 0 && (
            <div className="flex justify-end">
              <Button size="lg" onClick={handleSubmit} disabled={adjustMutation.isPending} className="px-8">
                {adjustMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Check className="h-5 w-5 mr-2" />
                )}
                Apply Adjustment
              </Button>
            </div>
          )}
        </>
      )}

      {/* Product Selection Modal */}
      {showProducts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold mb-3">Select Product</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {productsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No products found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className="w-full text-left p-3 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.sku}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t">
              <Button variant="outline" className="w-full" onClick={() => { setShowProducts(false); setSearch(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
