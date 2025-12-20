import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Package, Edit2, Trash2, Save, X, Loader2, 
  Barcode, Folder, DollarSign, AlertTriangle, RefreshCw
} from 'lucide-react';

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
  barcode?: string;
  reorder_point?: number;
  is_active: boolean;
}

export default function ProductDetailPage() {
  // const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant } = useAuthStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    costPrice: '',
    sellPrice: '',
    reorderPoint: '',
  });

  // Fetch product details
  const { data: product, isLoading, refetch: refetchProduct } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get(`/products/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch categories and brands
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
    refetchProduct();
    refetchCategories();
    refetchBrands();
  };

  const categories = categoriesData?.categories || [];
  const brands = brandsData?.brands || [];

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.put(`/products/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsEditing(false);
      toast({ title: 'Product updated', description: 'Changes saved successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to update', variant: 'destructive' });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product deleted', description: 'Product has been removed.' });
      navigate('/products');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to delete', variant: 'destructive' });
    },
  });

  const startEditing = () => {
    if (product) {
      setFormData({
        sku: product.sku,
        name: product.name,
        description: product.description || '',
        categoryId: product.category_id || '',
        brandId: product.brand_id || '',
        costPrice: product.cost_price?.toString() || '',
        sellPrice: product.sell_price?.toString() || '',
        reorderPoint: product.reorder_point?.toString() || '10',
      });
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      sku: formData.sku,
      name: formData.name,
      description: formData.description,
      categoryId: formData.categoryId || null,
      brandId: formData.brandId || null,
      costPrice: parseFloat(formData.costPrice) || 0,
      sellPrice: parseFloat(formData.sellPrice) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 10,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <Package className="h-16 w-16 mx-auto text-slate-300 mb-4" />
        <p className="text-lg font-medium">Product not found</p>
        <Link to="/products">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Products
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/products">
            <Button variant="ghost" size="icon" className="hover:bg-blue-100">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
              {product.name}
            </h1>
            <p className="text-gray-600 font-semibold mt-1">SKU: {product.sku}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button 
                onClick={handleRefresh}
                disabled={isLoading}
                variant="outline"
                className="font-semibold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                onClick={startEditing}
                className="font-semibold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              >
                <Edit2 className="h-4 w-4 mr-2" /> Edit
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/30 font-semibold"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} className="font-semibold">
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={updateMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30 font-semibold"
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Product Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Basic Info */}
        <div className="glass-card rounded-2xl border border-white/40 p-6 space-y-5 backdrop-blur-xl bg-white/90 shadow-lg">
          <h2 className="font-bold text-lg flex items-center gap-2 text-gray-900">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
              <Package className="h-5 w-5 text-white" />
            </div>
            Basic Information
          </h2>
          
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700">SKU</label>
                <Input 
                  value={formData.sku} 
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })} 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Name</label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Description</label>
                <Input 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">SKU</span>
                <code className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold">{product.sku}</code>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">Name</span>
                <span className="font-bold text-gray-900">{product.name}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-gray-600 font-semibold">Description</span>
                <span className="text-gray-700">{product.description || '-'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Category & Brand */}
        <div className="glass-card rounded-2xl border border-white/40 p-6 space-y-5 backdrop-blur-xl bg-white/90 shadow-lg">
          <h2 className="font-bold text-lg flex items-center gap-2 text-gray-900">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-md shadow-purple-500/30">
              <Folder className="h-5 w-5 text-white" />
            </div>
            Category & Brand
          </h2>
          
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700">Category</label>
                <select 
                  value={formData.categoryId} 
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} 
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white/80 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                >
                  <option value="">No category</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Brand</label>
                <select 
                  value={formData.brandId} 
                  onChange={(e) => setFormData({ ...formData, brandId: e.target.value })} 
                  className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white/80 text-sm font-medium focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                >
                  <option value="">No brand</option>
                  {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">Category</span>
                {product.category_name ? (
                  <span className="px-3 py-1.5 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 rounded-full text-sm font-bold">{product.category_name}</span>
                ) : <span className="text-gray-400">-</span>}
              </div>
              <div className="flex justify-between py-3">
                <span className="text-gray-600 font-semibold">Brand</span>
                {product.brand_name ? (
                  <span className="px-3 py-1.5 bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 rounded-full text-sm font-bold">{product.brand_name}</span>
                ) : <span className="text-gray-400">-</span>}
              </div>
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="glass-card rounded-2xl border border-white/40 p-6 space-y-5 backdrop-blur-xl bg-white/90 shadow-lg">
          <h2 className="font-bold text-lg flex items-center gap-2 text-gray-900">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            Pricing
          </h2>
          
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700">Cost Price</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={formData.costPrice} 
                  onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Sell Price</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={formData.sellPrice} 
                  onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })} 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">Cost Price</span>
                <span className="font-semibold text-gray-700">{formatCurrency(product.cost_price, tenant?.currencyCode)}</span>
              </div>
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">Sell Price</span>
                <span className="font-bold text-emerald-600 text-lg">{formatCurrency(product.sell_price, tenant?.currencyCode)}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-gray-600 font-semibold">Margin</span>
                <span className="font-bold text-gray-900">
                  {product.cost_price > 0 
                    ? `${(((product.sell_price - product.cost_price) / product.cost_price) * 100).toFixed(1)}%`
                    : '-'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Barcode & Inventory */}
        <div className="glass-card rounded-2xl border border-white/40 p-6 space-y-5 backdrop-blur-xl bg-white/90 shadow-lg">
          <h2 className="font-bold text-lg flex items-center gap-2 text-gray-900">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/30">
              <Barcode className="h-5 w-5 text-white" />
            </div>
            Barcode & Inventory
          </h2>
          
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-700">Reorder Point</label>
                <Input 
                  type="number" 
                  value={formData.reorderPoint} 
                  onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })} 
                  placeholder="10" 
                  className="h-11 bg-white/80 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                />
                <p className="text-xs text-gray-600 mt-1.5 font-medium">Alert when stock falls below this level</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between py-3 border-b border-gray-200/50">
                <span className="text-gray-600 font-semibold">Barcode</span>
                {product.barcode ? (
                  <code className="px-3 py-1.5 bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 rounded-lg text-sm font-bold font-mono">{product.barcode}</code>
                ) : <span className="text-gray-400">-</span>}
              </div>
              <div className="flex justify-between py-3">
                <span className="text-gray-600 font-semibold">Reorder Point</span>
                <span className="font-bold text-gray-900">{product.reorder_point || 10} units</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
            <p className="mb-6 text-gray-700">Are you sure you want to delete <strong className="text-gray-900">{product.name}</strong>?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11 font-semibold" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button 
                variant="destructive" 
                className="flex-1 h-11 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-red-500/30 font-semibold" 
                onClick={() => deleteMutation.mutate()} 
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
