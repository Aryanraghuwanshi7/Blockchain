import React, { useState } from 'react';
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
      title: 'Patient Login',
      description: 'Access and decrypt medical records shared with you.'
    },
    doctor: {
      title: 'Doctor Login',
      description: 'Encrypt patient diagnostics, manage access, and issue certificates.'
    },
    medicalStaff: {
      title: 'Medical Staff Login',
      description: 'Upload documents and maintain hospital records.'
    },
    admin: {
      title: 'Administrator Login',
      description: 'Manage users, roles, and smart contract permissions.'
    }
  }[role] || {
    title: 'BlockDrive Login',
    description: 'Sign in to access your dashboard.'
  };


  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setMessage({ text: 'Please enter your email address.', type: 'error' });
      return;
    }
    if (!password) {
      setMessage({ text: 'Please enter your password.', type: 'error' });
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

        // Strict Role Verification
        let userRole = data.user?.user_metadata?.role;

        try {
          const { data: profile } = await supabase
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
          throw new Error(`Access Denied: This account is registered as ${formatRole(userRole)}. Please use the ${formatRole(userRole)} login.`);
        }

        setMessage({ text: 'Signed in successfully.', type: 'success' });
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(data.user);
          if (onEnterDashboard) onEnterDashboard(role);
        }, 400);
      } else {
        if (role !== 'patient') {
          throw new Error(`Registration is only available for Patients. ${role === 'doctor' ? 'Doctor' : role === 'medicalStaff' ? 'Staff' : 'Admin'} accounts must be created by the Administrator.`);
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        const { error } = await supabase.auth.signUp({
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
        setMessage({ text: 'Account registered. You can now sign in.', type: 'success' });
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between text-black font-sans">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 py-3 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={onBackToRoles}
            className="inline-flex items-center text-xs font-medium text-black hover:underline px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
          >
            <span>&larr; Back to roles</span>
          </button>
          <span className="text-xs font-medium text-black uppercase">{role}</span>
        </div>
      </header>

      {/* Main Authentication Box */}
      <main className="max-w-md mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-5">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold text-black">{roleMeta.title}</h1>
            <p className="text-xs text-black">{roleMeta.description}</p>
          </div>

          {/* Auth Method Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded text-xs font-medium">
            <button
              type="button"
              onClick={() => setAuthMethod('wallet')}
              className={`py-1.5 px-3 rounded transition-colors cursor-pointer flex items-center justify-center ${
                authMethod === 'wallet'
                  ? 'bg-white text-black shadow-sm font-medium'
                  : 'text-black hover:bg-gray-200/60'
              }`}
            >
              <span>Connect Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('email')}
              className={`py-1.5 px-3 rounded transition-colors cursor-pointer flex items-center justify-center ${
                authMethod === 'email'
                  ? 'bg-white text-black shadow-sm font-medium'
                  : 'text-black hover:bg-gray-200/60'
              }`}
            >
              <span>Email Sign In</span>
            </button>
          </div>

          {/* Feedback Message */}
          {message.text && (
            <div
              className={`p-3 rounded text-xs ${
                message.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-black'
                  : 'bg-emerald-50 border border-emerald-200 text-black'
              }`}
            >
              <span>{message.text}</span>
            </div>
          )}

          {/* Tab 1: Web3 Wallet Connect */}
          {authMethod === 'wallet' && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-black">Wallet</span>
                  <span className="text-black font-medium">
                    {account ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                {account ? (
                  <div className="font-mono text-[11px] text-black bg-white border border-gray-200 p-2 rounded break-all select-all">
                    {account}
                  </div>
                ) : (
                  <p className="text-black text-xs">
                    Connect your MetaMask wallet to access the decentralized network.
                  </p>
                )}
              </div>

              {account ? (
                <button
                  type="button"
                  onClick={handleQuickEnter}
                  className="w-full py-2 px-4 bg-black hover:bg-gray-900 text-white font-medium rounded text-xs transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span>Open Dashboard</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  disabled={isConnectingWallet}
                  className="w-full py-2 px-4 bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-medium rounded text-xs transition-colors flex items-center justify-center cursor-pointer"
                >
                  <span>{isConnectingWallet ? 'Connecting...' : 'Connect MetaMask Wallet'}</span>
                </button>
              )}
            </div>
          )}

          {/* Tab 2: Healthcare Email / Password Form */}
          {authMethod === 'email' && (
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@hospital.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-1.5 text-xs text-black outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-1.5 text-xs text-black outline-none pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black text-xs px-1 hover:underline cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {emailMode === 'signUp' && (
                <div>
                  <label className="block text-xs font-medium text-black mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-1.5 text-xs text-black outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-black hover:bg-gray-900 disabled:bg-gray-400 text-white font-medium rounded text-xs transition-colors flex items-center justify-center cursor-pointer"
              >
                <span>{isLoading ? 'Signing in...' : emailMode === 'signIn' ? 'Sign In' : 'Create Account'}</span>
              </button>

              {role !== 'patient' ? (
                <div className="text-center pt-1">
                  <p className="text-[11px] text-black">
                    {role === 'doctor' ? 'Doctor' : role === 'medicalStaff' ? 'Staff' : 'Administrator'} accounts are created by the Hospital Admin.
                  </p>
                </div>
              ) : (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setEmailMode(emailMode === 'signIn' ? 'signUp' : 'signIn')}
                    className="text-xs text-black hover:underline cursor-pointer"
                  >
                    {emailMode === 'signIn' ? "New patient? Register here" : "Already have an account? Sign In"}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Quick Direct Enter (Demo / Testing option) */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-black">
            <span>Direct demo mode:</span>
            <button
              type="button"
              onClick={handleQuickEnter}
              className="text-black font-medium hover:underline cursor-pointer"
            >
              <span>Continue as {role} &rarr;</span>
            </button>
          </div>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-black">
        BlockDrive • Decentralized Storage
      </footer>
    </div>
  );
}

