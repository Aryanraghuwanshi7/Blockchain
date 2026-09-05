import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  RefreshCw, 
  X, 
  ShieldCheck, 
  UserPlus, 
  LogIn, 
  KeyRound 
} from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, initialView = 'signIn' }) {
  const [view, setView] = useState(initialView); // 'signIn' | 'signUp' | 'forgotPassword'
  const [signUpStep, setSignUpStep] = useState(1); // 1: email, 2: otp, 3: password
  const [forgotStep, setForgotStep] = useState(1); // 1: email, 2: otp, 3: new password

  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'error' | 'success' | 'info'
  const [resendCooldown, setResendCooldown] = useState(0);

  // Sync initial view when modal opens
  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      resetFlows();
    }
  }, [isOpen, initialView]);

  // Resend OTP countdown timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const resetFlows = () => {
    setSignUpStep(1);
    setForgotStep(1);
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setMessage({ text: '', type: '' });
  };

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  // ----------------------------------------------------
  // 1. SIGN IN
  // ----------------------------------------------------
  const handleSignIn = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!isValidEmail(email)) {
      setMessage({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }
    if (!password) {
      setMessage({ text: 'Password is required.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) throw error;

      setMessage({ text: '✓ Signed in successfully!', type: 'success' });
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(data.user);
        onClose();
      }, 700);
    } catch (err) {
      setMessage({ text: err.message || 'Invalid email or password.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // 2. SIGN UP (3 Steps)
  // ----------------------------------------------------
  // Step 1: Send OTP
  const handleSignUpEmail = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!isValidEmail(email)) {
      setMessage({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      // Check if user already exists
      const probe = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      const isNewUser = probe.error && (
        probe.error.status === 422 ||
        (probe.error.message && probe.error.message.toLowerCase().includes('signups not allowed')) ||
        (probe.error.code && probe.error.code === 'otp_disabled')
      );

      if (!isNewUser && !probe.error) {
        setMessage({ text: 'This email is already registered. Please sign in instead.', type: 'error' });
        setIsLoading(false);
        return;
      }

      // Send signup OTP
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });

      if (error) {
        if (error.message && error.message.toLowerCase().includes('already')) {
          setMessage({ text: 'This email is already registered. Please sign in instead.', type: 'error' });
        } else {
          throw error;
        }
        return;
      }

      setSignUpStep(2);
      setResendCooldown(60);
      setMessage({ text: `Verification code sent to ${email}`, type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to send verification code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifySignUpOtp = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!otp || otp.trim().length !== 6) {
      setMessage({ text: 'Please enter the 6-digit verification code.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });

      if (error) throw error;

      setSignUpStep(3);
      setMessage({ text: 'Email verified! Create a password to finish.', type: 'info' });
    } catch (err) {
      setMessage({ text: err.message || 'Invalid or expired code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Set Password
  const handleCreatePassword = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (password.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;

      setMessage({ text: '✓ Account created successfully! Redirecting...', type: 'success' });
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(data.user);
        onClose();
      }, 900);
    } catch (err) {
      setMessage({ text: err.message || 'Failed to set password.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Signup OTP
  const handleResendSignUpOtp = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setResendCooldown(60);
      setMessage({ text: 'New verification code sent!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to resend code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // 3. FORGOT PASSWORD (3 Steps)
  // ----------------------------------------------------
  // Step 1: Send Reset OTP
  const handleForgotEmail = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!isValidEmail(email)) {
      setMessage({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      if (error) {
        const msg = error.message || '';
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no user') || msg.toLowerCase().includes('signups not allowed')) {
          setMessage({ text: 'No account found with that email. Please sign up first.', type: 'error' });
        } else {
          throw error;
        }
        return;
      }

      setForgotStep(2);
      setResendCooldown(60);
      setMessage({ text: `Reset code sent to ${email}`, type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to send reset code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify Reset OTP
  const handleVerifyForgotOtp = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!otp || otp.trim().length !== 6) {
      setMessage({ text: 'Please enter the 6-digit reset code.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;

      setForgotStep(3);
      setMessage({ text: 'Code verified! Enter your new password.', type: 'info' });
    } catch (err) {
      setMessage({ text: err.message || 'Invalid or expired code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Save New Password
  const handleSaveNewPassword = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (password.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;

      setMessage({ text: '✓ Password reset successful! Switching to sign in...', type: 'success' });
      await supabase.auth.signOut();
      setTimeout(() => {
        setView('signIn');
        resetFlows();
      }, 1200);
    } catch (err) {
      setMessage({ text: err.message || 'Failed to update password.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend Forgot OTP
  const handleResendForgotOtp = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setResendCooldown(60);
      setMessage({ text: 'New reset code sent!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to resend reset code.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-2xl shadow-indigo-950/50 p-6 md:p-8 backdrop-blur-2xl overflow-hidden">
        
        {/* Cybersecurity Background Image Accent with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-25 pointer-events-none mix-blend-screen"
          style={{ backgroundImage: "url('/bg.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/80 to-slate-900/95 pointer-events-none" />
        
        {/* Top Gradient Border Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-400 to-violet-400 rounded-t-2xl z-10" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors z-20"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content Container with relative z-index */}
        <div className="relative z-10">

        {/* Header Titles */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 mb-3 shadow-inner">
            {view === 'signIn' && <LogIn className="w-6 h-6" />}
            {view === 'signUp' && <UserPlus className="w-6 h-6" />}
            {view === 'forgotPassword' && <KeyRound className="w-6 h-6" />}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {view === 'signIn' && 'Welcome Back'}
            {view === 'signUp' && 'Create BlockDrive Account'}
            {view === 'forgotPassword' && 'Reset Password'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {view === 'signIn' && 'Enter your credentials to access secure cloud storage'}
            {view === 'signUp' && (
              signUpStep === 1 ? 'Step 1: Enter your email address' :
              signUpStep === 2 ? 'Step 2: Enter 6-digit verification code' :
              'Step 3: Choose a secure password'
            )}
            {view === 'forgotPassword' && (
              forgotStep === 1 ? 'Step 1: Enter your registered email' :
              forgotStep === 2 ? 'Step 2: Enter 6-digit reset code' :
              'Step 3: Enter your new password'
            )}
          </p>
        </div>

        {/* Message Banner */}
        {message.text && (
          <div className={`mb-5 p-3.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
            message.type === 'error'
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
              : message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300'
          }`}>
            {message.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {message.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {message.type === 'info' && <ShieldCheck className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* =========================================================
            VIEW 1: SIGN IN
            ========================================================= */}
        {view === 'signIn' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                />
                Remember Me
              </label>
              <button
                type="button"
                onClick={() => {
                  setView('forgotPassword');
                  resetFlows();
                }}
                className="text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="text-center text-xs text-slate-400 pt-3 border-t border-slate-800/80">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setView('signUp');
                  resetFlows();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
              >
                Sign Up
              </button>
            </div>
          </form>
        )}

        {/* =========================================================
            VIEW 2: SIGN UP (3 Steps)
            ========================================================= */}
        {view === 'signUp' && (
          <div className="space-y-4">
            {/* Step 1: Email */}
            {signUpStep === 1 && (
              <form onSubmit={handleSignUpEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {isLoading ? 'Checking...' : 'Send Verification Code'}
                </button>
              </form>
            )}

            {/* Step 2: Verify OTP */}
            {signUpStep === 2 && (
              <form onSubmit={handleVerifySignUpOtp} className="space-y-4">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                  <span>Code sent to <strong className="text-indigo-300">{email}</strong></span>
                  <button
                    type="button"
                    onClick={() => setSignUpStep(1)}
                    className="text-indigo-400 hover:underline text-xs"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-center tracking-widest font-mono text-lg text-white placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>

                <div className="text-center text-xs text-slate-400 pt-1">
                  <button
                    type="button"
                    onClick={handleResendSignUpOtp}
                    disabled={resendCooldown > 0 || isLoading}
                    className="text-indigo-400 hover:underline disabled:text-slate-600"
                  >
                    {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Create Password */}
            {signUpStep === 3 && (
              <form onSubmit={handleCreatePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Create Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {isLoading ? 'Creating Account...' : 'Complete Account Registration'}
                </button>
              </form>
            )}

            <div className="text-center text-xs text-slate-400 pt-3 border-t border-slate-800/80">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setView('signIn');
                  resetFlows();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* =========================================================
            VIEW 3: FORGOT PASSWORD (3 Steps)
            ========================================================= */}
        {view === 'forgotPassword' && (
          <div className="space-y-4">
            {/* Step 1: Email */}
            {forgotStep === 1 && (
              <form onSubmit={handleForgotEmail} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {isLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            )}

            {/* Step 2: OTP */}
            {forgotStep === 2 && (
              <form onSubmit={handleVerifyForgotOtp} className="space-y-4">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                  <span>Reset code sent to <strong className="text-indigo-300">{email}</strong></span>
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-indigo-400 hover:underline text-xs"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    6-Digit Reset Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-center tracking-widest font-mono text-lg text-white placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isLoading ? 'Verifying...' : 'Verify Code'}
                </button>

                <div className="text-center text-xs text-slate-400 pt-1">
                  <button
                    type="button"
                    onClick={handleResendForgotOtp}
                    disabled={resendCooldown > 0 || isLoading}
                    className="text-indigo-400 hover:underline disabled:text-slate-600"
                  >
                    {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: New Password */}
            {forgotStep === 3 && (
              <form onSubmit={handleSaveNewPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {isLoading ? 'Saving...' : 'Save New Password'}
                </button>
              </form>
            )}

            <div className="text-center text-xs text-slate-400 pt-3 border-t border-slate-800/80">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setView('signIn');
                  resetFlows();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
