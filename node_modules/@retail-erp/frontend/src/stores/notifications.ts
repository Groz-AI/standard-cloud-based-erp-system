import { create } from 'zustand';

export interface StockNotification {
  id: string;
  type: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  message: string;
  productName?: string;
  sku?: string;
  currentStock?: number;
  suggestedQuantity?: number;
  timestamp: Date;
  read: boolean;
  dismissed: boolean;
}

interface NotificationState {
  notifications: StockNotification[];
  soundEnabled: boolean;
  lastFetchTime: Date | null;
  unreadCount: number;
  
  // Actions
  addNotification: (notification: Omit<StockNotification, 'id' | 'timestamp' | 'read' | 'dismissed'>) => void;
  addNotifications: (notifications: Omit<StockNotification, 'id' | 'timestamp' | 'read' | 'dismissed'>[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  clearAll: () => void;
  toggleSound: () => void;
  setLastFetchTime: (time: Date) => void;
}

// Apple-like notification sounds using Web Audio API
const playNotificationSound = (type: 'critical' | 'high' | 'medium' | 'info') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const now = audioCtx.currentTime;
    
    // Create a pleasant chime with harmonics (Apple-style)
    const playChime = (freq: number, startTime: number, duration: number, volume: number) => {
      // Main tone
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = freq;
      gain1.gain.setValueAtTime(volume, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + duration);
      
      // Harmonic (octave higher, softer)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 2;
      gain2.gain.setValueAtTime(volume * 0.3, startTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(startTime);
      osc2.stop(startTime + duration);
      
      // Fifth harmonic (subtle shimmer)
      const osc3 = audioCtx.createOscillator();
      const gain3 = audioCtx.createGain();
      osc3.type = 'sine';
      osc3.frequency.value = freq * 1.5;
      gain3.gain.setValueAtTime(volume * 0.15, startTime);
      gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.5);
      osc3.connect(gain3);
      gain3.connect(audioCtx.destination);
      osc3.start(startTime);
      osc3.stop(startTime + duration);
    };
    
    if (type === 'critical') {
      // Tri-tone alert (like Apple's critical alert) - G5, E5, C5
      playChime(784, now, 0.15, 0.25);           // G5
      playChime(659, now + 0.12, 0.15, 0.25);   // E5
      playChime(523, now + 0.24, 0.25, 0.3);    // C5
    } else if (type === 'high') {
      // Two-tone chime (like iMessage) - A5, E5
      playChime(880, now, 0.12, 0.2);           // A5
      playChime(659, now + 0.1, 0.2, 0.25);     // E5
    } else if (type === 'medium') {
      // Single pleasant chime (like macOS notification) - F5
      playChime(698, now, 0.3, 0.18);           // F5
    } else {
      // Soft subtle ping (like Slack) - C6
      playChime(1047, now, 0.2, 0.1);           // C6
    }
  } catch (e) {
    console.log('Could not play notification sound');
  }
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  soundEnabled: true,
  lastFetchTime: null,
  unreadCount: 0,
  
  addNotification: (notification) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: StockNotification = {
      ...notification,
      id,
      timestamp: new Date(),
      read: false,
      dismissed: false,
    };
    
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 100), // Keep max 100
      unreadCount: state.unreadCount + 1,
    }));
    
    if (get().soundEnabled) {
      playNotificationSound(notification.type);
    }
  },
  
  addNotifications: (notifications) => {
    const newNotifications = notifications.map((n, i) => ({
      ...n,
      id: `notif-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
      dismissed: false,
    }));
    
    set((state) => ({
      notifications: [...newNotifications, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + newNotifications.length,
    }));
    
    // Play sound for highest priority
    if (get().soundEnabled && notifications.length > 0) {
      const highestPriority = notifications.reduce((highest, n) => {
        const order = { critical: 0, high: 1, medium: 2, info: 3 };
        return order[n.type] < order[highest.type] ? n : highest;
      });
      playNotificationSound(highestPriority.type);
    }
  },
  
  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
    }));
  },
  
  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
  
  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
    }));
  },
  
  dismissAll: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, dismissed: true, read: true })),
      unreadCount: 0,
    }));
  },
  
  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },
  
  toggleSound: () => {
    set((state) => ({ soundEnabled: !state.soundEnabled }));
  },
  
  setLastFetchTime: (time) => {
    set({ lastFetchTime: time });
  },
}));
