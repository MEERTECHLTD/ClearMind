import React, { useState } from 'react';
import { 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  LogIn, 
  UserPlus, 
  ArrowLeft, 
  Shield,
  Github,
  AlertCircle,
  HardDrive,
  Cloud,
  Smartphone,
  Monitor,
  CheckCircle2
} from 'lucide-react';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';

// Simple inline validation functions (temporary - will use utils/security.ts later)
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 320;
};

const isValidNickname = (nickname: string): boolean => {
  if (!nickname || nickname.length < 2 || nickname.length > 50) return false;
  const regex = /^[a-zA-Z0-9 _-]+$/;
  return regex.test(nickname);
};

const sanitizeInput = (input: string, maxLength: number = 10000): string => {
  if (!input) return '';
  let sanitized = input.trim();
  if (sanitized.length > maxLength) sanitized = sanitized.substring(0, maxLength);
  sanitized = sanitized.replace(/\0/g, '');
  return sanitized;
};

interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

const validatePassword = (password: string): PasswordValidation => {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters long');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (password.length > 128) errors.push('Password is too long (maximum 128 characters)');
  return { isValid: errors.length === 0, errors };
};

interface AuthViewProps {
  onAuthSuccess: (user: any) => void;
  onSkip: (nickname?: string) => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, onSkip }) => {
  const [authType, setAuthType] = useState<'choose' | 'cloud' | 'local'>('choose');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [localNickname, setLocalNickname] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const firebaseReady = isFirebaseConfigured();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseReady) {
      setError('Firebase is not configured. Please add your Firebase credentials.');
      return;
    }

    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      // Validate and sanitize email
      const sanitizedEmail = sanitizeInput(email, 320).trim().toLowerCase();
      if (!isValidEmail(sanitizedEmail)) {
        throw new Error('Please enter a valid email address');
      }

      if (mode === 'signup') {
        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          throw new Error(passwordValidation.errors[0]);
        }
        
        // Validate and sanitize nickname
        const sanitizedNickname = sanitizeInput(nickname, 50).trim();
        if (!isValidNickname(sanitizedNickname)) {
          throw new Error('Nickname must be 2-50 characters and contain only letters, numbers, spaces, hyphens, or underscores');
        }
        
        const user = await firebaseService.signUpWithEmail(sanitizedEmail, password, sanitizedNickname);
        setMessage('Account created! Please check your email to verify.');
        setTimeout(() => onAuthSuccess({
          id: user.uid,
          nickname: user.displayName || sanitizedNickname,
          email: user.email,
          photoURL: user.photoURL,
          provider: 'email',
          joinedAt: new Date().toISOString()
        }), 1500);
      } else if (mode === 'login') {
        const user = await firebaseService.signInWithEmail(sanitizedEmail, password);
        onAuthSuccess({
          id: user.uid,
          nickname: user.displayName || 'User',
          email: user.email,
          photoURL: user.photoURL,
          provider: 'email',
          joinedAt: new Date().toISOString()
        });
      } else if (mode === 'reset') {
        await firebaseService.resetPassword(sanitizedEmail);
        setMessage('Password reset email sent! Check your inbox.');
        setTimeout(() => setMode('login'), 3000);
      }
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code) || err.message || 'An error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!firebaseReady) {
      setError('Firebase is not configured');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const user = await firebaseService.signInWithGoogle();
      onAuthSuccess({
        id: user.uid,
        nickname: user.displayName || 'User',
        email: user.email,
        photoURL: user.photoURL,
        provider: 'google',
        joinedAt: new Date().toISOString()
      });
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code) || err.message || 'Failed to sign in with Google';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = async () => {
    if (!firebaseReady) {
      setError('Firebase is not configured');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const user = await firebaseService.signInWithGithub();
      onAuthSuccess({
        id: user.uid,
        nickname: user.displayName || 'User',
        email: user.email,
        photoURL: user.photoURL,
        provider: 'github',
        joinedAt: new Date().toISOString()
      });
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code) || err.message || 'Failed to sign in with GitHub';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    if (!firebaseReady) {
      setError('Firebase is not configured');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const user = await firebaseService.signInAnonymously();
      onAuthSuccess({
        id: user.uid,
        nickname: 'Guest',
        email: null,
        photoURL: null,
        provider: 'anonymous',
        joinedAt: new Date().toISOString()
      });
    } catch (err: any) {
      const errorMessage = getFirebaseErrorMessage(err.code) || err.message || 'Failed to sign in anonymously';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Map Firebase error codes to user-friendly messages
  const getFirebaseErrorMessage = (code: string): string => {
    const errorMessages: Record<string, string> = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
      'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups.',
      'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.'
    };
    return errorMessages[code] || '';
  };

  // Handle local storage login
  const handleLocalLogin = () => {
    const sanitizedNickname = sanitizeInput(localNickname, 50).trim();
    
    if (!isValidNickname(sanitizedNickname)) {
      setError('Nickname must be 2-50 characters and contain only letters, numbers, spaces, hyphens, or underscores');
      return;
    }
    
    onSkip(sanitizedNickname);
  };

  // Choose screen - Local vs Cloud
  if (authType === 'choose') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 bg-white dark:bg-slate-800 shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <img src="/clearmindlogo.png" alt="ClearMind" className="w-20 h-20 object-contain" />
            </div>
            <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-3">
              Welcome to ClearMind
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Choose how you want to store your data
            </p>
          </div>

          {/* Storage Options */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Local Storage Option */}
            <button
              onClick={() => setAuthType('local')}
              className="group bg-white dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-8 text-left transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-emerald-500/10"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <HardDrive size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                Local Workspace
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                Data stays on this device only. Perfect for privacy-focused users.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Stored on your PC</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Works offline</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>No account needed</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-500">
                  <Monitor size={16} />
                  <span>Single device only</span>
                </li>
              </ul>
            </button>

            {/* Cloud Storage Option */}
            <button
              onClick={() => setAuthType('cloud')}
              disabled={!firebaseReady}
              className="group bg-white dark:bg-slate-800/90 backdrop-blur-sm border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 text-left transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Cloud size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                Cloud Sync
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                Sync across all devices. Access anywhere, anytime.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Stored in cloud</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Real-time sync</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 size={16} className="text-blue-500" />
                  <span>Automatic backup</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex -space-x-1">
                    <Monitor size={14} className="text-blue-500" />
                    <Smartphone size={14} className="text-blue-500" />
                  </div>
                  <span>All devices</span>
                </li>
              </ul>
              {!firebaseReady && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Cloud sync requires Firebase configuration
                  </p>
                </div>
              )}
            </button>
          </div>

          {/* Security Badge */}
          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-slate-800/50 rounded-full border border-slate-200 dark:border-slate-700">
              <Shield size={16} className="text-slate-500 dark:text-slate-400" />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Your data is always encrypted and secure
              </span>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-600">
            ClearMind v1.0 • Your productivity companion
          </p>
        </div>
      </div>
    );
  }

  // Local workspace setup
  if (authType === 'local') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Back Button */}
          <button
            onClick={() => { setAuthType('choose'); setError(''); }}
            className="mb-6 flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to options</span>
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <HardDrive size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
              Local Workspace
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Your data will be stored on this device
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-xl">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                What should we call you?
              </label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={localNickname}
                  onChange={(e) => setLocalNickname(e.target.value)}
                  placeholder="Enter your nickname"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleLocalLogin}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
            >
              <HardDrive size={20} />
              Start Local Workspace
            </button>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                About Local Storage
              </h4>
              <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>• Data is saved in your browser's IndexedDB</li>
                <li>• Clearing browser data will erase your data</li>
                <li>• You can switch to cloud sync anytime later</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cloud auth form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Back Button */}
        <button
          onClick={() => { setAuthType('choose'); setError(''); setMessage(''); setMode('login'); }}
          className="mb-6 flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span>Back to options</span>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/25">
            <Cloud size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {mode === 'login' ? 'Access your synced data' : 
             mode === 'signup' ? 'Start syncing across devices' : 
             'We\'ll send you a reset link'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-xl">
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm">
              {message}
            </div>
          )}

          {/* Social Login Buttons */}
          {mode !== 'reset' && (
            <>
              <div className="space-y-3 mb-6">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-600 shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <button
                  onClick={handleGithubSignIn}
                  disabled={isLoading}
                  className="w-full bg-slate-800 dark:bg-slate-900 hover:bg-slate-700 dark:hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Github size={20} />
                  Continue with GitHub
                </button>
              </div>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">or</span>
                </div>
              </div>
            </>
          )}

          {/* Email Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nickname</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Your display name"
                    required={mode === 'signup'}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl pl-10 pr-4 py-3 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl pl-10 pr-12 py-3 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? <LogIn size={18} /> : mode === 'signup' ? <UserPlus size={18} /> : <Mail size={18} />}
                  {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                </>
              )}
            </button>
          </form>

          {/* Mode Toggles */}
          <div className="mt-6 text-center space-y-3">
            {mode === 'login' && (
              <>
                <button 
                  onClick={() => { setMode('reset'); setError(''); setMessage(''); }} 
                  className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
                <p className="text-slate-500 dark:text-slate-400">
                  Don't have an account?{' '}
                  <button 
                    onClick={() => { setMode('signup'); setError(''); setMessage(''); }} 
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <button 
                  onClick={() => { setMode('login'); setError(''); setMessage(''); }} 
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <button 
                onClick={() => { setMode('login'); setError(''); setMessage(''); }} 
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 mx-auto font-medium"
              >
                <ArrowLeft size={16} /> Back to sign in
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-500">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default AuthView;
