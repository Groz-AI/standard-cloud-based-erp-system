import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/auth';
import {
  Store, Plus, Search, Edit2, Trash2, MapPin, Phone, Mail,
  Loader2, X, Users, Package, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

interface StoreData {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  product_count: number;
}

export default function StoresPage() {
  const queryClient = useQueryClient();
  const { refreshStores, tenant } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    email: '',
    isActive: true,
  });
  
  // Store limit from tenant
  const storeLimit = tenant?.storeLimit;
  const activeStoreCount = tenant?.activeStoreCount || 0;

  const { data: storesData, isLoading } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => {
      const res = await api.get('/admin/stores');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/admin/stores', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      refreshStores(); // Update store dropdown in header
      toast({ title: 'Store Created', description: 'New store has been added successfully' });
      closeModal();
    },
    onError: (error: any) => {
      const errorData = error.response?.data;
      if (errorData?.error === 'STORE_LIMIT_REACHED') {
        toast({ 
          title: 'Store Limit Reached', 
          description: errorData.message || 'Please contact the administrator to increase your plan limit.',
          variant: 'destructive' 
        });
      } else {
        toast({ title: 'Error', description: errorData?.error || 'Failed to create store', variant: 'destructive' });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await api.put(`/admin/stores/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      refreshStores(); // Update store dropdown in header
      toast({ title: 'Store Updated', description: 'Store has been updated successfully' });
      closeModal();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update store', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/stores/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      refreshStores(); // Update store dropdown in header
      toast({ title: 'Store Deactivated', description: 'Store has been deactivated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete store', variant: 'destructive' });
    },
  });

  const stores: StoreData[] = storesData?.stores || [];

  const filteredStores = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code?.toLowerCase().includes(search.toLowerCase())
  );

  const closeModal = () => {
    setShowModal(false);
    setEditingStore(null);
    setFormData({ name: '', code: '', address: '', phone: '', email: '', isActive: true });
  };

  const openEdit = (store: StoreData) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      code: store.code || '',
      address: store.address || '',
      phone: store.phone || '',
      email: store.email || '',
      isActive: store.is_active,
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Store name is required', variant: 'destructive' });
      return;
    }
    if (editingStore) {
      updateMutation.mutate({ id: editingStore.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Store Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage your store locations</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Store Usage Indicator */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
            <span className="text-sm text-slate-600">Stores:</span>
            <span className="font-semibold">{activeStoreCount}</span>
            <span className="text-slate-400">/</span>
            <span className="font-semibold">{storeLimit ?? '∞'}</span>
            {storeLimit && activeStoreCount >= storeLimit && (
              <AlertTriangle className="h-4 w-4 text-amber-500 ml-1" />
            )}
          </div>
          <Button 
            onClick={() => setShowModal(true)} 
            className="gap-2"
            disabled={storeLimit !== null && storeLimit !== undefined && activeStoreCount >= storeLimit}
          >
            <Plus className="h-4 w-4" /> Add Store
          </Button>
        </div>
      </div>

      {/* Store Limit Warning */}
      {storeLimit && activeStoreCount >= storeLimit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Store limit reached</p>
            <p className="text-sm text-amber-700">You have reached your maximum number of stores ({storeLimit}). Please contact the administrator to increase your plan limit.</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stores..."
          className="pl-9"
        />
      </div>

      {/* Stores Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredStores.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-muted-foreground">
          <Store className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No stores found</p>
          <p className="text-sm">Add your first store to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStores.map((store) => (
            <div
              key={store.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${!store.is_active ? 'opacity-60' : ''}`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Store className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{store.name}</h3>
                      <p className="text-sm text-muted-foreground">{store.code}</p>
                    </div>
                  </div>
                  {store.is_active ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-500 text-xs bg-red-50 px-2 py-1 rounded-full">
                      <XCircle className="h-3 w-3" /> Inactive
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  {store.address && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" /> {store.address}
                    </p>
                  )}
                  {store.phone && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" /> {store.phone}
                    </p>
                  )}
                  {store.email && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" /> {store.email}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{store.user_count} users</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{store.product_count} products</span>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 bg-muted/30 border-t flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(store)}>
                  <Edit2 className="h-4 w-4 mr-1" /> Edit
                </Button>
                {store.is_active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => deleteMutation.mutate(store.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Deactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Store Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 m-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingStore ? 'Edit Store' : 'Add New Store'}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Store Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Main Branch"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Store Code</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="MAIN"
                />
                <p className="text-xs text-muted-foreground mt-1">Auto-generated if left empty</p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Address
                </label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="123 Main Street, City"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Phone
                  </label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+20 xxx xxx xxxx"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="store@company.com"
                  />
                </div>
              </div>

              {editingStore && (
                <div className="flex items-center justify-between py-3 border-t">
                  <div>
                    <p className="font-medium">Store Status</p>
                    <p className="text-sm text-muted-foreground">Enable or disable this store</p>
                  </div>
                  <button
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${formData.isActive ? 'bg-primary' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-6' : ''}`}
                    />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                {editingStore ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
