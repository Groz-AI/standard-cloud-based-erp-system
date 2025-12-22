import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/hooks/use-toast';
import { playSuccessSound, playErrorSound } from '@/lib/sounds';
import { Plus, Trash2, Package, Search, Loader2, Check, History, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Product {
  id: string;
  sku: string;
  name: string;
  cost_price: number;
}

interface ReceiveItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  costPrice: number;
}

interface PurchaseRecord {
  id: string;
  product_name: string;
  sku: string;
  quantity_delta: number;
  store_name: string;
  notes: string;
  created_at: string;
}

export default function ReceiveStockPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ReceiveItem[]>([]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  const queryClient = useQueryClient();
  const { tenant, currentStoreId } = useAuthStore();
  const location = useLocation();
  const prefillProcessed = useRef(false);

  // Handle prefill from Stock Forecast page
  useEffect(() => {
    const prefill = location.state?.prefillProduct;
    if (prefill && !prefillProcessed.current) {
      prefillProcessed.current = true;
      setItems([{
        id: crypto.randomUUID(),
        productId: prefill.id,
        productName: prefill.name,
        sku: prefill.sku,
        quantity: prefill.quantity || 1,
        costPrice: prefill.costPrice || 0,
      }]);
      toast({ title: 'Product Added', description: `${prefill.name} added with suggested quantity of ${prefill.quantity}` });
      // Clear the state to prevent re-adding on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch purchase history
  const { data: purchasesData, isLoading: purchasesLoading } = useQuery({
    queryKey: ['purchases', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/inventory/purchases', { params: { storeId: currentStoreId } });
      return res.data;
    },
  });

  const purchases: PurchaseRecord[] = purchasesData?.purchases || [];

  // Fetch products for selection
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-for-receive', search],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search, limit: 20 } });
      return res.data;
    },
    enabled: showProducts,
  });

  const products: Product[] = productsData?.products || [];

  const receiveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/inventory/receive', data);
      return res.data;
    },
    onSuccess: () => {
      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setItems([]);
      setReference('');
      setNotes('');
      toast({ title: 'Stock Received!', description: 'Inventory has been updated successfully.' });
    },
    onError: (error: any) => {
      playErrorSound();
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to receive stock', variant: 'destructive' });
    },
  });

  const addProduct = (product: Product) => {
    const existing = items.find(i => i.productId === product.id);
    if (existing) {
      setItems(items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        costPrice: product.cost_price || 0,
      }]);
    }
    setShowProducts(false);
    setSearch('');
  };

  const updateItem = (id: string, field: 'quantity' | 'costPrice', value: number) => {
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
    receiveMutation.mutate({
      storeId: currentStoreId,
      items: items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        costPrice: i.costPrice,
      })),
      reference,
      notes,
    });
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalCost = items.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('inventory.purchasing')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('inventory.purchasingDesc')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <button
          onClick={() => setActiveTab('new')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'new' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingCart className="h-4 w-4 inline mr-2" />
          {t('inventory.newPurchase')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4 inline mr-2" />
          {t('inventory.purchaseHistory')}
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-semibold">{t('inventory.purchaseHistory')}</h2>
          </div>
          {purchasesLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            </div>
          ) : purchases.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('inventory.noPurchaseHistory')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{purchase.product_name}</p>
                      <p className="text-sm text-muted-foreground">{purchase.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">+{purchase.quantity_delta}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(purchase.created_at)}</p>
                    </div>
                  </div>
                  {purchase.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{purchase.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Reference & Notes */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inventory.reference')}</label>
            <Input
              placeholder={t('inventory.referencePlaceholder')}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('inventory.notes')}</label>
            <Input
              placeholder={t('inventory.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Add Products */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t('inventory.itemsToReceive')}</h2>
          <Button onClick={() => setShowProducts(true)}>
            <Plus className="h-4 w-4 mr-2" /> {t('products.addProduct')}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('inventory.noItemsAdded')}</p>
            <p className="text-sm mt-1">{t('inventory.clickAddProduct')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">{item.sku}</p>
                </div>
                <div className="w-24">
                  <label className="text-xs text-muted-foreground">{t('inventory.qty')}</label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                    className="h-9"
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs text-muted-foreground">{t('products.costPrice')}</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.costPrice}
                    onChange={(e) => updateItem(item.id, 'costPrice', parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
                <div className="w-28 text-right">
                  <label className="text-xs text-muted-foreground">{t('inventory.lineTotal')}</label>
                  <p className="font-semibold">{formatCurrency(item.quantity * item.costPrice, tenant?.currencyCode)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="mt-6 pt-4 border-t flex items-center justify-between">
            <div>
              <p className="text-muted-foreground">{t('pos.total')}: <span className="font-semibold text-foreground">{totalItems} {t('dashboard.items')}</span></p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">{t('inventory.totalCost')}</p>
              <p className="text-2xl font-bold">{formatCurrency(totalCost, tenant?.currencyCode)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      {items.length > 0 && (
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSubmit} disabled={receiveMutation.isPending} className="px-8">
            {receiveMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Check className="h-5 w-5 mr-2" />
            )}
            {t('inventory.completePurchase')}
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
              <h2 className="text-lg font-semibold mb-3">{t('inventory.selectProduct')}</h2>
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
                  <p className="text-sm mt-1">Create products first in the Products page</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className="w-full text-left p-3 rounded-lg hover:bg-slate-100 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.sku}</p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(product.cost_price, tenant?.currencyCode)}</p>
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
