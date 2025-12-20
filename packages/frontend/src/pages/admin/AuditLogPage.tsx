import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText, Filter, User, Package, Store,
  Settings, Loader2, RefreshCw, Clock, Activity
} from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string;
  user_email: string;
  first_name: string;
  last_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: any;
  after_data: any;
  created_at: string;
}

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 border-green-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-red-100 text-red-700 border-red-200',
  PASSWORD_RESET: 'bg-purple-100 text-purple-700 border-purple-200',
  LOGIN: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  LOGOUT: 'bg-gray-100 text-gray-700 border-gray-200',
};

const entityIcons: Record<string, any> = {
  user: User,
  product: Package,
  store: Store,
  settings: Settings,
  sale: Activity,
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['admin-audit-logs', filters],
    queryFn: async () => {
      const params: any = { limit: 100 };
      if (filters.action) params.action = filters.action;
      if (filters.entityType) params.entityType = filters.entityType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      const res = await api.get('/admin/audit-logs', { params });
      return res.data;
    },
  });

  const logs: AuditLog[] = logsData?.logs || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const clearFilters = () => {
    setFilters({ action: '', entityType: '', startDate: '', endDate: '' });
  };

  const hasFilters = filters.action || filters.entityType || filters.startDate || filters.endDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">Track all system activity and changes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" /> Filters
            {hasFilters && <span className="bg-white text-primary rounded-full w-5 h-5 text-xs flex items-center justify-center">!</span>}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Action</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                <option value="">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="PASSWORD_RESET">Password Reset</option>
                <option value="LOGIN">Login</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Entity Type</label>
              <select
                value={filters.entityType}
                onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                <option value="">All Types</option>
                <option value="user">User</option>
                <option value="product">Product</option>
                <option value="store">Store</option>
                <option value="settings">Settings</option>
                <option value="sale">Sale</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
          {hasFilters && (
            <div className="mt-4 pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.filter(l => l.action === 'CREATE').length}</p>
              <p className="text-xs text-muted-foreground">Created</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.filter(l => l.action === 'UPDATE').length}</p>
              <p className="text-xs text-muted-foreground">Updated</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.filter(l => l.action === 'DELETE').length}</p>
              <p className="text-xs text-muted-foreground">Deleted</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-xs text-muted-foreground">Total Events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No audit logs found</p>
            <p className="text-sm">Activity will appear here as users interact with the system</p>
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => {
              const EntityIcon = entityIcons[log.entity_type] || Activity;
              return (
                <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <EntityIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {log.first_name} {log.last_name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${actionColors[log.action] || 'bg-gray-100'}`}>
                          {log.action}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {log.entity_type}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {log.user_email}
                      </p>
                      {(log.after_data || log.before_data) && (
                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono text-muted-foreground">
                          {JSON.stringify(log.after_data || log.before_data, null, 2)}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium">{getRelativeTime(log.created_at)}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {formatDate(log.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
