import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  tenantId?: string;
  defaultStoreId?: string;
  isSuperAdmin?: boolean;
  mustChangePassword?: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  currencyCode: string;
  storeLimit?: number | null;
  activeStoreCount?: number;
}

interface Store {
  id: string;
  code: string;
  name: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  stores: Store[];
  permissions: string[];
  accessToken: string | null;
  refreshToken: string | null;
  currentStoreId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setCurrentStore: (storeId: string) => void;
  hasPermission: (permission: string) => boolean;
  refreshStores: () => Promise<void>;
}

interface RegisterData {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  storeName: string;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      stores: [],
      permissions: [],
      accessToken: null,
      refreshToken: null,
      currentStoreId: null,
      isAuthenticated: false,
      isLoading: false,
      isSuperAdmin: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, tenant, stores, permissions, accessToken, refreshToken, isSuperAdmin } = response.data.data;
          
          set({
            user,
            tenant,
            stores,
            permissions,
            accessToken,
            refreshToken,
            currentStoreId: user.defaultStoreId || stores[0]?.id,
            isAuthenticated: true,
            isLoading: false,
            isSuperAdmin: isSuperAdmin || false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/register', data);
          const { user, tenant, stores, permissions, accessToken, refreshToken } = response.data.data;
          
          set({
            user,
            tenant,
            stores,
            permissions,
            accessToken,
            refreshToken,
            currentStoreId: stores[0]?.id,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        api.post('/auth/logout').catch(() => {});
        set({
          user: null,
          tenant: null,
          stores: [],
          permissions: [],
          accessToken: null,
          refreshToken: null,
          currentStoreId: null,
          isAuthenticated: false,
          isSuperAdmin: false,
        });
      },

      setCurrentStore: (storeId: string) => {
        set({ currentStoreId: storeId });
      },

      hasPermission: (permission: string) => {
        return get().permissions.includes(permission);
      },

      refreshStores: async () => {
        try {
          const response = await api.get('/admin/stores');
          const stores = response.data.stores
            .filter((s: any) => s.is_active)
            .map((s: any) => ({ id: s.id, code: s.code, name: s.name }));
          set({ stores });
        } catch (error) {
          console.error('Failed to refresh stores:', error);
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        stores: state.stores,
        permissions: state.permissions,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentStoreId: state.currentStoreId,
        isAuthenticated: state.isAuthenticated,
        isSuperAdmin: state.isSuperAdmin,
      }),
    }
  )
);
