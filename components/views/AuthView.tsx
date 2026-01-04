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
  UserX,
  Wifi
} from 'lucide-react';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';

interface AuthViewProps {
  onAuthSuccess: (user: any) => void;
  onSkip: () => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, onSkip }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
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
      if (mode === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        if (!nickname.trim()) {
          throw new Error('Please enter a nickname');
        }
        const user = await firebaseService.signUpWithEmail(email, password, nickname);
        setMessage('Account created! Please check your email to verify.');
        setTimeout(() => onAuthSuccess({
          id: user.uid,
          nickname: user.displayName || nickname,
          email: user.email,
          photoURL: user.photoURL,
          provider: 'email',
          joinedAt: new Date().toISOString()
        }), 1500);
      } else if (mode === 'login') {
        const user = await firebaseService.signInWithEmail(email, password);
        onAuthSuccess({
          id: user.uid,
          nickname: user.displayName || 'User',
          email: user.email,
          photoURL: user.photoURL,
          provider: 'email',
          joinedAt: new Date().toISOString()
        });
      } else if (mode === 'reset') {
        await firebaseService.resetPassword(email);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-midnight to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/20 overflow-hidden">
            <img src="/clearmindlogo.png" alt="ClearMind" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Join ClearMind' : 'Reset Password'}
          </h1>
          <p className="text-gray-400">
            {mode === 'login' ? 'Sign in to sync your productivity data' : 
             mode === 'signup' ? 'Create a free account with cloud sync' : 
             'We\'ll send you a reset link'}
          </p>
        </div>

        <div className="bg-midnight-light/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {/* Firebase Not Configured Warning */}
          {!firebaseReady && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-medium text-sm">Firebase not configured</p>
                <p className="text-yellow-400/70 text-xs mt-1">
                  Add your Firebase credentials to .env file to enable cloud sync.
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
              {message}
            </div>
          )}

          {/* Social Login Buttons */}
          {mode !== 'reset' && (
            <>
              <div className="space-y-3 mb-6">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || !firebaseReady}
                  className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isLoading || !firebaseReady}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700"
                >
                  <Github size={20} />
                  Continue with GitHub
                </button>

                <button
                  onClick={handleAnonymousSignIn}
                  disabled={isLoading || !firebaseReady}
                  className="w-full bg-gray-700/50 hover:bg-gray-700 text-gray-300 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-600"
                >
                  <UserX size={20} />
                  Continue as Guest
                </button>
              </div>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-midnight-light text-gray-500">or continue with email</span>
                </div>
              </div>
            </>
          )}

          {/* Email Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Nickname</label>
                <div className="relative mt-1.5">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Your display name"
                    required={mode === 'signup'}
                    className="w-full bg-midnight border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Email</label>
              <div className="relative mt-1.5">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full bg-midnight border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Password</label>
                <div className="relative mt-1.5">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-midnight border border-gray-700 rounded-lg pl-10 pr-12 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !firebaseReady}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
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
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Forgot password?
                </button>
                <p className="text-gray-500">
                  Don't have an account?{' '}
                  <button 
                    onClick={() => { setMode('signup'); setError(''); setMessage(''); }} 
                    className="text-blue-500 hover:text-blue-400 font-medium"
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-gray-500">
                Already have an account?{' '}
                <button 
                  onClick={() => { setMode('login'); setError(''); setMessage(''); }} 
                  className="text-blue-500 hover:text-blue-400 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <button 
                onClick={() => { setMode('login'); setError(''); setMessage(''); }} 
                className="text-blue-500 hover:text-blue-400 flex items-center gap-1 mx-auto font-medium"
              >
                <ArrowLeft size={16} /> Back to login
              </button>
            )}
          </div>
        </div>

        {/* Skip Option */}
        <div className="mt-6 text-center">
          <button
            onClick={onSkip}
            className="text-gray-500 hover:text-gray-300 text-sm flex items-center justify-center gap-2 mx-auto transition-colors"
          >
            <Shield size={16} />
            Continue offline (local storage only)
          </button>
        </div>

        {/* Security Note */}
        <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
          <p className="text-xs text-blue-400/80 flex items-start gap-2 text-center justify-center">
            <Shield size={14} className="shrink-0 mt-0.5" />
            Your data is encrypted and securely stored. We never share your information.
          </p>
        </div>

        {/* Sync Features */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Wifi size={12} />
            Real-time sync
          </span>
          <span>•</span>
          <span>Cross-device access</span>
          <span>•</span>
          <span>Secure backup</span>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-600">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default AuthView;
