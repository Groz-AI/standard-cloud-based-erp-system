import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Shield, Users, ShoppingCart, Package, BarChart3, UserCog,
  Settings, Loader2, Check, X, Store, FileText, Boxes
} from 'lucide-react';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
}

const allPermissions = [
  { id: 'pos', name: 'Point of Sale', icon: ShoppingCart, description: 'Access POS terminal and process sales' },
  { id: 'inventory', name: 'Inventory', icon: Boxes, description: 'Manage stock, receive goods, adjustments' },
  { id: 'products.view', name: 'View Products', icon: Package, description: 'View product catalog' },
  { id: 'products.edit', name: 'Edit Products', icon: Package, description: 'Create and modify products' },
  { id: 'customers.view', name: 'View Customers', icon: Users, description: 'View customer list' },
  { id: 'customers.edit', name: 'Edit Customers', icon: Users, description: 'Create and modify customers' },
  { id: 'reports', name: 'Reports', icon: BarChart3, description: 'Access all reports' },
  { id: 'reports.inventory', name: 'Inventory Reports', icon: FileText, description: 'View inventory reports only' },
  { id: 'admin.users', name: 'User Management', icon: UserCog, description: 'Manage user accounts' },
  { id: 'admin.stores', name: 'Store Management', icon: Store, description: 'Manage store locations' },
  { id: 'admin.settings', name: 'System Settings', icon: Settings, description: 'Configure system settings' },
];

export default function RolesPage() {
  const { data: rolesData, isLoading } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const res = await api.get('/admin/roles');
      return res.data;
    },
  });

  const roles: Role[] = rolesData?.roles || [];

  const hasPermission = (role: Role, permId: string) => {
    if (role.permissions.includes('all')) return true;
    return role.permissions.includes(permId);
  };

  const getRoleIcon = (roleId: string) => {
    const icons: Record<string, string> = {
      admin: '👑',
      manager: '🏪',
      cashier: '💳',
      inventory: '📦',
    };
    return icons[roleId] || '👤';
  };

  const getRoleColor = (roleId: string) => {
    const colors: Record<string, string> = {
      admin: 'from-purple-500 to-indigo-600',
      manager: 'from-blue-500 to-cyan-600',
      cashier: 'from-green-500 to-emerald-600',
      inventory: 'from-orange-500 to-amber-600',
    };
    return colors[roleId] || 'from-gray-500 to-slate-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Roles & Permissions
        </h1>
        <p className="text-muted-foreground mt-1">View role-based access control configuration</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Role Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className={`h-2 bg-gradient-to-r ${getRoleColor(role.id)}`} />
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{getRoleIcon(role.id)}</span>
                    <div>
                      <h3 className="font-semibold">{role.name}</h3>
                      <p className="text-xs text-muted-foreground">{role.userCount} users</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{role.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Permissions Matrix */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <h2 className="font-semibold text-lg">Permissions Matrix</h2>
              <p className="text-sm text-muted-foreground">Overview of what each role can access</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-4 font-medium min-w-[200px]">Permission</th>
                    {roles.map((role) => (
                      <th key={role.id} className="text-center p-4 font-medium min-w-[100px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>{getRoleIcon(role.id)}</span>
                          <span className="text-xs">{role.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allPermissions.map((perm) => {
                    const Icon = perm.icon;
                    return (
                      <tr key={perm.id} className="hover:bg-muted/20">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{perm.name}</p>
                              <p className="text-xs text-muted-foreground">{perm.description}</p>
                            </div>
                          </div>
                        </td>
                        {roles.map((role) => (
                          <td key={role.id} className="text-center p-4">
                            {hasPermission(role, perm.id) ? (
                              <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-100">
                                <Check className="h-4 w-4 text-green-600" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100">
                                <X className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {roles.map((role) => (
              <div key={role.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className={`p-4 bg-gradient-to-r ${getRoleColor(role.id)} text-white`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getRoleIcon(role.id)}</span>
                    <div>
                      <h3 className="font-bold text-lg">{role.name}</h3>
                      <p className="text-white/80 text-sm">{role.description}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">Granted Permissions</h4>
                  <div className="flex flex-wrap gap-2">
                    {role.permissions.includes('all') ? (
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                        Full Access
                      </span>
                    ) : (
                      role.permissions.map((perm) => {
                        const permDef = allPermissions.find(p => p.id === perm);
                        return (
                          <span
                            key={perm}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                          >
                            {permDef?.name || perm}
                          </span>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      <Users className="h-4 w-4 inline mr-1" />
                      {role.userCount} {role.userCount === 1 ? 'user' : 'users'} assigned
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
