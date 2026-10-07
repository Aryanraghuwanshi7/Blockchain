import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  ShieldCheck,
  UserPlus,
  Users,
  Stethoscope,
  Building2,
  HeartHandshake,
  Key,
  Copy,
  Check,
  RefreshCw,
  Search,
  Trash2,
  Lock,
  Mail,
  User,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Wallet
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../utils/supabaseClient';
import { useRole } from '../../context/RoleContext';
import {
  onboardDoctor,
  onboardMedicalStaff,
  onboardPatient,
  revokeHealthcareRole,
  isLocalNodeAlive
} from '../../utils/contracts';

// Isolated provisioning client that will NOT overwrite the logged-in admin session
const provisionerAuthClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

export default function RoleManagement({ signer, account }) {
  const { role: onChainRole, refreshRole } = useRole();

  // Active Admin Sub-tab: 'directory' | 'create' | 'blockchain'
  const [activeAdminView, setActiveAdminView] = useState('directory');

  // Supabase Users Directory State
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // New User Form State
  const [newUserRole, setNewUserRole] = useState('doctor');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserWallet, setNewUserWallet] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createMessage, setCreateMessage] = useState({ text: '', type: '' });
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState(null);

  // Blockchain Onboarding State
  const [targetAddress, setTargetAddress] = useState(account || '');
  const [blockchainRole, setBlockchainRole] = useState('doctor');
  const [isContractProcessing, setIsContractProcessing] = useState(false);
  const [contractStatus, setContractStatus] = useState('');
  const [contractError, setContractError] = useState('');

  // UI helpers
  const [copiedKey, setCopiedKey] = useState('');

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Generate a randomized, secure temporary password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let generated = '';
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewUserPassword(generated);
  };

  // Fetch all profiles from Supabase
  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Could not fetch profiles from Supabase:', error.message);
      } else if (data) {
        setProfiles(data);
      }
    } catch (err) {
      console.warn('Profiles load error:', err);
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Create User Handler (Email + Password)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateMessage({ text: '', type: '' });
    setLastCreatedCredentials(null);

    const emailClean = newUserEmail.trim().toLowerCase();
    const nameClean = newUserName.trim() || emailClean.split('@')[0];
    const passwordClean = newUserPassword.trim();
    const walletClean = newUserWallet.trim();

    if (!emailClean || !passwordClean) {
      setCreateMessage({ text: 'Please provide both Email and Password.', type: 'error' });
      return;
    }

    if (passwordClean.length < 6) {
      setCreateMessage({ text: 'Password must be at least 6 characters long.', type: 'error' });
      return;
    }

    setIsCreatingUser(true);
    try {
      // Get current admin user ID
      const { data: { user: currentAdmin } } = await supabase.auth.getUser();
      const adminId = currentAdmin?.id || null;

      // Register new user with isolated client so admin session remains intact
      const { data, error } = await provisionerAuthClient.auth.signUp({
        email: emailClean,
        password: passwordClean,
        options: {
          data: {
            role: newUserRole,
            full_name: nameClean,
            created_by: adminId,
            wallet_address: walletClean || null
          }
        }
      });

      if (error) throw error;

      // Also upsert directly into profiles in case trigger has delay
      if (data.user) {
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: emailClean,
            full_name: nameClean,
            role: newUserRole,
            wallet_address: walletClean || null,
            created_by: adminId,
            updated_at: new Date().toISOString()
          });
        } catch (upsertErr) {
          console.warn('Profile upsert notice:', upsertErr);
        }
      }

      setLastCreatedCredentials({
        role: newUserRole,
        name: nameClean,
        email: emailClean,
        password: passwordClean,
        wallet: walletClean
      });

      setCreateMessage({
        text: `✓ Successfully created account for ${nameClean} (${newUserRole.toUpperCase()})!`,
        type: 'success'
      });

      // Reset form
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserWallet('');

      // Refresh directory
      await loadProfiles();
    } catch (err) {
      setCreateMessage({ text: err.message || 'Failed to create account.', type: 'error' });
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Delete / Revoke User Profile
  const handleDeleteProfile = async (profileId, profileEmail) => {
    if (!window.confirm(`Are you sure you want to remove user ${profileEmail} from the directory?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', profileId);
      if (error) throw error;
      await loadProfiles();
    } catch (err) {
      alert(`Error deleting user: ${err.message}`);
    }
  };

  // Helper for admin contract signing
  const getAdminSigner = async () => {
    try {
      const alive = await isLocalNodeAlive();
      if (alive) {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        return new ethers.Wallet(
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          localProvider
        );
      }
      return signer;
    } catch {
      return signer;
    }
  };

  // Onboard on Blockchain
  const handleBlockchainOnboard = async (overrideRole, overrideAddress) => {
    const roleToAssign = overrideRole || blockchainRole;
    const addr = overrideAddress || targetAddress;

    if (!addr || !ethers.isAddress(addr)) {
      setContractError('Please provide a valid Ethereum wallet address.');
      return;
    }

    setIsContractProcessing(true);
    setContractError('');
    setContractStatus(`Submitting on-chain transaction to register ${roleToAssign.toUpperCase()}...`);

    try {
      const activeAdmin = await getAdminSigner();

      // Revoke any previous role to prevent overlaps
      try { await revokeHealthcareRole(activeAdmin, addr, 'patient'); } catch {}
      try { await revokeHealthcareRole(activeAdmin, addr, 'doctor'); } catch {}
      try { await revokeHealthcareRole(activeAdmin, addr, 'medicalStaff'); } catch {}

      if (roleToAssign === 'doctor') {
        await onboardDoctor(activeAdmin, addr);
      } else if (roleToAssign === 'medicalStaff') {
        await onboardMedicalStaff(activeAdmin, addr);
      } else if (roleToAssign === 'patient') {
        await onboardPatient(activeAdmin, addr);
      }

      setContractStatus(`✓ On-chain permission granted! ${addr.slice(0, 8)}... is now registered as ${roleToAssign.toUpperCase()}.`);
      if (refreshRole) await refreshRole();
    } catch (err) {
      setContractError(err?.reason || err?.message || 'On-chain transaction failed.');
    } finally {
      setIsContractProcessing(false);
    }
  };

  // Statistics calculation
  const totalUsers = profiles.length;
  const totalDoctors = profiles.filter(p => p.role === 'doctor').length;
  const totalStaff = profiles.filter(p => p.role === 'medicalStaff').length;
  const totalPatients = profiles.filter(p => p.role === 'patient').length;

  // Filtered profiles for table
  const filteredProfiles = profiles.filter(p => {
    const matchesRole = roleFilter === 'all' || p.role === roleFilter;
    const matchesSearch =
      (p.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.wallet_address || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Hospital Administration Dashboard</h2>
              <span className="text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                Admin Control
              </span>
            </div>
            <p className="text-xs font-normal text-slate-500 mt-0.5">
              Provision healthcare practitioner IDs, generate user credentials, and supervise smart contract access.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveAdminView('directory')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAdminView === 'directory'
                ? 'bg-white text-slate-900 shadow-2xs font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>User Directory ({totalUsers})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveAdminView('create')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAdminView === 'create'
                ? 'bg-white text-slate-900 shadow-2xs font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 text-slate-500" />
            <span>Create Account</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveAdminView('blockchain')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeAdminView === 'blockchain'
                ? 'bg-white text-slate-900 shadow-2xs font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>Blockchain RBAC</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs interactive-lift-subtle">
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal text-slate-500">Total System Users</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-semibold text-slate-900 mt-1.5">{totalUsers}</div>
          <span className="text-[11px] font-normal text-slate-400 mt-0.5 block">Active across all roles</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs interactive-lift-subtle">
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal text-slate-600">Doctors</span>
            <Stethoscope className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-semibold text-slate-900 mt-1.5">{totalDoctors}</div>
          <span className="text-[11px] font-normal text-slate-400 mt-0.5 block">Clinical practitioners</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs interactive-lift-subtle">
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal text-slate-600">Medical Staff</span>
            <Building2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-semibold text-slate-900 mt-1.5">{totalStaff}</div>
          <span className="text-[11px] font-normal text-slate-400 mt-0.5 block">Hospital archive staff</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs interactive-lift-subtle">
          <div className="flex items-center justify-between">
            <span className="text-xs font-normal text-slate-600">Patients</span>
            <HeartHandshake className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-semibold text-slate-900 mt-1.5">{totalPatients}</div>
          <span className="text-[11px] font-normal text-slate-400 mt-0.5 block">Secure record holders</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: USER DIRECTORY                                                    */}
      {/* ========================================================================= */}
      {activeAdminView === 'directory' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Provisioned Healthcare Directory</h3>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                All accounts created by the administrator. Doctors, staff, and patients use these credentials to log in.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadProfiles}
                disabled={loadingProfiles}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingProfiles ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminView('create')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs interactive-lift-subtle"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Strip */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name, email, or wallet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
              {['all', 'doctor', 'medicalStaff', 'patient', 'admin'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer capitalize ${
                    roleFilter === r
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r === 'medicalStaff' ? 'Staff' : r}
                </button>
              ))}
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3.5">Practitioner / User</th>
                  <th className="py-2.5 px-3.5">Email (Login ID)</th>
                  <th className="py-2.5 px-3.5">Assigned Role</th>
                  <th className="py-2.5 px-3.5">Linked Wallet</th>
                  <th className="py-2.5 px-3.5">Created At</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {loadingProfiles ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                          <span>Loading users...</span>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-slate-600">No users found.</p>
                          <p className="text-[11px] font-normal text-slate-400 mt-1">
                            Click "Add User" above to create credentials for a Doctor, Patient, or Staff member.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((p) => {
                    const roleBadge = {
                      doctor: { label: 'Doctor', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Stethoscope },
                      medicalStaff: { label: 'Medical Staff', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: Building2 },
                      patient: { label: 'Patient', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: HeartHandshake },
                      admin: { label: 'Administrator', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: ShieldAlert }
                    }[p.role] || { label: p.role, color: 'bg-slate-100 text-slate-700 border-slate-200', icon: User };

                    const RoleIcon = roleBadge.icon;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3.5 font-medium text-slate-900 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 font-medium uppercase text-[11px]">
                            {(p.full_name || p.email || 'U').charAt(0)}
                          </div>
                          <span>{p.full_name || 'Healthcare User'}</span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-800">{p.email}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(p.email, `email_${p.id}`)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                              title="Copy Email ID"
                            >
                              {copiedKey === `email_${p.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${roleBadge.color}`}>
                            <RoleIcon className="w-3 h-3" />
                            <span>{roleBadge.label}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          {p.wallet_address ? (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600">
                              <span>{p.wallet_address.slice(0, 6)}...{p.wallet_address.slice(-4)}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(p.wallet_address, `wallet_${p.id}`)}
                                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                              >
                                {copiedKey === `wallet_${p.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic font-normal">Not linked</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-500 text-[11px] font-normal">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            {p.wallet_address && (
                              <button
                                type="button"
                                onClick={() => handleBlockchainOnboard(p.role, p.wallet_address)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer transition-colors"
                                title="Sync On-Chain Role"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {p.role !== 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProfile(p.id, p.email)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                title="Remove User Profile"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: CREATE USER CREDENTIALS (ID + PASSWORD GENERATOR)                 */}
      {/* ========================================================================= */}
      {activeAdminView === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Form */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-slate-700" />
                <span>Create Healthcare Practitioner Account</span>
              </h3>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                Generate login credentials for Doctors, Patients, or Medical Staff. The user will use this Email ID and Password to sign in.
              </p>
            </div>

            {createMessage.text && (
              <div
                className={`p-3 rounded-lg text-xs flex items-start gap-2.5 ${
                  createMessage.type === 'error'
                    ? 'bg-rose-50 border border-rose-200 text-rose-800'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                }`}
              >
                {createMessage.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <span>{createMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Select User Role
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'doctor', title: 'Doctor', icon: Stethoscope },
                    { id: 'medicalStaff', title: 'Medical Staff', icon: Building2 },
                    { id: 'patient', title: 'Patient', icon: HeartHandshake }
                  ].map((r) => {
                    const RIcon = r.icon;
                    const isSelected = newUserRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setNewUserRole(r.id)}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white shadow-2xs font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <RIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                        <div>
                          <div className="text-xs font-medium">{r.title}</div>
                          <span className={`text-[10px] font-normal ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {r.id === 'doctor' ? 'Clinical & Certificates' : r.id === 'medicalStaff' ? 'Hospital Archives' : 'Health Records'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name / Practitioner Title
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Jane Smith / John Doe"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Email (Login ID) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Healthcare Email (Login ID)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. doctor.smith@hospital.org"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Password & Generator */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Account Password
                  </label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-slate-400" />
                    <span>Generate Secure Password</span>
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter or generate temporary password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg pl-9 pr-9 py-2 text-xs text-slate-900 outline-none transition-all font-mono placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Optional Wallet Address */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Ethereum Wallet Address (0x...)
                </label>
                <div className="relative">
                  <Wallet className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="0x... (Optional, for blockchain verification)"
                    value={newUserWallet}
                    onChange={(e) => setNewUserWallet(e.target.value)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 outline-none transition-all font-mono placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:bg-slate-300 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer interactive-lift-subtle"
              >
                {isCreatingUser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Provisioning Account in Database...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create & Authorize {newUserRole.charAt(0).toUpperCase() + newUserRole.slice(1)} Account</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Generated Credentials Card */}
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 sm:p-5 space-y-4">
              <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-600" />
                <span>Credentials Handout Slip</span>
              </h4>
              <p className="text-xs font-normal text-slate-500 leading-relaxed">
                When you create an account, copy the credentials below to provide to the doctor, patient, or staff member.
              </p>

              {lastCreatedCredentials ? (
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-[11px] font-medium text-emerald-700">Ready for Use</span>
                    <span className="text-[10px] bg-slate-100 font-mono px-2 py-0.5 rounded text-slate-700 capitalize">
                      {lastCreatedCredentials.role}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] font-medium text-slate-400 block">Name</span>
                      <span className="font-medium text-slate-900">{lastCreatedCredentials.name}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-slate-400 block">Login Email ID</span>
                      <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded border border-slate-100 font-mono text-[11px] mt-0.5">
                        <span>{lastCreatedCredentials.email}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lastCreatedCredentials.email, 'last_email')}
                          className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                        >
                          {copiedKey === 'last_email' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-slate-400 block">Password</span>
                      <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded border border-slate-100 font-mono text-[11px] mt-0.5">
                        <span>{lastCreatedCredentials.password}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lastCreatedCredentials.password, 'last_pwd')}
                          className="text-slate-500 hover:text-slate-900 p-0.5 cursor-pointer"
                        >
                          {copiedKey === 'last_pwd' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const text = `Healthcare Account Credentials\nName: ${lastCreatedCredentials.name}\nRole: ${lastCreatedCredentials.role}\nEmail: ${lastCreatedCredentials.email}\nPassword: ${lastCreatedCredentials.password}`;
                      copyToClipboard(text, 'copy_all');
                    }}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
                  >
                    {copiedKey === 'copy_all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'copy_all' ? 'Copied Slip' : 'Copy Credentials Slip'}</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400 text-xs font-normal">
                  Fill out the form on the left to generate active login credentials.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: BLOCKCHAIN RBAC ON-CHAIN PERMISSIONS                              */}
      {/* ========================================================================= */}
      {activeAdminView === 'blockchain' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-2xs space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Smart Contract Role-Based Access Control (RBAC)</span>
            </h3>
            <p className="text-xs font-normal text-slate-500 mt-0.5">
              Directly grant cryptographic roles on the <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">BlockDriveAccessControl.sol</code> Ethereum contract.
            </p>
          </div>

          {contractStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{contractStatus}</span>
            </div>
          )}

          {contractError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{contractError}</span>
            </div>
          )}

          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Ethereum Wallet Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Select On-Chain Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['doctor', 'medicalStaff', 'patient'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setBlockchainRole(r)}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all cursor-pointer ${
                      blockchainRole === r
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {r === 'medicalStaff' ? 'Staff' : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleBlockchainOnboard()}
                disabled={isContractProcessing}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:bg-slate-300 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer interactive-lift-subtle"
              >
                {isContractProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing On-Chain RBAC Transaction...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Assign On-Chain {blockchainRole.toUpperCase()} Role</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
