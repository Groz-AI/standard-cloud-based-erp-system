import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { playCashSound, playErrorSound } from '@/lib/sounds';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Search, Trash2, Plus, Minus, CreditCard, Banknote,
  ShoppingCart, Package, X, Check, Loader2, User, UserPlus, ChevronDown,
  Phone, Mail, Clock, Sparkles, Grid3X3, List, Printer, Download, Eye, FileText, RefreshCw
} from 'lucide-react';

interface CartItem {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  sell_price: number;
  category_name?: string;
  stock_quantity?: number;
  available_quantity?: number;
}

interface Customer {
  id: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  loyalty_points?: number;
}

export default function POSPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant, currentStoreId } = useAuthStore();
  const searchRef = useRef<HTMLInputElement>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showMobileCart, setShowMobileCart] = useState(false);
  
  // Customer states
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  
  // Receipt success state
  const [completedSale, setCompletedSale] = useState<{ receiptId: string; receiptNumber: string; total: number } | null>(null);
  const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch current open shift
  const { data: shiftData } = useQuery({
    queryKey: ['pos-current-shift', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/shifts/current', { params: { storeId: currentStoreId } });
      return res.data;
    },
    enabled: !!currentStoreId,
  });
  const currentShift = shiftData?.shift;

  // Fetch all products with store-specific stock
  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['pos-products', search, currentStoreId],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search, storeId: currentStoreId } });
      return res.data;
    },
  });

  // Fetch customers for search
  const { data: customersData, refetch: refetchCustomers } = useQuery({
    queryKey: ['pos-customers', customerSearch],
    queryFn: async () => {
      const res = await api.get('/customers', { params: { search: customerSearch } });
      return res.data;
    },
    enabled: showCustomerSearch,
  });

  const handleRefresh = () => {
    refetchProducts();
    if (showCustomerSearch) {
      refetchCustomers();
    }
  };

  // Create new customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName?: string; phone?: string; email?: string }) => {
      const res = await api.post('/customers', data);
      return res.data;
    },
    onSuccess: (data) => {
      setSelectedCustomer(data);
      setShowNewCustomer(false);
      setNewCustomer({ firstName: '', lastName: '', phone: '', email: '' });
      queryClient.invalidateQueries({ queryKey: ['pos-customers'] });
      toast({ title: 'Customer Created', description: `${data.first_name} added successfully` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create customer', variant: 'destructive' });
    },
  });

  const products: Product[] = productsData?.products || [];
  const customers: Customer[] = customersData?.customers || [];

  // Auto-focus search
  useEffect(() => {
    if (!showPayment) {
      searchRef.current?.focus();
    }
  }, [showPayment]);

  // Calculate totals
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal;
  const cashAmount = parseFloat(cashReceived) || 0;
  const change = cashAmount - total;

  // Add item to cart
  const addToCart = (product: Product) => {
    const existingIndex = cart.findIndex(item => item.productId === product.id);
    
    if (existingIndex >= 0) {
      setCart(prev => prev.map((item, i) => 
        i === existingIndex 
          ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      setCart(prev => [...prev, {
        id: crypto.randomUUID(),
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: 1,
        unitPrice: product.sell_price,
        lineTotal: product.sell_price,
      }]);
    }
    
    toast({ 
      key: `cart-${product.id}`, 
      title: 'Added to Cart', 
      description: product.name,
      icon: 'cart',
      variant: 'success'
    });
  };

  // Update quantity
  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Remove item
  const removeItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setShowPayment(false);
    setCashReceived('');
    setSelectedCustomer(null);
  };

  // Complete sale
  const completeSale = async (method: 'cash' | 'card' | 'instapay' | 'vodafone_cash' | 'etisalat_cash' | 'orange_cash' | 'wallet') => {
    if (cart.length === 0) return;
    if (method === 'cash' && cashAmount <= 0) {
      toast({ title: 'Enter amount', description: 'Please enter the cash received', variant: 'destructive' });
      return;
    }
    
    setIsProcessing(true);
    try {
      const payload = {
        storeId: currentStoreId,
        shiftId: currentShift?.id || null,
        customerId: selectedCustomer?.id || null,
        items: cart.map(item => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        payments: [{
          method,
          amount: method === 'cash' ? cashAmount : total
        }],
      };

      const res = await api.post('/pos/sale', payload);
      
      // Play success sound
      playCashSound();
      
      // Show success with receipt actions
      setCompletedSale({
        receiptId: res.data.receipt?.id,
        receiptNumber: res.data.receipt?.receipt_number || 'Generated',
        total: total
      });
      
      // Invalidate stock and shift queries
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      queryClient.invalidateQueries({ queryKey: ['pos-current-shift'] });
      
      // Clear cart but keep success modal open
      setCart([]);
      setSelectedCustomer(null);
      setShowPayment(false);
      setCashReceived('');
    } catch (error: any) {
      playErrorSound();
      toast({ 
        title: 'Sale Failed', 
        description: error.response?.data?.error || 'Please try again', 
        variant: 'destructive' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick cash amounts
  const quickAmounts = [10, 20, 50, 100, 200, 500];

  // Check if store is selected
  if (!currentStoreId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <Package className="h-16 w-16 mb-4 opacity-50" />
        <h2 className="text-xl font-bold mb-2">No Store Selected</h2>
        <p className="text-white/60 mb-4">Please select a store from the header to use POS</p>
        <Button onClick={() => navigate('/dashboard')} variant="outline" className="border-white/20 text-white hover:bg-white/10">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go to Dashboard
        </Button>
      </div>
    );
  }

  // Handle new customer creation
  const handleCreateCustomer = () => {
    if (!newCustomer.firstName.trim()) {
      toast({ title: 'Name required', description: 'Please enter customer name', variant: 'destructive' });
      return;
    }
    createCustomerMutation.mutate(newCustomer);
  };

  // Receipt actions - all use authenticated API requests
  const handlePreviewReceipt = async () => {
    if (!completedSale?.receiptId) return;
    setIsDownloading(true);
    try {
      const response = await api.get(`/documents/receipt/${completedSale.receiptId}`, {
        params: { format: receiptFormat },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      toast({ title: 'Preview failed', description: 'Could not load receipt', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!completedSale?.receiptId) return;
    setIsDownloading(true);
    try {
      const response = await api.get(`/documents/receipt/${completedSale.receiptId}`, {
        params: { format: receiptFormat },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${completedSale.receiptNumber}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Receipt saved to downloads' });
    } catch (error) {
      toast({ title: 'Download failed', description: 'Could not download receipt', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!completedSale?.receiptId) return;
    setIsDownloading(true);
    try {
      const response = await api.get(`/documents/receipt/${completedSale.receiptId}`, {
        params: { format: receiptFormat },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    } catch (error) {
      toast({ title: 'Print failed', description: 'Could not load receipt', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const closeCompletedSale = () => {
    setCompletedSale(null);
    searchRef.current?.focus();
  };

  return (
    <div className="h-screen flex flex-col bg-[#F5F5F7] text-slate-900 font-sans selection:bg-primary/20">
      {/* Header */}
      <header className="h-14 sm:h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-3 sm:px-6 z-20">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl h-9 w-9 sm:h-10 sm:w-10"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold text-slate-900 flex items-center gap-1 sm:gap-2">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
              <span className="hidden sm:inline">{t('pos.title')}</span>
              <span className="sm:hidden">POS</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium hidden sm:block">{tenant?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Shift Status Indicator - compact on mobile */}
          {currentShift ? (
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg sm:rounded-xl">
              <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-emerald-700 text-xs sm:text-sm font-semibold hidden sm:inline">{t('pos.shift')} #{currentShift.shift_number}</span>
              <span className="text-emerald-700 text-xs font-semibold sm:hidden">#{currentShift.shift_number}</span>
            </div>
          ) : (
            <button
              onClick={() => navigate('/pos/shifts')}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-amber-50 border border-amber-100 rounded-lg sm:rounded-xl hover:bg-amber-100 transition-colors"
            >
              <div className="h-2 w-2 bg-amber-500 rounded-full" />
              <span className="text-amber-700 text-xs sm:text-sm font-semibold hidden sm:inline">{t('pos.noShift')}</span>
            </button>
          )}
          {/* Refresh Button */}
          <Button
            onClick={handleRefresh}
            disabled={productsLoading}
            variant="ghost"
            size="icon"
            className="text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl h-8 w-8 sm:h-10 sm:w-10 hidden sm:flex"
            title="Refresh products"
          >
            <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 ${productsLoading ? 'animate-spin' : ''}`} />
          </Button>
          {/* View Toggle - hidden on mobile */}
          <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          {/* Mobile Cart Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMobileCart(!showMobileCart)}
            className="lg:hidden relative h-9 w-9"
          >
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-indigo-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {itemCount}
              </span>
            )}
          </Button>
          {/* Desktop item count */}
          <div className="hidden lg:flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
            <ShoppingCart className="h-4 w-4 text-indigo-600" />
            <span className="text-indigo-700 font-bold text-sm">{itemCount} {t('dashboard.items')}</span>
          </div>
          {/* Clock - hidden on mobile */}
          <div className="hidden xl:flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600 font-medium">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Products */}
        <div className="flex-1 flex flex-col p-3 sm:p-6">
          {/* Search */}
          <div className="relative mb-4 sm:mb-6">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-slate-400" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('pos.searchPlaceholder')}
              className="h-12 sm:h-14 pl-10 sm:pl-12 pr-10 sm:pr-12 text-base sm:text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm rounded-xl sm:rounded-2xl transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-20">
            {productsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">{t('common.loading')}</p>
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6">
                  <Package className="h-12 w-12 text-slate-300" />
                </div>
                <p className="text-xl font-bold text-slate-600">{t('common.noData')}</p>
                <p className="text-sm mt-2 text-slate-500">{t('pos.addProductsFirst')}</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {products.map((product) => {
                  const stock = product.available_quantity ?? 0;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock < 10;
                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOutOfStock && addToCart(product)}
                      disabled={isOutOfStock}
                      className={`group p-3 sm:p-4 rounded-xl sm:rounded-2xl text-left transition-all duration-300 border shadow-sm active:scale-95 ${
                        isOutOfStock 
                          ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' 
                          : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-md hover:-translate-y-1 active:scale-95'
                      }`}
                    >
                      <div className="h-28 bg-slate-50 rounded-xl mb-4 flex items-center justify-center group-hover:bg-indigo-50/50 transition-colors relative overflow-hidden">
                        <Package className="h-10 w-10 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center">
                            <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-md shadow-sm">{t('pos.outOfStock')}</span>
                          </div>
                        )}
                        {!isOutOfStock && isLowStock && (
                          <div className="absolute top-2 right-2">
                             <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded border border-amber-200">{t('pos.low')}</span>
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 truncate text-sm leading-tight">{product.name}</p>
                      <p className="text-xs text-slate-400 group-hover:text-slate-500 mt-1 font-mono">{product.sku}</p>
                      <div className="flex items-end justify-between mt-3">
                        <p className="text-lg font-bold text-slate-900">
                          {formatCurrency(product.sell_price, tenant?.currencyCode)}
                        </p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                          isOutOfStock ? 'bg-red-50 text-red-600' : 
                          isLowStock ? 'bg-amber-50 text-amber-600' : 
                          'bg-emerald-50 text-emerald-600'
                        }`}>
                          {stock} left
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((product) => {
                  const stock = product.available_quantity ?? 0;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock < 10;
                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOutOfStock && addToCart(product)}
                      disabled={isOutOfStock}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 border shadow-sm ${
                        isOutOfStock 
                          ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' 
                          : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-md'
                      }`}
                    >
                      <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center relative flex-shrink-0">
                        <Package className="h-6 w-6 text-slate-300" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                        <p className="text-xs text-slate-400 font-mono">{product.sku}</p>
                      </div>
                      <div className="text-right mr-4">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-md block mb-1 ${
                          isOutOfStock ? 'bg-red-50 text-red-600' : 
                          isLowStock ? 'bg-amber-50 text-amber-600' : 
                          'bg-emerald-50 text-emerald-600'
                        }`}>
                          {stock} in stock
                        </span>
                      </div>
                      <p className="text-lg font-bold text-slate-900 min-w-[80px] text-right">
                        {formatCurrency(product.sell_price, tenant?.currencyCode)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Cart */}
        <div className={`fixed lg:relative inset-y-0 right-0 w-full sm:w-[420px] lg:w-[480px] bg-white flex flex-col shadow-xl z-50 lg:z-10 border-l border-slate-200 transition-transform duration-300 ${showMobileCart ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
          {/* Cart Header */}
          <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMobileCart(false)}
                className="lg:hidden h-9 w-9"
              >
                <X className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="font-bold text-lg sm:text-xl text-slate-900">Current Order</h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5 hidden sm:block">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl px-2 sm:px-3">
                <Trash2 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </div>

          {/* Customer Section */}
          <div className="px-5 py-3 border-b bg-slate-50/50">
            {selectedCustomer ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{selectedCustomer.first_name} {selectedCustomer.last_name || ''}</p>
                    <p className="text-xs text-slate-500 font-medium">{selectedCustomer.phone || selectedCustomer.email || 'Customer'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowCustomerSearch(!showCustomerSearch)}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-indigo-400 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                      <User className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
                    </div>
                    <span className="text-slate-500 font-medium group-hover:text-slate-700">{t('pos.addCustomer')}</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showCustomerSearch ? 'rotate-180' : ''}`} />
                </button>

                {/* Customer Search Dropdown */}
                {showCustomerSearch && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                    <div className="p-3 border-b">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder={t('pos.searchCustomers')}
                          className="pl-9 h-10 bg-slate-50 border-transparent focus:bg-white"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {customers.length > 0 ? (
                        customers.slice(0, 5).map((customer) => (
                          <button
                            key={customer.id}
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowCustomerSearch(false);
                              setCustomerSearch('');
                            }}
                            className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 transition-all text-left"
                          >
                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                              {customer.first_name[0]}
                            </div>
                            <div>
                              <p className="font-medium text-sm text-slate-900">{customer.first_name} {customer.last_name || ''}</p>
                              <p className="text-xs text-slate-500">{customer.phone || customer.email}</p>
                            </div>
                          </button>
                        ))
                      ) : customerSearch ? (
                        <p className="p-4 text-sm text-slate-500 text-center">{t('pos.noCustomersFound')}</p>
                      ) : (
                        <p className="p-4 text-sm text-slate-500 text-center">{t('pos.typeToSearch')}</p>
                      )}
                    </div>
                    <div className="p-2 border-t bg-slate-50">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100"
                        onClick={() => {
                          setShowNewCustomer(true);
                          setShowCustomerSearch(false);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-2" /> Add New Customer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 pb-safe">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-4 shadow-inner">
                  <ShoppingCart className="h-10 w-10 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-500 text-lg">Cart is empty</p>
                <p className="text-sm text-center mt-1 text-slate-400 max-w-[200px]">{t('pos.selectProducts')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate text-[15px]">{item.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{item.sku}</p>
                      </div>
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="text-slate-300 hover:text-red-500 ml-2 p-1.5 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="h-7 w-7 rounded-md bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 hover:border-slate-300 transition-all text-slate-600 shadow-sm"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-10 text-center font-bold text-sm text-slate-900">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="h-7 w-7 rounded-md bg-white border border-slate-200 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all text-slate-600 shadow-sm"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-slate-900">{formatCurrency(item.lineTotal, tenant?.currencyCode)}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{formatCurrency(item.unitPrice, tenant?.currencyCode)} {t('pos.each')}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div className="border-t bg-white p-4 sm:p-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20 pb-safe">
            {!showPayment ? (
              <>
                {/* Totals */}
                <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                  <div className="flex justify-between text-slate-500 text-sm">
                    <span>{t('pos.subtotal')} ({itemCount} {t('dashboard.items')})</span>
                    <span className="font-medium text-slate-900">{formatCurrency(subtotal, tenant?.currencyCode)}</span>
                  </div>
                  {selectedCustomer && (
                    <div className="flex justify-between text-indigo-600 text-sm bg-indigo-50 px-3 py-1.5 rounded-lg">
                      <span className="flex items-center gap-1.5 font-medium">
                        <User className="h-3.5 w-3.5" /> {selectedCustomer.first_name}
                      </span>
                      <span className="text-xs uppercase tracking-wider font-bold opacity-70">{t('pos.loyaltyCustomer')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-end pt-2 border-t border-dashed border-slate-200">
                    <span className="text-slate-900 font-bold">{t('pos.total')}</span>
                    <span className="text-3xl font-bold text-indigo-600 tracking-tight">{formatCurrency(total, tenant?.currencyCode)}</span>
                  </div>
                </div>

                {/* Payment Buttons */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Button
                    size="lg"
                    className="h-12 sm:h-14 text-base sm:text-lg bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 shadow-lg shadow-emerald-500/20 rounded-xl transition-all"
                    disabled={cart.length === 0}
                    onClick={() => setShowPayment(true)}
                  >
                    <Banknote className="h-5 w-5 mr-2" /> {t('pos.cash')}
                  </Button>
                  <Button
                    size="lg"
                    className="h-14 text-lg bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 shadow-lg shadow-indigo-500/20 rounded-xl transition-all"
                    disabled={cart.length === 0 || isProcessing}
                    onClick={() => completeSale('card')}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="h-5 w-5 mr-2" />
                    )}
                    {t('pos.card')}
                  </Button>
                </div>
                
                {/* Wallet Payment Options */}
                <div className="relative mt-3">
                  {!showWalletOptions ? (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full h-12 sm:h-14 text-base sm:text-lg border-2 border-purple-200 hover:bg-purple-50 hover:border-purple-400 rounded-xl transition-all"
                      disabled={cart.length === 0}
                      onClick={() => setShowWalletOptions(true)}
                    >
                      <Sparkles className="h-5 w-5 mr-2 text-purple-600" /> {t('pos.walletPayment')}
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-purple-900">{t('pos.selectWallet')}</span>
                        <button onClick={() => setShowWalletOptions(false)} className="text-purple-400 hover:text-purple-600">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg"
                        disabled={isProcessing}
                        onClick={() => { completeSale('instapay'); setShowWalletOptions(false); }}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('pos.instapay')}
                      </Button>
                      <Button
                        size="sm"
                        className="w-full h-12 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg"
                        disabled={isProcessing}
                        onClick={() => { completeSale('vodafone_cash'); setShowWalletOptions(false); }}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('pos.vodafoneCash')}
                      </Button>
                      <Button
                        size="sm"
                        className="w-full h-12 bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white rounded-lg"
                        disabled={isProcessing}
                        onClick={() => { completeSale('orange_cash'); setShowWalletOptions(false); }}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('pos.orangeCash')}
                      </Button>
                      <Button
                        size="sm"
                        className="w-full h-12 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg"
                        disabled={isProcessing}
                        onClick={() => { completeSale('etisalat_cash'); setShowWalletOptions(false); }}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('pos.etisalatCash')}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Cash Payment Interface */}
                <div className="space-y-4 animate-slide-in-right">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">{t('pos.amountDue')}</span>
                    <span className="text-3xl font-bold text-slate-900">{formatCurrency(total, tenant?.currencyCode)}</span>
                  </div>

                  <div className="relative">
                    <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">{t('pos.cashReceived')}</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">$</span>
                      <Input
                        type="number"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder="0.00"
                        className="h-16 pl-10 text-3xl font-bold rounded-2xl border-2 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all bg-slate-50 focus:bg-white"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Quick Amounts */}
                  <div className="grid grid-cols-3 gap-3">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        onClick={() => setCashReceived(String(amount))}
                        className="h-12 text-lg font-semibold hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700 rounded-xl border-slate-200 bg-white shadow-sm"
                      >
                        {formatCurrency(amount, tenant?.currencyCode)}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setCashReceived(String(total))}
                    className="w-full h-12 font-semibold hover:bg-emerald-50 hover:border-emerald-500 hover:text-emerald-700 rounded-xl border-slate-200 bg-white shadow-sm"
                  >
                    {t('pos.exactAmount')}
                  </Button>

                  {/* Change or Remaining Balance */}
                  {cashReceived && cashAmount > 0 && cashAmount >= total && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center animate-fade-in">
                      <p className="text-sm text-emerald-700 font-bold uppercase tracking-wider mb-1">Change Due</p>
                      <p className="text-4xl font-bold text-emerald-600">{formatCurrency(change, tenant?.currencyCode)}</p>
                    </div>
                  )}
                  {cashReceived && cashAmount > 0 && cashAmount < total && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center animate-fade-in">
                      <p className="text-sm text-amber-700 font-bold uppercase tracking-wider mb-1">Remaining Balance</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(total - cashAmount, tenant?.currencyCode)}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-12 sm:h-14 rounded-xl border-slate-200 hover:bg-slate-50 text-slate-600"
                      onClick={() => { setShowPayment(false); setCashReceived(''); }}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      size="lg"
                      className="col-span-2 h-12 sm:h-14 text-base sm:text-lg bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 shadow-lg shadow-emerald-500/20 rounded-xl transition-all"
                      disabled={isProcessing || cashAmount < total}
                      onClick={() => completeSale('cash')}
                    >
                      {isProcessing ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <Check className="h-5 w-5 mr-2" />
                      )}
                      Complete Sale
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 m-4 animate-slide-in scale-100">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">New Customer</h3>
                <p className="text-slate-500 text-sm mt-1">Enter customer details below</p>
              </div>
              <button 
                onClick={() => setShowNewCustomer(false)}
                className="bg-slate-100 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">First Name <span className="text-red-500">*</span></label>
                  <Input
                    value={newCustomer.firstName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                    placeholder="John"
                    className="h-12 bg-slate-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Last Name</label>
                  <Input
                    value={newCustomer.lastName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                    placeholder="Doe"
                    className="h-12 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" /> Phone Number
                </label>
                <Input
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="h-12 bg-slate-50 focus:bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" /> Email Address
                </label>
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  placeholder="john@example.com"
                  className="h-12 bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl font-semibold border-slate-200"
                onClick={() => setShowNewCustomer(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-semibold shadow-lg shadow-indigo-500/20"
                onClick={handleCreateCustomer}
                disabled={createCustomerMutation.isPending}
              >
                {createCustomerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Create Profile
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Completed Modal with Receipt Actions */}
      {completedSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-slide-in">
            {/* Success Header */}
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
              <div className="relative z-10">
                <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border border-white/20">
                  <Check className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Payment Successful</h2>
                <p className="text-emerald-100 mt-2 font-medium">Receipt #{completedSale.receiptNumber}</p>
                <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 inline-block min-w-[200px]">
                  <p className="text-sm text-emerald-100 uppercase tracking-widest font-bold mb-1">Total Paid</p>
                  <p className="text-4xl font-bold text-white tracking-tight">
                    {formatCurrency(completedSale.total, tenant?.currencyCode)}
                  </p>
                </div>
              </div>
            </div>

            {/* Receipt Actions */}
            <div className="p-8">
              <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-indigo-500" />
                Receipt Options
              </h3>

              {/* Format Toggle */}
              <div className="flex items-center gap-1 mb-6 p-1.5 bg-slate-100 rounded-2xl">
                <button
                  onClick={() => setReceiptFormat('thermal')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                    receiptFormat === 'thermal' 
                      ? 'bg-white shadow-sm text-slate-900 ring-1 ring-black/5' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Thermal (80mm)
                </button>
                <button
                  onClick={() => setReceiptFormat('a4')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                    receiptFormat === 'a4' 
                      ? 'bg-white shadow-sm text-slate-900 ring-1 ring-black/5' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  A4 Invoice
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <button
                  onClick={handlePreviewReceipt}
                  className="flex flex-col items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 hover:-translate-y-1 rounded-2xl transition-all group border border-slate-100"
                >
                  <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Eye className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">Preview</span>
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  disabled={isDownloading}
                  className="flex flex-col items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 hover:-translate-y-1 rounded-2xl transition-all group border border-slate-100 disabled:opacity-50"
                >
                  <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isDownloading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">Download</span>
                </button>
                <button
                  onClick={handlePrintReceipt}
                  className="flex flex-col items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 hover:-translate-y-1 rounded-2xl transition-all group border border-slate-100"
                >
                  <div className="h-10 w-10 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Printer className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">Print</span>
                </button>
              </div>

              {/* Done Button */}
              <Button 
                onClick={closeCompletedSale}
                className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-lg shadow-xl shadow-slate-900/10 hover:-translate-y-0.5 transition-all"
              >
                Start New Sale
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
