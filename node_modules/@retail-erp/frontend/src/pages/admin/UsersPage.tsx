import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  Users, Plus, Search, Edit2, Key, Store,
  Loader2, X, UserCheck, UserX, Mail, Calendar
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  store_name?: string;
  store_id?: string;
}

interface Store {
  id: string;
  name: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'cashier',
    storeId: '',
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get('/admin/users');
      return res.data;
    },
  });

  const { data: storesData } = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => {
      const res = await api.get('/admin/stores');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/admin/users', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Created', description: 'New user has been added successfully' });
      closeModal();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create user', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/admin/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Updated', description: 'User has been updated successfully' });
      closeModal();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
    },
  });

  // Unused but keeping for future use
  /*
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Deactivated', description: 'User has been deactivated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to delete user', variant: 'destructive' });
    },
  });
  */

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      const res = await api.post(`/admin/users/${id}/reset-password`, { newPassword });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Password Reset', description: 'Password has been reset successfully' });
      setShowPasswordModal(null);
      setNewPassword('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to reset password', variant: 'destructive' });
    },
  });

  const users: User[] = usersData?.users || [];
  const stores: Store[] = storesData?.stores || [];

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(search.toLowerCase())
  );

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({ email: '', password: '', firstName: '', lastName: '', role: 'cashier', storeId: '' });
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      role: user.role,
      storeId: user.store_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!formData.email) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return;
    }
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        data: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          role: formData.role,
          storeId: formData.storeId || null,
          isActive: editingUser.is_active,
        },
      });
    } else {
      if (!formData.password || formData.password.length < 6) {
        toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
        return;
      }
      createMutation.mutate(formData);
    }
  };

  const toggleActive = (user: User) => {
    updateMutation.mutate({
      id: user.id,
      data: {
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        storeId: user.store_id,
        isActive: !user.is_active,
      },
    });
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-700 border-purple-200',
      manager: 'bg-blue-100 text-blue-700 border-blue-200',
      cashier: 'bg-green-100 text-green-700 border-green-200',
      inventory: 'bg-orange-100 text-orange-700 border-orange-200',
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage user accounts and access permissions</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No users found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Role</th>
                <th className="text-left p-4 font-medium">Store</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Last Login</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-semibold text-primary">
                          {user.first_name?.[0] || user.email[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{user.first_name} {user.last_name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleBadge(user.role)}`}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="p-4">
                    {user.store_name ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Store className="h-3 w-3" /> {user.store_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">All Stores</span>
                    )}
                  </td>
                  <td className="p-4">
                    {user.is_active ? (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <UserCheck className="h-4 w-4" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500 text-sm">
                        <UserX className="h-4 w-4" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">
                    {user.last_login ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(user.last_login).toLocaleDateString()}
                      </span>
                    ) : (
                      'Never'
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)} title="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setShowPasswordModal(user.id)} title="Reset Password">
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(user)}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {user.is_active ? <UserX className="h-4 w-4 text-red-500" /> : <UserCheck className="h-4 w-4 text-green-600" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 m-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">First Name</label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Last Name</label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  disabled={!!editingUser}
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Password *</label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 6 characters"
                  />
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1.5 block">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="admin">Administrator</option>
                  <option value="manager">Store Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="inventory">Inventory Staff</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Default Store</label>
                <select
                  value={formData.storeId}
                  onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="">All Stores</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
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
                {editingUser ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 m-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Key className="h-5 w-5" /> Reset Password
              </h3>
              <button onClick={() => { setShowPasswordModal(null); setNewPassword(''); }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowPasswordModal(null); setNewPassword(''); }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (newPassword.length < 6) {
                    toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
                    return;
                  }
                  resetPasswordMutation.mutate({ id: showPasswordModal, newPassword });
                }}
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Reset Password
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
