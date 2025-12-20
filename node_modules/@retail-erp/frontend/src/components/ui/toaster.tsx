import { useToast } from '@/hooks/use-toast';
import { X, ShoppingCart, Check, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  cart: ShoppingCart,
  check: Check,
  error: AlertCircle,
  info: Info,
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = toast.icon ? iconMap[toast.icon] : null;
        const isSuccess = toast.variant === 'success' || toast.icon === 'cart' || toast.icon === 'check';
        const isError = toast.variant === 'destructive' || toast.icon === 'error';
        
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto animate-in slide-in-from-top-2 fade-in-0 duration-300',
              'rounded-xl border shadow-xl backdrop-blur-sm',
              'flex items-center gap-3 px-4 py-3 min-w-[280px] max-w-[380px]',
              'transition-all hover:scale-[1.02]',
              isSuccess && 'bg-emerald-50 border-emerald-200 text-emerald-900',
              isError && 'bg-red-50 border-red-200 text-red-900',
              !isSuccess && !isError && 'bg-white border-slate-200 text-slate-900'
            )}
          >
            {/* Icon */}
            {Icon && (
              <div className={cn(
                'flex-shrink-0 p-2 rounded-lg',
                isSuccess && 'bg-emerald-100',
                isError && 'bg-red-100',
                !isSuccess && !isError && 'bg-slate-100'
              )}>
                <Icon className={cn(
                  'h-4 w-4',
                  isSuccess && 'text-emerald-600',
                  isError && 'text-red-600',
                  !isSuccess && !isError && 'text-slate-600'
                )} />
              </div>
            )}
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {toast.title && (
                  <p className="font-semibold text-sm truncate">{toast.title}</p>
                )}
                {toast.count && toast.count > 1 && (
                  <span className={cn(
                    'flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold',
                    isSuccess && 'bg-emerald-200 text-emerald-700',
                    isError && 'bg-red-200 text-red-700',
                    !isSuccess && !isError && 'bg-slate-200 text-slate-700'
                  )}>
                    ×{toast.count}
                  </span>
                )}
              </div>
              {toast.description && (
                <p className={cn(
                  'text-xs mt-0.5 truncate',
                  isSuccess && 'text-emerald-700',
                  isError && 'text-red-700',
                  !isSuccess && !isError && 'text-slate-600'
                )}>
                  {toast.description}
                </p>
              )}
            </div>
            
            {/* Close button */}
            <button
              onClick={() => dismiss(toast.id)}
              className={cn(
                'flex-shrink-0 p-1 rounded-lg transition-colors',
                isSuccess && 'hover:bg-emerald-200 text-emerald-600',
                isError && 'hover:bg-red-200 text-red-600',
                !isSuccess && !isError && 'hover:bg-slate-200 text-slate-500'
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
