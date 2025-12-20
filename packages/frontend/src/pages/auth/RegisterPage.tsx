import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Building2, Link2, Store, User, Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function RegisterPage() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    tenantName: '', tenantSlug: '', adminEmail: '', adminPassword: '',
    adminFirstName: '', storeName: ''
  });
  const { register, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(formData);
      toast({ title: 'Welcome!', description: 'Your account has been created.' });
    } catch (error) {
      toast({ title: 'Registration failed', description: 'Please check your details.', variant: 'destructive' });
    }
  };

  const updateField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-gray-900 to-gray-700 bg-clip-text text-transparent">
          {t('auth.createAccount')}
        </h2>
        <p className="text-sm text-gray-600 font-medium">
          {t('auth.enterDetails')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-500" />
              {t('auth.firstName')}
            </label>
            <Input 
              placeholder="My Store" 
              value={formData.tenantName} 
              onChange={updateField('tenantName')} 
              required 
              className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-gray-500" />
              URL
            </label>
            <Input 
              placeholder="my-store" 
              value={formData.tenantSlug} 
              onChange={updateField('tenantSlug')} 
              required 
              className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-gray-500" />
            {t('auth.firstName')}
          </label>
          <Input 
            placeholder="Main Store" 
            value={formData.storeName} 
            onChange={updateField('storeName')} 
            required 
            className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-gray-500" />
            {t('auth.firstName')}
          </label>
          <Input 
            placeholder="John Smith" 
            value={formData.adminFirstName} 
            onChange={updateField('adminFirstName')} 
            required 
            className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-gray-500" />
            {t('auth.email')}
          </label>
          <Input 
            type="email" 
            placeholder="name@company.com" 
            value={formData.adminEmail} 
            onChange={updateField('adminEmail')} 
            required 
            className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-gray-500" />
            {t('auth.password')}
          </label>
          <Input 
            type="password" 
            placeholder="At least 8 characters" 
            value={formData.adminPassword} 
            onChange={updateField('adminPassword')} 
            required 
            minLength={8}
            className="h-11 bg-white/60 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
          <p className="text-xs text-gray-500 mt-1">Use a strong password with letters, numbers and symbols</p>
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
            Creating workspace...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            Create workspace
          </>
        )}
      </Button>

      <div className="pt-4 border-t border-gray-200/50">
        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
