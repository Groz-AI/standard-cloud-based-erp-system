import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/hooks/use-toast';
import { playSuccessSound, playErrorSound } from '@/lib/sounds';
import { Plus, Trash2, Package, Search, Loader2, Check, History, ArrowLeftRight, ArrowRight, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface TransferItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
}

interface TransferRecord {
  id: string;
  product_name: string;
  sku: string;
  quantity_delta: number;
  store_name: string;
  reference_type: string;
  notes: string;
  created_at: string;
}

export default function TransfersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [showProducts, setShowProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  const queryClient = useQueryClient();
  const { stores, currentStoreId } = useAuthStore();

  // Set default from store
  useState(() => {
    if (currentStoreId && !fromStoreId) {
      setFromStoreId(currentStoreId);
    }
  });

  // Fetch transfer history
  const { data: transfersData, isLoading: transfersLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const res = await api.get('/inventory/transfers');
      return res.data;
    },
  });

  const transfers: TransferRecord[] = transfersData?.transfers || [];

  // Fetch products for selection
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-for-transfer', search],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search } });
      return res.data;
    },
    enabled: showProducts,
  });

  const products: Product[] = productsData?.products || [];

  const transferMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/inventory/transfers', data);
      return res.data;
    },
    onSuccess: () => {
      playSuccessSound();
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setItems([]);
      setNotes('');
      toast({ title: 'Stock Transferred!', description: 'Items have been moved successfully.' });
    },
    onError: (error: any) => {
      playErrorSound();
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to transfer stock', variant: 'destructive' });
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
    }]);
    setShowProducts(false);
    setSearch('');
  };

  const updateItem = (id: string, quantity: number) => {
    setItems(items.map(i => i.id === id ? { ...i, quantity } : i));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      toast({ title: 'Error', description: 'Add at least one product', variant: 'destructive' });
      return;
    }
    if (!fromStoreId) {
      toast({ title: 'Error', description: 'Select source store', variant: 'destructive' });
      return;
    }
    if (!toStoreId) {
      toast({ title: 'Error', description: 'Select destination store', variant: 'destructive' });
      return;
    }
    if (fromStoreId === toStoreId) {
      toast({ title: 'Error', description: 'Source and destination must be different', variant: 'destructive' });
      return;
    }
    transferMutation.mutate({
      fromStoreId,
      toStoreId,
      items: items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
      notes,
    });
  };

  const fromStore = stores.find(s => s.id === fromStoreId);
  const toStore = stores.find(s => s.id === toStoreId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('inventory.stockTransfers')}</h1>
          <p className="text-muted-foreground">{t('inventory.transfersDesc')}</p>
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
          <ArrowLeftRight className="h-4 w-4 inline mr-2" />
          {t('inventory.newTransfer')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4 inline mr-2" />
          {t('inventory.transferHistory')}
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-semibold">{t('inventory.transferHistory')}</h2>
          </div>
          {transfersLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('inventory.noTransferHistory')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {transfers.map((transfer) => (
                <div key={transfer.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{transfer.product_name}</p>
                      <p className="text-sm text-muted-foreground">{transfer.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${transfer.reference_type === 'transfer_in' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {transfer.reference_type === 'transfer_in' ? 'IN' : 'OUT'} {Math.abs(transfer.quantity_delta)}
                      </p>
                      <p className="text-xs text-muted-foreground">{transfer.store_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(transfer.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Store Selection */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Store className="h-4 w-4" /> From Store *
                </label>
                <select
                  value={fromStoreId}
                  onChange={(e) => setFromStoreId(e.target.value)}
                  className="w-full h-10 border rounded-md px-3"
                >
                  <option value="">Select source store</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Store className="h-4 w-4" /> To Store *
                </label>
                <select
                  value={toStoreId}
                  onChange={(e) => setToStoreId(e.target.value)}
                  className="w-full h-10 border rounded-md px-3"
                >
                  <option value="">Select destination store</option>
                  {stores.filter(s => s.id !== fromStoreId).map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {fromStore && toStore && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-sm text-blue-700">
                  Transferring from <strong>{fromStore.name}</strong> to <strong>{toStore.name}</strong>
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input
                placeholder="e.g., Restocking branch, Return to warehouse..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Add Products */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Items to Transfer</h2>
              <Button onClick={() => setShowProducts(true)} disabled={!fromStoreId}>
                <Plus className="h-4 w-4 mr-2" /> Add Product
              </Button>
            </div>

            {!fromStoreId ? (
              <div className="text-center py-12 text-muted-foreground">
                <Store className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a source store first</p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No items added yet</p>
                <p className="text-sm mt-1">Click "Add Product" to select products to transfer</p>
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
                      <label className="text-xs text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, parseInt(e.target.value) || 1)}
                        className="h-9"
                      />
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
          {items.length > 0 && fromStoreId && toStoreId && (
            <div className="flex justify-end">
              <Button size="lg" onClick={handleSubmit} disabled={transferMutation.isPending} className="px-8">
                {transferMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Check className="h-5 w-5 mr-2" />
                )}
                Complete Transfer
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
