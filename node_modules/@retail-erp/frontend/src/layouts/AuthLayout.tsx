import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Sparkles } from 'lucide-react';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-indigo-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md p-6 relative z-10">
        {/* Logo and branding */}
        <div className="text-center mb-8 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/30 mb-2">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent">
              Retail ERP
            </h1>
            <p className="text-sm text-gray-600 mt-2 font-medium">
              Point of Sale & Inventory Management
            </p>
          </div>
        </div>

        {/* Glass card container */}
        <div className="glass-card rounded-3xl border border-white/40 p-8 shadow-2xl shadow-gray-900/10 backdrop-blur-xl bg-white/80">
          <Outlet />
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          Secure cloud-based business management
        </p>
      </div>
    </div>
  );
}
