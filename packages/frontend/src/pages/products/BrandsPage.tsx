import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Plus, X, Loader2, Tag, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Brand {
  id: string;
  code: string;
  name: string;
}

export default function BrandsPage() {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const res = await api.get('/brands');
      return res.data;
    },
  });
  
  const brands = data?.brands || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/brands', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      closeModal();
      toast({ title: t('brands.created'), description: t('brands.createdDesc') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error') || 'Error', description: error.response?.data?.error || 'Failed to create brand', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/brands/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      closeModal();
      toast({ title: t('brands.updated'), description: t('brands.updatedDesc') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error') || 'Error', description: error.response?.data?.error || 'Failed to update', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/brands/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setDeleteConfirm(null);
      toast({ title: t('brands.deleted'), description: t('brands.deletedDesc') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error') || 'Error', description: error.response?.data?.error || 'Failed to delete', variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setEditingBrand(null);
    setFormData({ code: '', name: '' });
    setShowModal(true);
  };

  const openEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({ code: brand.code || '', name: brand.name });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBrand(null);
    setFormData({ code: '', name: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBrand) {
      updateMutation.mutate({ id: editingBrand.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('brands.title')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('brands.manage')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> <span className="hidden sm:inline">{t('brands.addBrand')}</span><span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
        ) : !brands || brands.length === 0 ? (
          <div className="p-8 text-center">
            <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('brands.noBrands')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('brands.clickAddBrand')}</p>
          </div>
        ) : (
          <div className="divide-y">
            {brands.map((brand: Brand) => (
              <div key={brand.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Tag className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium">{brand.name}</p>
                    <p className="text-sm text-muted-foreground">{brand.code || t('brands.noCode')}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(brand)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setDeleteConfirm(brand)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold">{editingBrand ? t('brands.editBrand') : t('brands.addNewBrand')}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('brands.code')}</label>
                <Input placeholder="BRD-001" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('brands.name')} *</label>
                <Input placeholder={t('brands.brandName')} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={closeModal}>{t('common.cancel')}</Button>
                <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingBrand ? t('brands.saveChanges') : t('brands.create')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{t('brands.deleteBrand')}</h3>
                <p className="text-muted-foreground text-sm">{t('brands.cannotUndo')}</p>
              </div>
            </div>
            <p className="mb-6">{t('brands.deleteConfirm')} <strong>{deleteConfirm.name}</strong>?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>{t('common.cancel')}</Button>
              <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
