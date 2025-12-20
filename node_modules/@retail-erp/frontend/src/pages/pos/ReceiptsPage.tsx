import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { 
  Receipt, Loader2, Search, Download, Printer, Eye,
  Filter, X, FileText, CheckCircle, XCircle, RotateCcw
} from 'lucide-react';

interface ReceiptData {
  id: string;
  receipt_number: string;
  receipt_date: string;
  total_amount: number;
  status: string;
  type?: string;
  store_name: string;
  cashier_name: string;
  customer_name?: string;
  customer_phone?: string;
  payments?: any[];
}

export default function ReceiptsPage() {
  const { t } = useTranslation();
  const { currentStoreId, tenant } = useAuthStore();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['receipts', currentStoreId, search, startDate, endDate, statusFilter],
    queryFn: async () => {
      const res = await api.get('/receipts', { 
        params: { 
          storeId: currentStoreId,
          search: search || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          status: statusFilter || undefined
        } 
      });
      return res.data;
    },
  });

  const receipts: ReceiptData[] = data?.receipts || [];

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handlePreview = async (receiptId: string, format: 'thermal' | 'a4' = 'thermal') => {
    setDownloadingId(receiptId);
    try {
      const response = await api.get(`/documents/receipt/${receiptId}`, {
        params: { format, reprint: 'true' },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      toast({ title: t('common.error'), description: 'Could not load receipt', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownload = async (receipt: ReceiptData, format: 'thermal' | 'a4' = 'thermal') => {
    setDownloadingId(receipt.id);
    try {
      const response = await api.get(`/documents/receipt/${receipt.id}`, {
        params: { format, reprint: 'true' },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receipt.receipt_number}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: `Receipt ${receipt.receipt_number} saved` });
    } catch (error) {
      toast({ title: t('common.error'), description: 'Could not download receipt', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrint = async (receiptId: string, format: 'thermal' | 'a4' = 'thermal') => {
    setDownloadingId(receiptId);
    try {
      const response = await api.get(`/documents/receipt/${receiptId}`, {
        params: { format, reprint: 'true' },
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
      setDownloadingId(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium"><CheckCircle className="h-3 w-3" /> {t('receipts.completed')}</span>;
      case 'voided':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium"><XCircle className="h-3 w-3" /> {t('receipts.cancelled')}</span>;
      case 'refunded':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium"><RotateCcw className="h-3 w-3" /> Refunded</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('receipts.title')}</h1>
          <p className="text-muted-foreground">{t('receipts.manage')}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RotateCcw className="h-4 w-4 mr-2" /> {t('common.refresh')}
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('receipts.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-slate-100' : ''}
          >
            <Filter className="h-4 w-4 mr-2" /> {t('common.filter')}
          </Button>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('reports.startDate')}</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('reports.endDate')}</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">{t('receipts.status')}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">{t('receipts.allStatuses')}</option>
                <option value="completed">{t('receipts.completed')}</option>
                <option value="voided">{t('receipts.cancelled')}</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={clearFilters} className="text-slate-500">
                <X className="h-4 w-4 mr-1" /> {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-2">{t('common.loading')}</p>
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt className="h-8 w-8 text-slate-400" />
            </div>
            <p className="font-medium text-slate-700">{t('receipts.noReceipts')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || startDate || endDate || statusFilter 
                ? 'Try adjusting your filters' 
                : 'Sales receipts will appear here after completing transactions'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-slate-50/80">
                <tr>
                  <th className="text-left p-4 font-semibold text-slate-600">Receipt #</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Date & Time</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Customer</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Cashier</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Status</th>
                  <th className="text-right p-4 font-semibold text-slate-600">Total</th>
                  <th className="text-center p-4 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="font-medium">{receipt.receipt_number}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">{formatDate(receipt.receipt_date)}</td>
                    <td className="p-4">
                      {receipt.customer_name ? (
                        <div>
                          <p className="font-medium">{receipt.customer_name}</p>
                          {receipt.customer_phone && (
                            <p className="text-xs text-slate-500">{receipt.customer_phone}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Walk-in</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">{receipt.cashier_name}</td>
                    <td className="p-4">{getStatusBadge(receipt.status)}</td>
                    <td className="p-4 text-right">
                      <span className="font-semibold text-emerald-600">
                        {formatCurrency(receipt.total_amount, tenant?.currencyCode)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreview(receipt.id, 'thermal')}
                          title="Preview (Thermal)"
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(receipt, 'thermal')}
                          disabled={downloadingId === receipt.id}
                          title="Download PDF"
                          className="h-8 w-8"
                        >
                          {downloadingId === receipt.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrint(receipt.id, 'thermal')}
                          title="Print Receipt"
                          className="h-8 w-8"
                        >
                          <Printer className="h-4 w-4 text-violet-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedReceipt(receipt)}
                          className="text-xs"
                        >
                          More
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

      {/* Receipt Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Receipt #{selectedReceipt.receipt_number}</h3>
                <button onClick={() => setSelectedReceipt(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-1">{formatDate(selectedReceipt.receipt_date)}</p>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium">{selectedReceipt.customer_name || 'Walk-in'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cashier</span>
                  <span>{selectedReceipt.cashier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Store</span>
                  <span>{selectedReceipt.store_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  {getStatusBadge(selectedReceipt.status)}
                </div>
                <div className="flex justify-between pt-3 border-t">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-emerald-600 text-lg">
                    {formatCurrency(selectedReceipt.total_amount, tenant?.currencyCode)}
                  </span>
                </div>
              </div>

              <p className="text-sm font-medium text-slate-700 mb-3">Download / Print Options</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => handleDownload(selectedReceipt, 'thermal')}>
                  <Download className="h-4 w-4 mr-2" /> Thermal
                </Button>
                <Button variant="outline" onClick={() => handleDownload(selectedReceipt, 'a4')}>
                  <Download className="h-4 w-4 mr-2" /> A4 Invoice
                </Button>
                <Button variant="outline" onClick={() => handlePrint(selectedReceipt.id, 'thermal')}>
                  <Printer className="h-4 w-4 mr-2" /> Print 80mm
                </Button>
                <Button variant="outline" onClick={() => handlePrint(selectedReceipt.id, 'a4')}>
                  <Printer className="h-4 w-4 mr-2" /> Print A4
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
