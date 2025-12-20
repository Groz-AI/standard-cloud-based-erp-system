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
  Loader2, Search, Download, Printer, Eye, Filter, X,
  FileText, CheckCircle, Clock, Truck, RotateCcw
} from 'lucide-react';

interface GRNData {
  id: string;
  grn_number: string;
  grn_date: string;
  status: string;
  total_amount: number;
  supplier_name?: string;
  supplier_code?: string;
  store_name: string;
  received_by_name?: string;
  reference_number?: string;
  notes?: string;
}

export default function GRNPage() {
  const { t } = useTranslation();
  const { currentStoreId, tenant } = useAuthStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // const [selectedGRN, setSelectedGRN] = useState<GRNData | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['grns', currentStoreId, search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/inventory/grns', {
        params: {
          storeId: currentStoreId,
          search: search || undefined,
          status: statusFilter || undefined
        }
      });
      return res.data;
    },
  });

  const grns: GRNData[] = data?.grns || [];

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const handlePreview = async (grnId: string) => {
    setDownloadingId(grnId);
    try {
      const response = await api.get(`/documents/grn/${grnId}`, {
        params: { format: 'a4' },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      toast({ title: 'Preview failed', description: 'Could not load GRN', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownload = async (grn: GRNData) => {
    setDownloadingId(grn.id);
    try {
      const response = await api.get(`/documents/grn/${grn.id}`, {
        params: { format: 'a4' },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `grn-${grn.grn_number}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: `GRN ${grn.grn_number} saved` });
    } catch (error) {
      toast({ title: 'Download failed', description: 'Could not download GRN', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrint = async (grnId: string) => {
    setDownloadingId(grnId);
    try {
      const response = await api.get(`/documents/grn/${grnId}`, {
        params: { format: 'a4' },
        responseType: 'blob'
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => printWindow.print();
      }
    } catch (error) {
      toast({ title: 'Print failed', description: 'Could not load GRN', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium"><CheckCircle className="h-3 w-3" /> Received</span>;
      case 'draft':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium"><Clock className="h-3 w-3" /> Draft</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium"><X className="h-3 w-3" /> Cancelled</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('inventory.grn')}</h1>
          <p className="text-muted-foreground">{t('inventory.grnDesc')}</p>
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
              placeholder={t('inventory.searchGrn')}
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
            <Filter className="h-4 w-4 mr-2" /> {t('common.filters')}
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t flex gap-4">
            <div className="w-48">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">All Statuses</option>
                <option value="received">Received</option>
                <option value="draft">Draft</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter(''); }} className="text-slate-500">
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* GRN Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground mt-2">Loading GRNs...</p>
          </div>
        ) : grns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Truck className="h-8 w-8 text-slate-400" />
            </div>
            <p className="font-medium text-slate-700">No GRNs found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Goods received notes will appear here after receiving inventory
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-slate-50/80">
                <tr>
                  <th className="text-left p-4 font-semibold text-slate-600">GRN #</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Date</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Supplier</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Reference</th>
                  <th className="text-left p-4 font-semibold text-slate-600">Status</th>
                  <th className="text-right p-4 font-semibold text-slate-600">Total</th>
                  <th className="text-center p-4 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grns.map((grn) => (
                  <tr key={grn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="font-medium">{grn.grn_number}</span>
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">{formatDate(grn.grn_date)}</td>
                    <td className="p-4">
                      {grn.supplier_name ? (
                        <div>
                          <p className="font-medium">{grn.supplier_name}</p>
                          {grn.supplier_code && (
                            <p className="text-xs text-slate-500">{grn.supplier_code}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">{grn.reference_number || '-'}</td>
                    <td className="p-4">{getStatusBadge(grn.status)}</td>
                    <td className="p-4 text-right">
                      <span className="font-semibold">
                        {formatCurrency(grn.total_amount, tenant?.currencyCode)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePreview(grn.id)}
                          title="Preview"
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(grn)}
                          disabled={downloadingId === grn.id}
                          title="Download PDF"
                          className="h-8 w-8"
                        >
                          {downloadingId === grn.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrint(grn.id)}
                          title="Print"
                          className="h-8 w-8"
                        >
                          <Printer className="h-4 w-4 text-violet-600" />
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
    </div>
  );
}
