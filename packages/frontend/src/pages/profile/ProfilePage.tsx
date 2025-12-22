import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/auth';
import {
  User, Mail, Lock, Save, Eye, EyeOff, Shield, AlertCircle
} from 'lucide-react';

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Email change form
  const [emailForm, setEmailForm] = useState({
    newEmail: '',
    password: ''
  });

  // Password change form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Email change mutation
  const emailMutation = useMutation({
    mutationFn: async (data: { newEmail: string; password: string }) => {
      const res = await api.post('/auth/change-email', data);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Email changed successfully. Please log in again with your new email.',
      });
      setEmailForm({ newEmail: '', password: '' });
      setTimeout(() => logout(), 2000);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'Failed to change email',
        variant: 'destructive',
      });
    },
  });

  // Password change mutation
  const passwordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await api.post('/auth/change-password', data);
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Password changed successfully. Please log in again.',
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => logout(), 2000);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error?.message || 'Failed to change password',
        variant: 'destructive',
      });
    },
  });

  const handleEmailChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.newEmail || !emailForm.password) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    emailMutation.mutate(emailForm);
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    passwordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <User className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          My Profile
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Manage your account settings and security
        </p>
      </div>

      {/* Current Account Info */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Account Information</h2>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Name:</span>
            <span className="font-medium">{user?.firstName} {user?.lastName || ''}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Current Email:</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          {user?.isSuperAdmin && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700">Super Administrator Account</span>
            </div>
          )}
        </div>
      </div>

      {/* Change Email */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Change Email Address</h2>
        </div>
        <form onSubmit={handleEmailChange} className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Email Address</label>
            <Input
              type="email"
              placeholder="Enter new email"
              value={emailForm.newEmail}
              onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
              disabled={emailMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Password (for verification)</label>
            <Input
              type="password"
              placeholder="Enter your current password"
              value={emailForm.password}
              onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
              disabled={emailMutation.isPending}
            />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              You will be logged out after changing your email and need to log in again with your new email address.
            </p>
          </div>
          <Button
            type="submit"
            disabled={emailMutation.isPending}
            className="w-full sm:w-auto gap-2"
          >
            <Save className="h-4 w-4" />
            {emailMutation.isPending ? 'Changing Email...' : 'Change Email'}
          </Button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Password</label>
            <div className="relative">
              <Input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                disabled={passwordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">New Password</label>
            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Enter new password (min. 8 characters)"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                disabled={passwordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm New Password</label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                disabled={passwordMutation.isPending}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              You will be logged out after changing your password and need to log in again with your new password.
            </p>
          </div>
          <Button
            type="submit"
            disabled={passwordMutation.isPending}
            className="w-full sm:w-auto gap-2"
          >
            <Save className="h-4 w-4" />
            {passwordMutation.isPending ? 'Changing Password...' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
