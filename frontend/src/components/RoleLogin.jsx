import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wallet,
  Stethoscope,
  Building2,
  HeartHandshake,
  ShieldAlert,
  HardDrive,
  KeyRound,
  UserCheck
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export default function RoleLogin({
  role,
  onBackToRoles,
  onLoginSuccess,
  account,
  onConnectWallet,
  isConnectingWallet,
  onEnterDashboard
}) {
  const [authMethod, setAuthMethod] = useState('wallet'); // 'wallet' | 'email'
  const [emailMode, setEmailMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const roleMeta = {
    patient: {
      title: 'Patient Secure Gateway',
      badge: 'Patient Portal',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: HeartHandshake,
      iconColor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      description: 'Access and decrypt clinical records shared securely with your identity.'
    },
    doctor: {
      title: 'Doctor Clinical Portal',
      badge: 'Doctor Authority',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Stethoscope,
      iconColor: 'bg-blue-50 text-blue-600 border-blue-100',
      description: 'Encrypt patient diagnostics, manage access permissions, and issue certificates.'
    },
    medicalStaff: {
      title: 'Medical Staff Terminal',
      badge: 'Staff Archive Access',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      icon: Building2,
      iconColor: 'bg-teal-50 text-teal-600 border-teal-100',
      description: 'Hospital archives, record upload processing, and document ledger verification.'
    },
    admin: {
      title: 'System Administrator Gateway',
      badge: 'Administrator Control',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: ShieldAlert,
      iconColor: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      description: 'Manage smart contract roles, practitioner onboarding, and system security.'
    }
  }[role] || {
    title: 'BlockDrive Access Portal',
    badge: 'Standard Access',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: Lock,
    iconColor: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Decentralized access control and zero-knowledge encrypted storage.'
  };

  const Icon = roleMeta.icon;

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setMessage({ text: 'Please provide a valid email address.', type: 'error' });
      return;
    }
    if (!password) {
      setMessage({ text: 'Password is required.', type: 'error' });
      return;
    }

    setIsLoading(true);
    try {
      if (emailMode === 'signIn') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password
        });
        if (error) throw error;

        // Strict Role Verification for ALL roles (doctor, patient, medicalStaff, admin)
        let userRole = data.user?.user_metadata?.role;

        try {
          const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .maybeSingle();

          if (profile && profile.role) {
            userRole = profile.role;
          }
        } catch (profileLookupErr) {
          console.warn('Profile table check failed:', profileLookupErr);
        }

        if (!userRole) {
          userRole = 'patient';
        }

        if (userRole !== role) {
          await supabase.auth.signOut();
          const formatRole = (r) => {
            if (r === 'doctor') return 'Doctor';
            if (r === 'medicalStaff') return 'Medical Staff';
            if (r === 'patient') return 'Patient';
            if (r === 'admin') return 'Administrator';
            return r;
          };
          throw new Error(`Access Denied: This account (${trimmedEmail}) is registered as a ${formatRole(userRole)}. Please switch to the ${formatRole(userRole)} Login Portal.`);
        }

        const formatRole = (r) => {
          if (r === 'doctor') return 'Doctor';
          if (r === 'medicalStaff') return 'Medical Staff';
          if (r === 'patient') return 'Patient';
          if (r === 'admin') return 'Administrator';
          return r;
        };

        setMessage({ text: `✓ Authenticated successfully as ${formatRole(role)}.`, type: 'success' });
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(data.user);
          if (onEnterDashboard) onEnterDashboard(role);
        }, 500);
      } else {
        if (role !== 'patient') {
          throw new Error(`Self-registration is only permitted for Patients. ${role === 'doctor' ? 'Doctor' : role === 'medicalStaff' ? 'Medical Staff' : 'Admin'} accounts must be provisioned by the Administrator.`);
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              role: 'patient',
              full_name: trimmedEmail.split('@')[0]
            }
          }
        });
        if (error) throw error;
        setMessage({ text: '✓ Patient account registered! You may now sign in with your credentials.', type: 'success' });
        setEmailMode('signIn');
      }
    } catch (err) {
      setMessage({ text: err.message || 'Authentication error', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickEnter = () => {
    if (onEnterDashboard) {
      onEnterDashboard(role);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 py-3.5 px-6 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={onBackToRoles}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-md transition-all active:scale-[0.98] cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Switch Role</span>
          </button>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-md border ${roleMeta.badgeColor}`}>
              {roleMeta.badge}
            </span>
          </div>
        </div>
      </header>

      {/* Main Authentication Container */}
      <main className="max-w-md mx-auto px-4 py-8 sm:py-10 w-full flex-1 flex flex-col justify-center">
        <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs space-y-5">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <div className={`w-10 h-10 rounded-md border ${roleMeta.iconColor} flex items-center justify-center mx-auto shadow-2xs`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                {roleMeta.title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xs mx-auto font-normal">
                {roleMeta.description}
              </p>
            </div>
          </div>

          {/* Auth Method Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-md border border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setAuthMethod('wallet')}
              className={`py-1.5 px-3 rounded text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMethod === 'wallet'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Web3 Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('email')}
              className={`py-1.5 px-3 rounded text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMethod === 'email'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email Sign In</span>
            </button>
          </div>

          {/* Feedback Message */}
          {message.text && (
            <div
              className={`p-3 rounded-md text-xs flex items-start gap-2 ${
                message.type === 'error'
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <span className="font-normal">{message.text}</span>
            </div>
          )}

          {/* Tab 1: Web3 Wallet Connect */}
          {authMethod === 'wallet' && (
            <div className="space-y-3.5">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">Wallet Status</span>
                  <span className={`inline-flex items-center gap-1 font-normal ${account ? 'text-emerald-700' : 'text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${account ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {account ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                {account ? (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-medium text-slate-400">Connected Address</span>
                    <code className="block font-mono text-[11px] bg-white border border-slate-200 p-2 rounded text-slate-800 break-all select-all">
                      {account}
                    </code>
                  </div>
                ) : (
                  <p className="text-slate-600 font-normal leading-relaxed text-[11px]">
                    Connect MetaMask or your Web3 wallet to authorize cryptographic signatures and on-chain verification.
                  </p>
                )}
              </div>

              {account ? (
                <button
                  type="button"
                  onClick={handleQuickEnter}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-medium rounded-md text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer interactive-lift-subtle"
                >
                  <span>Launch {roleMeta.badge} Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  disabled={isConnectingWallet}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] disabled:bg-slate-300 text-white font-medium rounded-md text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer interactive-lift-subtle"
                >
                  {isConnectingWallet ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting Wallet...</span>
                    </>
                  ) : (
                    <>
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Connect Wallet as {role.charAt(0).toUpperCase() + role.slice(1)}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Tab 2: Healthcare Email / Password Form */}
          {authMethod === 'email' && (
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
                  Healthcare Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="practitioner@hospital.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md pl-8 pr-3 py-2 text-xs text-slate-900 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md pl-8 pr-8 py-2 text-xs text-slate-900 outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {emailMode === 'signUp' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md pl-8 pr-3 py-2 text-xs text-slate-900 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] disabled:bg-slate-300 text-white font-medium rounded-md text-xs transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer interactive-lift-subtle"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{emailMode === 'signIn' ? 'Sign In & Open Dashboard' : 'Create Account'}</span>
                )}
              </button>

              {role !== 'patient' ? (
                <div className="text-center pt-1.5">
                  <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-2 font-normal">
                    🔒 {role === 'doctor' ? 'Doctor' : role === 'medicalStaff' ? 'Medical Staff' : 'Administrator'} accounts are provisioned by the Hospital Admin.
                  </p>
                </div>
              ) : (
                <div className="text-center pt-1.5">
                  <button
                    type="button"
                    onClick={() => setEmailMode(emailMode === 'signIn' ? 'signUp' : 'signIn')}
                    className="text-xs text-slate-500 hover:text-slate-900 underline cursor-pointer font-normal"
                  >
                    {emailMode === 'signIn' ? "Don't have a patient account? Register" : "Already have an account? Sign In"}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Quick Direct Enter (Demo / Testing option) */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="font-normal">Direct testing mode:</span>
            <button
              type="button"
              onClick={handleQuickEnter}
              className="font-medium text-slate-800 hover:text-slate-900 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Continue as {roleMeta.badge.split(' ')[0]}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3.5 text-center text-xs text-slate-400">
        BlockDrive Decentralized Healthcare System • Cryptographic Privacy & Access Control
      </footer>
    </div>
  );
}
