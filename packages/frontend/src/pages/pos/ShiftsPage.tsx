import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import {
  Clock, Play, Square, DollarSign,
  Plus, Loader2, X, CheckCircle,
  ArrowUpCircle, ArrowDownCircle, Store, ChevronRight
} from 'lucide-react';

interface Shift {
  id: string;
  shift_number: string;
  store_id: string;
  store_name: string;
  cashier_id: string;
  cashier_first_name: string;
  cashier_last_name?: string;
  cashier_email: string;
  opened_at: string;
  closed_at?: string;
  opening_cash: number;
  closing_cash?: number;
  expected_cash?: number;
  cash_difference?: number;
  total_sales: number;
  total_refunds: number;
  total_cash_payments: number;
  total_card_payments: number;
  transaction_count: number;
  status: 'open' | 'closed';
  receipt_count?: number;
  notes?: string;
}

interface CashMovement {
  id: string;
  type: 'cash_in' | 'cash_out' | 'drop' | 'pickup';
  amount: number;
  reason?: string;
  notes?: string;
  created_at: string;
  created_by_name?: string;
}

export default function ShiftsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { currentStoreId, stores } = useAuthStore();
  
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  
  // Form states
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [movementType, setMovementType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  // Get current store name
  const currentStoreName = stores.find(s => s.id === currentStoreId)?.name || 'Unknown Store';

  // Fetch current open shift
  const { data: currentShiftData, isLoading: currentLoading } = useQuery({
    queryKey: ['current-shift', currentStoreId],
    queryFn: async () => {
      const res = await api.get('/shifts/current', { params: { storeId: currentStoreId } });
      return res.data;
    },
    enabled: !!currentStoreId,
  });

  const currentShift = currentShiftData?.shift;

  // Fetch all shifts
  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts', currentStoreId, statusFilter],
    queryFn: async () => {
      const params: any = { storeId: currentStoreId, limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/shifts', { params });
      return res.data;
    },
    enabled: !!currentStoreId,
  });

  const shifts: Shift[] = shiftsData?.shifts || [];

  // Fetch shift details
  const { data: shiftDetailsData, isLoading: detailsLoading } = useQuery({
    queryKey: ['shift-details', selectedShift?.id],
    queryFn: async () => {
      const res = await api.get(`/shifts/${selectedShift?.id}`);
      return res.data;
    },
    enabled: !!selectedShift?.id && showDetailsModal,
  });

  // Open shift mutation
  const openShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/shifts/open', {
        storeId: currentStoreId,
        openingCash: parseFloat(openingCash) || 0,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowOpenModal(false);
      setOpeningCash('');
      toast({ title: 'Shift Opened', description: 'Your shift has been started', icon: 'check', variant: 'success' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to open shift', variant: 'destructive', icon: 'error' });
    },
  });

  // Close shift mutation
  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/shifts/${currentShift?.id}/close`, {
        closingCash: parseFloat(closingCash) || 0,
        notes: closeNotes || null,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShowCloseModal(false);
      setClosingCash('');
      setCloseNotes('');
      
      const diff = data.summary?.cashDifference || 0;
      const diffText = diff === 0 ? 'Cash balanced perfectly!' : 
        diff > 0 ? `Over by ${formatCurrency(diff)}` : `Short by ${formatCurrency(Math.abs(diff))}`;
      
      toast({ title: 'Shift Closed', description: diffText, icon: 'check', variant: 'success' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to close shift', variant: 'destructive', icon: 'error' });
    },
  });

  // Add cash movement mutation
  const addMovementMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/shifts/${currentShift?.id}/movements`, {
        type: movementType,
        amount: parseFloat(movementAmount),
        reason: movementReason || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] });
      queryClient.invalidateQueries({ queryKey: ['shift-details'] });
      setShowMovementModal(false);
      setMovementAmount('');
      setMovementReason('');
      toast({ 
        title: movementType === 'cash_in' ? 'Cash Added' : 'Cash Removed', 
        description: `${formatCurrency(parseFloat(movementAmount))} recorded`,
        icon: 'check',
        variant: 'success'
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to add movement', variant: 'destructive', icon: 'error' });
    },
  });

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
            <Clock className="h-6 w-6 text-primary" />
            {t('shifts.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('shifts.manage')}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
            <Store className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">{currentStoreName}</span>
          </div>
          <Button onClick={() => setShowOpenModal(true)} className="gap-2" size="lg">
            <Play className="h-5 w-5" /> {t('shifts.openShift')}
          </Button>
        </div>
      </div>

      {/* Current Shift Status Card */}
      <div className={`rounded-2xl border-2 p-6 ${currentShift ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        {currentLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : currentShift ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <Play className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-emerald-900">{t('shifts.currentShift')}</h2>
                  <p className="text-sm text-emerald-700">{currentShift.shift_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMovementModal(true)}
                  className="gap-2"
                >
                  <DollarSign className="h-4 w-4" /> Cash Movement
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowCloseModal(true)}
                  className="gap-2"
                >
                  <Square className="h-4 w-4" /> {t('shifts.closeShift')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('shifts.startedAt')}</p>
                <p className="text-lg font-semibold mt-1">{formatDateTime(currentShift.opened_at)}</p>
                <p className="text-xs text-emerald-600 mt-1">{formatDuration(currentShift.opened_at)} active</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('shifts.openingCash')}</p>
                <p className="text-lg font-semibold mt-1">{formatCurrency(currentShift.opening_cash)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('shifts.totalSales')}</p>
                <p className="text-lg font-semibold mt-1 text-emerald-600">{formatCurrency(currentShift.total_sales)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-slate-500 uppercase tracking-wide">{t('shifts.transactions')}</p>
                <p className="text-lg font-semibold mt-1">{currentShift.transaction_count}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-slate-200 rounded-xl">
                <Clock className="h-6 w-6 text-slate-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-700">{t('shifts.noOpenShift')}</h2>
                <p className="text-sm text-slate-500">{t('shifts.manage')}</p>
              </div>
            </div>
            <Button onClick={() => setShowOpenModal(true)} className="gap-2" size="lg">
              <Play className="h-5 w-5" /> {t('shifts.openShift')}
            </Button>
          </div>
        )}
      </div>

      {/* Shifts History */}
      <div className="bg-white rounded-xl sm:rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{t('shifts.shiftHistory')}</h3>
          <div className="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
            {(['all', 'open', 'closed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {shiftsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No shifts found</p>
          </div>
        ) : (
          <div className="divide-y">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedShift(shift);
                  setShowDetailsModal(true);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${shift.status === 'open' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      {shift.status === 'open' ? (
                        <Play className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{shift.shift_number}</p>
                      <p className="text-sm text-slate-500">
                        {shift.cashier_first_name} {shift.cashier_last_name || ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Sales</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(shift.total_sales)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Transactions</p>
                      <p className="font-semibold">{shift.transaction_count}</p>
                    </div>
                    <div className="text-right min-w-[120px]">
                      <p className="text-sm text-slate-500">{formatDateTime(shift.opened_at)}</p>
                      {shift.closed_at && (
                        <p className="text-xs text-slate-400">{formatDuration(shift.opened_at, shift.closed_at)}</p>
                      )}
                    </div>
                    {shift.status === 'closed' && shift.cash_difference !== undefined && (
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        shift.cash_difference === 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : shift.cash_difference > 0
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {shift.cash_difference === 0 
                          ? 'Balanced' 
                          : shift.cash_difference > 0 
                          ? `+${formatCurrency(shift.cash_difference)}` 
                          : formatCurrency(shift.cash_difference)}
                      </div>
                    )}
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Shift Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Play className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Open New Shift</h3>
                </div>
                <button onClick={() => setShowOpenModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Opening Cash Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="number"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0.00"
                    className="pl-10 text-lg"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Enter the amount of cash in the drawer at the start of your shift</p>
              </div>
            </div>
            <div className="p-6 border-t bg-slate-50 rounded-b-2xl flex gap-3">
              <Button variant="outline" onClick={() => setShowOpenModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => openShiftMutation.mutate()}
                disabled={openShiftMutation.isPending}
                className="flex-1 gap-2"
              >
                {openShiftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Shift
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && currentShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Square className="h-5 w-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Close Shift</h3>
                </div>
                <button onClick={() => setShowCloseModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Opening Cash</span>
                  <span className="font-medium">{formatCurrency(currentShift.opening_cash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Cash Sales</span>
                  <span className="font-medium text-emerald-600">+{formatCurrency(currentShift.total_cash_payments || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Duration</span>
                  <span className="font-medium">{formatDuration(currentShift.opened_at)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Actual Cash in Drawer *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="number"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="Count your cash"
                    className="pl-10 text-lg"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Enter the amount of cash in the drawer at the end of your shift</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
                <textarea
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Any notes about this shift..."
                  className="w-full p-3 border rounded-lg text-sm resize-none h-20"
                />
              </div>
            </div>
            <div className="p-6 border-t bg-slate-50 rounded-b-2xl flex gap-3">
              <Button variant="outline" onClick={() => setShowCloseModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => closeShiftMutation.mutate()}
                disabled={closeShiftMutation.isPending || !closingCash}
                className="flex-1 gap-2"
              >
                {closeShiftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Close Shift
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Movement Modal */}
      {showMovementModal && currentShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Cash Movement</h3>
                <button onClick={() => setShowMovementModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMovementType('cash_in')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    movementType === 'cash_in'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <ArrowDownCircle className={`h-6 w-6 mx-auto mb-2 ${movementType === 'cash_in' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <p className={`font-medium ${movementType === 'cash_in' ? 'text-emerald-700' : 'text-slate-600'}`}>Cash In</p>
                  <p className="text-xs text-slate-500 mt-1">Add cash to drawer</p>
                </button>
                <button
                  onClick={() => setMovementType('cash_out')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    movementType === 'cash_out'
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <ArrowUpCircle className={`h-6 w-6 mx-auto mb-2 ${movementType === 'cash_out' ? 'text-red-600' : 'text-slate-400'}`} />
                  <p className={`font-medium ${movementType === 'cash_out' ? 'text-red-700' : 'text-slate-600'}`}>Cash Out</p>
                  <p className="text-xs text-slate-500 mt-1">Remove cash from drawer</p>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Amount *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    type="number"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Reason</label>
                <Input
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder="e.g., Change for customer, Petty cash..."
                />
              </div>
            </div>
            <div className="p-6 border-t bg-slate-50 rounded-b-2xl flex gap-3">
              <Button variant="outline" onClick={() => setShowMovementModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => addMovementMutation.mutate()}
                disabled={addMovementMutation.isPending || !movementAmount || parseFloat(movementAmount) <= 0}
                className="flex-1 gap-2"
              >
                {addMovementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Record Movement
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Details Modal */}
      {showDetailsModal && selectedShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedShift.shift_number}</h3>
                  <p className="text-sm text-slate-500">
                    {selectedShift.cashier_first_name} {selectedShift.cashier_last_name || ''} • {selectedShift.store_name}
                  </p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {detailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 uppercase">Total Sales</p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(selectedShift.total_sales)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 uppercase">Transactions</p>
                      <p className="text-xl font-bold mt-1">{selectedShift.transaction_count}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 uppercase">Cash Payments</p>
                      <p className="text-xl font-bold mt-1">{formatCurrency(selectedShift.total_cash_payments)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <p className="text-xs text-slate-500 uppercase">Card Payments</p>
                      <p className="text-xl font-bold mt-1">{formatCurrency(selectedShift.total_card_payments)}</p>
                    </div>
                  </div>

                  {/* Cash Summary */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="font-semibold mb-3">Cash Summary</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Opening Cash</span>
                        <span className="font-medium">{formatCurrency(selectedShift.opening_cash)}</span>
                      </div>
                      {selectedShift.status === 'closed' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Expected Cash</span>
                            <span className="font-medium">{formatCurrency(selectedShift.expected_cash || 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Actual Closing Cash</span>
                            <span className="font-medium">{formatCurrency(selectedShift.closing_cash || 0)}</span>
                          </div>
                          <div className="border-t pt-2 mt-2 flex justify-between">
                            <span className="font-medium">Difference</span>
                            <span className={`font-bold ${
                              (selectedShift.cash_difference || 0) === 0 ? 'text-emerald-600' :
                              (selectedShift.cash_difference || 0) > 0 ? 'text-blue-600' : 'text-red-600'
                            }`}>
                              {(selectedShift.cash_difference || 0) >= 0 ? '+' : ''}{formatCurrency(selectedShift.cash_difference || 0)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Time Details */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h4 className="font-semibold mb-3">Time Details</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Opened At</span>
                        <span className="font-medium">{formatDateTime(selectedShift.opened_at)}</span>
                      </div>
                      {selectedShift.closed_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Closed At</span>
                          <span className="font-medium">{formatDateTime(selectedShift.closed_at)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Duration</span>
                        <span className="font-medium">{formatDuration(selectedShift.opened_at, selectedShift.closed_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cash Movements */}
                  {shiftDetailsData?.movements && shiftDetailsData.movements.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Cash Movements</h4>
                      <div className="space-y-2">
                        {shiftDetailsData.movements.map((movement: CashMovement) => (
                          <div key={movement.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              {movement.type === 'cash_in' || movement.type === 'pickup' ? (
                                <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
                              ) : (
                                <ArrowUpCircle className="h-5 w-5 text-red-500" />
                              )}
                              <div>
                                <p className="font-medium capitalize">{movement.type.replace('_', ' ')}</p>
                                {movement.reason && <p className="text-xs text-slate-500">{movement.reason}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold ${
                                movement.type === 'cash_in' || movement.type === 'pickup' ? 'text-emerald-600' : 'text-red-600'
                              }`}>
                                {movement.type === 'cash_in' || movement.type === 'pickup' ? '+' : '-'}{formatCurrency(movement.amount)}
                              </p>
                              <p className="text-xs text-slate-500">{formatDateTime(movement.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedShift.notes && (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                      <h4 className="font-semibold text-amber-800 mb-2">Notes</h4>
                      <p className="text-sm text-amber-700">{selectedShift.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 flex-shrink-0">
              <Button variant="outline" onClick={() => setShowDetailsModal(false)} className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
