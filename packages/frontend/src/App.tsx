import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores/auth';

// Layouts
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';
import POSLayout from '@/layouts/POSLayout';

// Auth Pages
import LoginPage from '@/pages/auth/LoginPage';

// Super Admin Pages
import SuperAdminDashboard from '@/pages/super-admin/SuperAdminDashboard';

// Dashboard Pages
import DashboardPage from '@/pages/dashboard/DashboardPage';

// Master Data Pages
import ProductsPage from '@/pages/products/ProductsPage';
import ProductDetailPage from '@/pages/products/ProductDetailPage';
import CategoriesPage from '@/pages/products/CategoriesPage';
import BrandsPage from '@/pages/products/BrandsPage';

// POS Pages
import POSPage from '@/pages/pos/POSPage';
import ReceiptsPage from '@/pages/pos/ReceiptsPage';
import ShiftsPage from '@/pages/pos/ShiftsPage';

// Inventory Pages
import StockPage from '@/pages/inventory/StockPage';
import LedgerPage from '@/pages/inventory/LedgerPage';
import ReceiveStockPage from '@/pages/inventory/ReceiveStockPage';
import LowStockPage from '@/pages/inventory/LowStockPage';
import AdjustmentsPage from '@/pages/inventory/AdjustmentsPage';
import TransfersPage from '@/pages/inventory/TransfersPage';
import StockCountPage from '@/pages/inventory/StockCountPage';
import StockForecastPage from '@/pages/inventory/StockForecastPage';

// Customers Pages
import CustomersPage from '@/pages/customers/CustomersPage';

// Reports Pages
import ReportsPage from '@/pages/reports/ReportsPage';

// Admin Pages
import UsersPage from '@/pages/admin/UsersPage';
import RolesPage from '@/pages/admin/RolesPage';
import StoresPage from '@/pages/admin/StoresPage';
import AuditLogPage from '@/pages/admin/AuditLogPage';
import SettingsPage from '@/pages/admin/SettingsPage';

// Profile Page
import ProfilePage from '@/pages/profile/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isSuperAdmin } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <>
      <Routes>
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* Super Admin Routes */}
        <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />

        {/* POS Routes (Full screen, keyboard-first) */}
        <Route element={<ProtectedRoute><POSLayout /></ProtectedRoute>}>
          <Route path="/pos" element={<POSPage />} />
        </Route>

        {/* Dashboard Routes */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          
          {/* Products */}
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/products/categories" element={<CategoriesPage />} />
          <Route path="/products/brands" element={<BrandsPage />} />
          
          {/* POS Management */}
          <Route path="/pos/receipts" element={<ReceiptsPage />} />
          <Route path="/pos/shifts" element={<ShiftsPage />} />
          
          {/* Inventory */}
          <Route path="/inventory" element={<StockPage />} />
          <Route path="/inventory/receive" element={<ReceiveStockPage />} />
          <Route path="/inventory/low-stock" element={<LowStockPage />} />
          <Route path="/inventory/ledger" element={<LedgerPage />} />
          <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
          <Route path="/inventory/transfers" element={<TransfersPage />} />
          <Route path="/inventory/count" element={<StockCountPage />} />
          <Route path="/inventory/forecast" element={<StockForecastPage />} />
          
          {/* Customers */}
          <Route path="/customers" element={<CustomersPage />} />
          
          {/* Reports */}
          <Route path="/reports/*" element={<ReportsPage />} />
          
          {/* Admin */}
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/stores" element={<StoresPage />} />
          <Route path="/admin/audit" element={<AuditLogPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          
          {/* Profile */}
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
