import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Mail, Lock, ArrowRight, Loader2, Sparkles, Zap, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      
      const { isSuperAdmin } = useAuthStore.getState();
      if (isSuperAdmin) {
        navigate('/super-admin');
        toast({ title: 'Welcome, Super Admin!', description: 'You have been logged in.' });
      } else {
        navigate('/dashboard');
        toast({ title: 'Welcome back!', description: 'You have been logged in successfully.' });
      }
    } catch (error: any) {
      const message = error.response?.data?.error || 'Invalid email or password.';
      toast({ title: 'Login failed', description: message, variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3 text-center">
        {/* AI-Powered Badge */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200/50 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI-POWERED
            </span>
            <Zap className="w-3.5 h-3.5 text-blue-600" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent">
          {t('auth.welcomeBack')}
        </h2>
        <p className="text-sm text-gray-600 font-medium">
          {t('auth.enterDetails')}
        </p>
        <p className="text-xs text-gray-500 italic mt-2">
          Enterprise Retail ERP with AI-Powered Forecasting & Analytics
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2.5">
          <label htmlFor="email" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-500" />
            {t('auth.email')}
          </label>
          <Input
            id="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="h-12 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>

        <div className="space-y-2.5">
          <label htmlFor="password" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            {t('auth.password')}
          </label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30 text-base font-semibold transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02]" 
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {t('auth.signIn')}...
          </>
        ) : (
          <>
            {t('auth.signIn')}
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </Button>

      <div className="pt-4 border-t border-gray-200/50">
        <p className="text-center text-xs text-gray-500">
          Need an account? Contact your system administrator
        </p>
      </div>

      {/* GrozAI Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200/50">
        <div className="text-center space-y-2">
          <p className="text-xs text-gray-600 font-medium">
            Powered by <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">GrozAI</span>
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <Phone className="w-3 h-3" />
            <a 
              href="tel:+201097459765" 
              className="hover:text-blue-600 transition-colors font-medium"
            >
              +20 109 745 9765
            </a>
          </div>
          <p className="text-xs text-gray-400">
            Enterprise Solutions & AI Development
          </p>
        </div>
      </div>
    </form>
  );
}
