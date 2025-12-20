import { create } from 'zustand';

interface Toast {
  id: string;
  key?: string; // Custom key for updating existing toasts
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  icon?: 'cart' | 'check' | 'error' | 'info';
  count?: number; // For showing quantity updates
}

interface ToastOptions extends Omit<Toast, 'id'> {
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  toast: (toast: ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const timeoutMap = new Map<string, NodeJS.Timeout>();

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  toast: (options) => {
    const { key, duration = 3000, ...toastData } = options;
    
    // If a key is provided, update existing toast with same key
    if (key) {
      const existing = get().toasts.find(t => t.key === key);
      
      if (existing) {
        // Clear existing timeout
        const existingTimeout = timeoutMap.get(existing.id);
        if (existingTimeout) clearTimeout(existingTimeout);
        
        // Update the existing toast
        set((state) => ({
          toasts: state.toasts.map(t => 
            t.key === key 
              ? { ...t, ...toastData, count: (t.count || 1) + 1 }
              : t
          )
        }));
        
        // Set new timeout
        const timeout = setTimeout(() => {
          set((state) => ({ toasts: state.toasts.filter((t) => t.key !== key) }));
          timeoutMap.delete(existing.id);
        }, duration);
        timeoutMap.set(existing.id, timeout);
        
        return;
      }
    }
    
    // Create new toast
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { ...toastData, id, key, count: 1 }] }));
    
    const timeout = setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      timeoutMap.delete(id);
    }, duration);
    timeoutMap.set(id, timeout);
  },
  dismiss: (id) => {
    const timeout = timeoutMap.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutMap.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  dismissAll: () => {
    timeoutMap.forEach(timeout => clearTimeout(timeout));
    timeoutMap.clear();
    set({ toasts: [] });
  },
}));

export function toast(props: ToastOptions) {
  useToast.getState().toast(props);
}
