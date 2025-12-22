import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Package, ShoppingCart, Warehouse, Users, BarChart3,
  Settings, LogOut, ChevronDown, Store, Receipt,
  Menu, X, Search
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/NotificationBell';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

const useNavigation = () => {
  const { t } = useTranslation();
  
  return [
    { name: t('sidebar.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('sidebar.pos'), href: '/pos', icon: ShoppingCart, highlight: true },
    {
      name: t('sidebar.products'), icon: Package, children: [
        { name: t('sidebar.products'), href: '/products' },
        { name: 'Categories', href: '/products/categories' },
        { name: 'Brands', href: '/products/brands' },
      ]
    },
    {
      name: t('sidebar.inventory'), icon: Warehouse, children: [
        { name: t('sidebar.stockOnHand'), href: '/inventory' },
        { name: t('sidebar.receiveStock'), href: '/inventory/receive' },
        { name: 'Stock Forecast', href: '/inventory/forecast' },
        { name: 'Low Stock Alerts', href: '/inventory/low-stock' },
        { name: 'Stock Ledger', href: '/inventory/ledger' },
        { name: t('sidebar.stockAdjustments'), href: '/inventory/adjustments' },
        { name: t('sidebar.stockTransfers'), href: '/inventory/transfers' },
      ]
    },
    {
      name: 'Sales', icon: Receipt, children: [
        { name: 'Receipts', href: '/pos/receipts' },
        { name: 'Shifts', href: '/pos/shifts' },
      ]
    },
    { name: t('sidebar.customers'), href: '/customers', icon: Users },
    { name: t('sidebar.reports'), href: '/reports', icon: BarChart3 },
    {
      name: 'Admin', icon: Settings, children: [
        { name: 'Users', href: '/admin/users' },
        { name: 'Roles', href: '/admin/roles' },
        { name: 'Stores', href: '/admin/stores' },
        { name: 'Audit Log', href: '/admin/audit' },
        { name: t('sidebar.settings'), href: '/admin/settings' },
      ]
    },
  ];
};

function NavItem({ item, collapsed }: { item: ReturnType<typeof useNavigation>[0]; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const hasChildren = 'children' in item && item.children;

  if (hasChildren) {
    return (
      <div className="mb-1">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200',
            'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:scale-[0.98]',
            open && 'bg-slate-50 text-slate-900'
          )}
        >
          <item.icon className="h-5 w-5 shrink-0 opacity-70" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.name}</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200 opacity-50', open && 'rotate-180')} />
            </>
          )}
        </button>
        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open && !collapsed ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="ml-4 pl-4 border-l border-slate-200 my-1 space-y-0.5">
            {item.children.map((child: any) => (
              <NavLink
                key={child.href}
                to={child.href}
                className={({ isActive }) => cn(
                  'block px-3 py-2 rounded-lg text-sm transition-all duration-200',
                  isActive 
                    ? 'bg-primary/10 text-primary font-medium translate-x-1' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'
                )}
              >
                {child.name}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <NavLink
      to={item.href!}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-all duration-200 mb-1',
        isActive 
          ? 'bg-primary text-white shadow-md shadow-primary/20' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:scale-[0.98]',
        item.highlight && !isActive && 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-sm border border-emerald-100/50'
      )}
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "opacity-100" : "opacity-70")} />
          {!collapsed && <span>{item.name}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { user, tenant, stores, currentStoreId, setCurrentStore, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigation = useNavigation();

  const currentStore = stores.find(s => s.id === currentStoreId);

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-primary/20">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button variant="secondary" size="icon" className="shadow-lg backdrop-blur-md bg-white/80" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar - Glassmorphism */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 bg-white/80 backdrop-blur-xl border-r border-slate-200/60 transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)',
        sidebarOpen ? 'w-72' : 'w-[88px]',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        'shadow-[2px_0_24px_rgba(0,0,0,0.02)]'
      )}>
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="h-20 flex items-center justify-between px-6 mb-2">
            {sidebarOpen ? (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/20">
                    <Store className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-lg leading-none tracking-tight">{tenant?.name || 'Retail ERP'}</h1>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">{currentStore?.name}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Store className="h-6 w-6 text-white" />
                </div>
              </div>
            )}
            
            {sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                onClick={() => setSidebarOpen(false)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
          </div>

          {!sidebarOpen && (
            <div className="flex justify-center mb-4">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex h-10 w-10 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide py-2">
            {navigation.map((item: any) => (
              <NavItem key={item.name} item={item} collapsed={!sidebarOpen} />
            ))}
          </nav>

          {/* User Profile - Glass Card */}
          <div className="p-4 mt-auto">
            <div className={cn(
              "rounded-2xl bg-gradient-to-b from-white to-slate-50 border border-slate-100 shadow-sm p-3 transition-all duration-300",
              !sidebarOpen && "bg-transparent border-0 shadow-none p-0"
            )}>
              <div className={cn('flex items-center gap-3', !sidebarOpen && 'justify-center flex-col gap-4')}>
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-100 to-violet-100 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                  </div>
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white"></div>
                </div>
                
                {sidebarOpen && (
                  <div className="flex-1 min-w-0 animate-fade-in">
                    <p className="text-sm font-semibold truncate text-slate-900">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-slate-500 truncate font-medium">{user?.email}</p>
                  </div>
                )}
                
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors",
                    !sidebarOpen && "h-10 w-10"
                  )}
                  onClick={() => { logout(); navigate('/login'); }}
                  title="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={cn(
        'transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1) min-h-screen',
        sidebarOpen ? 'lg:pl-72' : 'lg:pl-[88px]'
      )}>
        {/* Sticky Header - Glassmorphism */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-slate-200/60 transition-all duration-300">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 lg:ml-0 ml-12">
            {/* Search - hidden on mobile, shown on tablet+ */}
            <div className="relative max-w-md flex-1 group hidden md:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors duration-300" />
              </div>
              <input
                type="text"
                placeholder="Search anything..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100/50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all duration-300 placeholder:text-slate-400"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-white hidden lg:inline">⌘K</span>
                </div>
              </div>
            </div>
            
            {/* Mobile search icon */}
            <Button variant="ghost" size="icon" className="md:hidden">
              <Search className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="h-8 w-[1px] bg-slate-200 mx-1 sm:mx-2 hidden sm:block"></div>
            
            {/* Language switcher - hidden on mobile */}
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            
            <NotificationBell />
            
            {/* Store selector - compact on mobile */}
            <div className="relative">
              <select
                value={currentStoreId || ''}
                onChange={(e) => setCurrentStore(e.target.value)}
                className="appearance-none bg-slate-100/50 border-0 rounded-xl pl-3 sm:pl-4 pr-8 sm:pr-10 py-2 text-xs sm:text-sm font-medium hover:bg-slate-100 focus:ring-2 focus:ring-primary/20 cursor-pointer transition-colors max-w-[120px] sm:max-w-none"
              >
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-3 pointer-events-none">
                <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-slate-500" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-slide-in-from-top">
          <Outlet />
        </div>
      </main>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
