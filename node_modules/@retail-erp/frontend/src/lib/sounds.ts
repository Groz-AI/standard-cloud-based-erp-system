// Apple-like transaction sounds for interactive feedback

type SoundType = 'success' | 'error' | 'warning' | 'notification' | 'cash' | 'scan';

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    }
    return audioContext;
  } catch {
    return null;
  }
};

// Create a pleasant chime with harmonics (Apple-style)
const playChime = (
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number
) => {
  // Main tone
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = freq;
  gain1.gain.setValueAtTime(volume, startTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(startTime);
  osc1.stop(startTime + duration);

  // Harmonic (octave higher, softer)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;
  gain2.gain.setValueAtTime(volume * 0.25, startTime);
  gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(startTime);
  osc2.stop(startTime + duration);

  // Fifth harmonic (subtle shimmer)
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.value = freq * 1.5;
  gain3.gain.setValueAtTime(volume * 0.12, startTime);
  gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.4);
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.start(startTime);
  osc3.stop(startTime + duration);
};

export const playSound = (type: SoundType) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  try {
    switch (type) {
      case 'success':
        // Ascending two-tone chime (like Apple Pay success) - C5, E5, G5
        playChime(ctx, 523, now, 0.12, 0.2);        // C5
        playChime(ctx, 659, now + 0.08, 0.12, 0.22); // E5
        playChime(ctx, 784, now + 0.16, 0.25, 0.25); // G5
        break;

      case 'cash':
        // Cash register / payment sound - cheerful ascending
        playChime(ctx, 523, now, 0.1, 0.18);         // C5
        playChime(ctx, 659, now + 0.07, 0.1, 0.2);   // E5
        playChime(ctx, 784, now + 0.14, 0.12, 0.22); // G5
        playChime(ctx, 1047, now + 0.21, 0.2, 0.25); // C6
        break;

      case 'scan':
        // Quick scan beep - short pleasant ping
        playChime(ctx, 880, now, 0.08, 0.15);        // A5
        break;

      case 'error':
        // Descending two-tone (gentle error) - E5, C5
        playChime(ctx, 659, now, 0.15, 0.2);         // E5
        playChime(ctx, 523, now + 0.12, 0.2, 0.22);  // C5
        break;

      case 'warning':
        // Two quick notes - attention grabber
        playChime(ctx, 698, now, 0.1, 0.18);         // F5
        playChime(ctx, 698, now + 0.15, 0.15, 0.2);  // F5
        break;

      case 'notification':
        // Single pleasant chime (like macOS notification)
        playChime(ctx, 880, now, 0.1, 0.15);         // A5
        playChime(ctx, 1047, now + 0.08, 0.2, 0.18); // C6
        break;

      default:
        playChime(ctx, 698, now, 0.2, 0.15);         // F5
    }
  } catch (e) {
    console.log('Could not play sound');
  }
};

// Convenience exports
export const playSuccessSound = () => playSound('success');
export const playCashSound = () => playSound('cash');
export const playScanSound = () => playSound('scan');
export const playErrorSound = () => playSound('error');
export const playWarningSound = () => playSound('warning');
export const playNotificationSound = () => playSound('notification');
