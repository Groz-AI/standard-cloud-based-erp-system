import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/hooks/use-toast';
import { Plus, Search, Package, X, Loader2, Edit2, Trash2, AlertTriangle, DollarSign, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  brand_id?: string;
  brand_name?: string;
  cost_price: number;
  sell_price: number;
  stock_quantity?: number;
  available_quantity?: number;
}

interface Category { id: string; name: string; }
interface Brand { id: string; name: string; }

export default function ProductsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    costPrice: '',
    sellPrice: '',
  });
  
  const queryClient = useQueryClient();
  const { tenant, currentStoreId } = useAuthStore();

  const { data, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['products', search, currentStoreId],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search, storeId: currentStoreId } });
      return res.data;
    },
  });

  // Fetch categories and brands for dropdowns
  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return res.data;
    },
  });

  const { data: brandsData, refetch: refetchBrands } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await api.get('/brands');
      return res.data;
    },
  });

  const handleRefresh = () => {
    refetchProducts();
    refetchCategories();
    refetchBrands();
  };

  const categories: Category[] = categoriesData?.categories || [];
  const brands: Brand[] = brandsData?.brands || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/products', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
      toast({ title: 'Product created', description: 'Product has been added successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create product', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/products/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
      toast({ title: 'Product updated', description: 'Changes saved successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to update product', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirm(null);
      toast({ title: 'Product deleted', description: 'Product has been removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to delete product', variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingProduct(null);
    setFormData({ sku: '', name: '', description: '', categoryId: '', brandId: '', costPrice: '', sellPrice: '' });
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      categoryId: product.category_id || '',
      brandId: product.brand_id || '',
      costPrice: product.cost_price?.toString() || '',
      sellPrice: product.sell_price?.toString() || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    setFormData({ sku: '', name: '', description: '', categoryId: '', brandId: '', costPrice: '', sellPrice: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      sku: formData.sku,
      name: formData.name,
      description: formData.description,
      categoryId: formData.categoryId || null,
      brandId: formData.brandId || null,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0,
    };
    
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const products = data?.products || [];

  const totalValue = products.reduce((sum: number, p: Product) => sum + (p.sell_price * (p.available_quantity || 0)), 0);
  // const avgPrice = products.length > 0 ? products.reduce((sum: number, p: Product) => sum + p.sell_price, 0) / products.length : 0;
  const lowStockCount = products.filter((p: Product) => (p.available_quantity || 0) < 10).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
            {t('products.title')}
          </h1>
          <p className="text-gray-600 mt-1 font-medium">
            {t('products.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleRefresh}
            disabled={isLoading}
            variant="outline"
            className="h-11 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-semibold"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
          <Button 
            onClick={openCreate} 
            className="h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30 font-semibold transition-all hover:scale-105"
          >
            <Plus className="h-4 w-4 mr-2" /> {t('products.addProduct')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl border border-white/40 p-5 backdrop-blur-xl bg-gradient-to-br from-blue-50/80 to-white/80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">{t('products.totalProducts')}</p>
              <p className="text-3xl font-bold text-gray-900">{products.length}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-white/40 p-5 backdrop-blur-xl bg-gradient-to-br from-emerald-50/80 to-white/80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">{t('products.catalogValue')}</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalValue, tenant?.currencyCode)}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-white/40 p-5 backdrop-blur-xl bg-gradient-to-br from-amber-50/80 to-white/80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">{t('products.lowStockItems')}</p>
              <p className="text-3xl font-bold text-gray-900">{lowStockCount}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder={t('products.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12 h-12 bg-white/80 border-gray-200 rounded-xl shadow-sm focus:shadow-md transition-shadow font-medium"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="glass-card rounded-2xl border border-white/40 shadow-xl backdrop-blur-xl bg-white/90 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-2">{t('common.loading')}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-16 text-center">
            <div className="inline-flex items-center justify-center h-24 w-24 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 mx-auto mb-6">
              <Package className="h-12 w-12 text-blue-600" />
            </div>
            <p className="font-bold text-xl text-gray-900 mb-2">{t('common.noData')}</p>
            <p className="text-gray-600 font-medium mb-6">{t('products.subtitle')}</p>
            <Button 
              onClick={() => setShowModal(true)} 
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30"
            >
              <Plus className="h-4 w-4 mr-2" /> {t('products.addProduct')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
            <thead className="border-b border-gray-200/50 bg-gradient-to-r from-gray-50/80 to-white/80">
              <tr>
                <th className="text-left p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.name')}</th>
                <th className="text-left p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.sku')}</th>
                <th className="text-left p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.category')}</th>
                <th className="text-left p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.brand')}</th>
                <th className="text-right p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.costPrice')}</th>
                <th className="text-right p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.sellPrice')}</th>
                <th className="text-right p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.stock')}</th>
                <th className="text-right p-4 font-bold text-gray-700 text-sm uppercase tracking-wide">{t('products.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((product: Product) => (
                <tr key={product.id} className="hover:bg-blue-50/30 transition-all duration-200">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                        <Package className="h-5 w-5 text-white" />
                      </div>
                      <Link to={`/products/${product.id}`} className="font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                        {product.name}
                      </Link>
                    </div>
                  </td>
                  <td className="p-4">
                    <code className="px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold">{product.sku}</code>
                  </td>
                  <td className="p-4">
                    {product.category_name ? (
                      <span className="px-3 py-1.5 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 rounded-full text-sm font-semibold">{product.category_name}</span>
                    ) : (
                      <span className="text-gray-400 font-medium">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    {product.brand_name ? (
                      <span className="px-3 py-1.5 bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 rounded-full text-sm font-semibold">{product.brand_name}</span>
                    ) : (
                      <span className="text-gray-400 font-medium">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right text-gray-600 font-semibold">{formatCurrency(product.cost_price, tenant?.currencyCode)}</td>
                  <td className="p-4 text-right">
                    <span className="font-bold text-emerald-600 text-lg">{formatCurrency(product.sell_price, tenant?.currencyCode)}</span>
                  </td>
                  <td className="p-4 text-right">
                    <span className={`px-2.5 py-1 rounded-lg font-bold ${(product.available_quantity || 0) <= 0 ? 'bg-red-100 text-red-700' : (product.available_quantity || 0) < 10 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                      {product.available_quantity ?? 0}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" className="hover:bg-blue-100 hover:text-blue-700" onClick={() => openEdit(product)} title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-100" onClick={() => setDeleteConfirm(product)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md mx-4 border border-white/40">
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
              <h2 className="text-xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">SKU *</label>
                <Input
                  placeholder="PROD-001"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  required
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Product Name *</label>
                <Input
                  placeholder="Product name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Description</label>
                <Input
                  placeholder="Product description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white/80 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Brand</label>
                  <select
                    value={formData.brandId}
                    onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white/80 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                  >
                    <option value="">Select brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Cost Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                    className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Sell Price *</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.sellPrice}
                    onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
                    required
                    className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1 h-11 font-semibold" onClick={closeModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30 font-semibold" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card bg-white/95 backdrop-blur-xl rounded-3xl p-6 max-w-md mx-4 border border-white/40 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-gray-900">Delete Product?</h3>
                <p className="text-gray-600 text-sm font-medium">This action cannot be undone.</p>
              </div>
            </div>
            <p className="mb-6 text-gray-700">Are you sure you want to delete <strong className="text-gray-900">{deleteConfirm.name}</strong>?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11 font-semibold" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button 
                variant="destructive" 
                className="flex-1 h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/30 font-semibold" 
                onClick={() => deleteMutation.mutate(deleteConfirm.id)} 
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
