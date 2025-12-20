import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  Building2, Users, Store, Plus, Edit, Key, Ban, CheckCircle,
  Loader2, Shield, X, Eye, EyeOff
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  store_limit: number | null;
  active_store_count: number;
  admin_email: string;
  admin_name: string;
  created_at: string;
}

interface Stats {
  active_tenants: number;
  suspended_tenants: number;
  total_tenants: number;
  total_stores: number;
  total_users: number;
}

export default function SuperAdminDashboard() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [newTenant, setNewTenant] = useState({
    tenantName: '',
    adminEmail: '',
    adminPassword: '',
    adminFirstName: '',
    adminLastName: '',
    storeLimit: '',
    currency: 'EGP'
  });

  const [editLimit, setEditLimit] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetUserId, setResetUserId] = useState('');

  // Fetch stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      const res = await api.get('/super-admin/stats');
      return res.data;
    },
  });

  // Fetch tenants
  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const res = await api.get('/super-admin/tenants');
      return res.data;
    },
  });

  const tenants: Tenant[] = tenantsData?.tenants || [];

  // Create tenant mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newTenant) => {
      const res = await api.post('/super-admin/tenants', {
        ...data,
        storeLimit: data.storeLimit ? parseInt(data.storeLimit) : null
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] });
      setShowCreateModal(false);
      setNewTenant({ tenantName: '', adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '', storeLimit: '', currency: 'EGP' });
      toast({ title: 'Tenant Created', description: 'New tenant account has been created successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create tenant', variant: 'destructive' });
    },
  });

  // Update tenant mutation
  const updateMutation = useMutation({
    mutationFn: async ({ tenantId, data }: { tenantId: string; data: any }) => {
      const res = await api.patch(`/super-admin/tenants/${tenantId}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-tenants'] });
      setShowEditModal(false);
      setSelectedTenant(null);
      toast({ title: 'Tenant Updated', description: 'Tenant settings have been updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to update tenant', variant: 'destructive' });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ tenantId, userId, newPassword }: { tenantId: string; userId: string; newPassword: string }) => {
      const res = await api.post(`/super-admin/tenants/${tenantId}/reset-password`, { userId, newPassword });
      return res.data;
    },
    onSuccess: () => {
      setShowResetModal(false);
      setResetPassword('');
      toast({ title: 'Password Reset', description: 'User password has been reset. They will need to change it on next login.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to reset password', variant: 'destructive' });
    },
  });

  const handleEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setEditLimit(tenant.store_limit?.toString() || '');
    setEditStatus(tenant.status);
    setShowEditModal(true);
  };

  const handleResetPassword = async (tenant: Tenant) => {
    // Fetch tenant details to get admin user ID
    try {
      const res = await api.get(`/super-admin/tenants/${tenant.id}`);
      const adminUser = res.data.users[0];
      if (adminUser) {
        setSelectedTenant(tenant);
        setResetUserId(adminUser.id);
        setShowResetModal(true);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load tenant details', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium"><CheckCircle className="h-3 w-3" /> Active</span>;
      case 'suspended':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium"><Ban className="h-3 w-3" /> Suspended</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-amber-400" />
            <div>
              <h1 className="text-xl font-bold">Super Admin Dashboard</h1>
              <p className="text-sm text-slate-400">System Administration</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={logout} 
            className="bg-slate-800 text-white border-slate-600 hover:bg-slate-700"
          >
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_tenants || 0}</p>
                <p className="text-sm text-slate-500">Total Tenants</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.active_tenants || 0}</p>
                <p className="text-sm text-slate-500">Active Tenants</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-violet-100 rounded-lg">
                <Store className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_stores || 0}</p>
                <p className="text-sm text-slate-500">Total Stores</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-lg">
                <Users className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                <p className="text-sm text-slate-500">Total Users</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tenants Table */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tenant Accounts</h2>
              <p className="text-sm text-slate-500">Manage customer accounts and billing limits</p>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Tenant
            </Button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No tenants yet</p>
              <p className="text-sm text-slate-400">Create your first tenant account to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-semibold text-slate-600">Tenant</th>
                    <th className="text-left p-4 font-semibold text-slate-600">Admin</th>
                    <th className="text-center p-4 font-semibold text-slate-600">Stores</th>
                    <th className="text-center p-4 font-semibold text-slate-600">Status</th>
                    <th className="text-center p-4 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-xs text-slate-500">Created {new Date(tenant.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium">{tenant.admin_email}</p>
                        <p className="text-xs text-slate-500">{tenant.admin_name}</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-semibold">{tenant.active_store_count}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-slate-600">{tenant.store_limit || '∞'}</span>
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(tenant.status)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(tenant)} title="Edit Limit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleResetPassword(tenant)} title="Reset Password">
                            <Key className="h-4 w-4" />
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
      </main>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Create New Tenant</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Tenant/Business Name *</label>
                <Input
                  value={newTenant.tenantName}
                  onChange={(e) => setNewTenant({ ...newTenant, tenantName: e.target.value })}
                  placeholder="Acme Corporation"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Admin First Name</label>
                  <Input
                    value={newTenant.adminFirstName}
                    onChange={(e) => setNewTenant({ ...newTenant, adminFirstName: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Admin Last Name</label>
                  <Input
                    value={newTenant.adminLastName}
                    onChange={(e) => setNewTenant({ ...newTenant, adminLastName: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Admin Email *</label>
                <Input
                  type="email"
                  value={newTenant.adminEmail}
                  onChange={(e) => setNewTenant({ ...newTenant, adminEmail: e.target.value })}
                  placeholder="admin@company.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Initial Password *</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newTenant.adminPassword}
                    onChange={(e) => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">User will be required to change password on first login</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Store Limit</label>
                  <Input
                    type="number"
                    value={newTenant.storeLimit}
                    onChange={(e) => setNewTenant({ ...newTenant, storeLimit: e.target.value })}
                    placeholder="Unlimited"
                    min="1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Leave empty for unlimited</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <select
                    value={newTenant.currency}
                    onChange={(e) => setNewTenant({ ...newTenant, currency: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="EGP">EGP - Egyptian Pound</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="SAR">SAR - Saudi Riyal</option>
                    <option value="AED">AED - UAE Dirham</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(newTenant)}
                disabled={createMutation.isPending || !newTenant.tenantName || !newTenant.adminEmail || !newTenant.adminPassword}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Tenant
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {showEditModal && selectedTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Tenant: {selectedTenant.name}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Store Limit</label>
                <Input
                  type="number"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Current usage: {selectedTenant.active_store_count} stores. Leave empty for unlimited.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate({
                  tenantId: selectedTenant.id,
                  data: {
                    storeLimit: editLimit ? parseInt(editLimit) : 'unlimited',
                    status: editStatus
                  }
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">Reset Password</h3>
              <button onClick={() => setShowResetModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600">
                Reset password for admin of <strong>{selectedTenant.name}</strong>
              </p>
              <div>
                <label className="text-sm font-medium">New Password *</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">User will be required to change password on next login</p>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowResetModal(false)}>Cancel</Button>
              <Button
                onClick={() => resetPasswordMutation.mutate({
                  tenantId: selectedTenant.id,
                  userId: resetUserId,
                  newPassword: resetPassword
                })}
                disabled={resetPasswordMutation.isPending || !resetPassword}
              >
                {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                Reset Password
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
