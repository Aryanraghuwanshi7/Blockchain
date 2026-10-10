import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
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
    <div className="space-y-6 text-black">
      {/* Top Banner & Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-black">Hospital Administration Dashboard</h2>
            <span className="text-[11px] font-medium bg-gray-100 text-black border border-gray-200 px-2 py-0.5 rounded-full">
              Admin Control
            </span>
          </div>
          <p className="text-xs font-normal text-black mt-0.5 opacity-75">
            Provision healthcare practitioner IDs, generate user credentials, and supervise smart contract access.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-medium self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveAdminView('directory')}
            className={`px-3 py-1.5 rounded-md cursor-pointer flex items-center ${
              activeAdminView === 'directory'
                ? 'bg-white text-black font-semibold shadow-xs'
                : 'text-black hover:bg-gray-200/50'
            }`}
          >
            <span>User Directory ({totalUsers})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveAdminView('create')}
            className={`px-3 py-1.5 rounded-md cursor-pointer flex items-center ${
              activeAdminView === 'create'
                ? 'bg-white text-black font-semibold shadow-xs'
                : 'text-black hover:bg-gray-200/50'
            }`}
          >
            <span>Create Account</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveAdminView('blockchain')}
            className={`px-3 py-1.5 rounded-md cursor-pointer flex items-center ${
              activeAdminView === 'blockchain'
                ? 'bg-white text-black font-semibold shadow-xs'
                : 'text-black hover:bg-gray-200/50'
            }`}
          >
            <span>Blockchain RBAC</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3.5 text-black">
          <span className="text-xs font-normal text-black">Total System Users</span>
          <div className="text-xl font-semibold text-black mt-1.5">{totalUsers}</div>
          <span className="text-[11px] font-normal text-black mt-0.5 block opacity-60">Active across all roles</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3.5 text-black">
          <span className="text-xs font-normal text-black">Doctors</span>
          <div className="text-xl font-semibold text-black mt-1.5">{totalDoctors}</div>
          <span className="text-[11px] font-normal text-black mt-0.5 block opacity-60">Clinical practitioners</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3.5 text-black">
          <span className="text-xs font-normal text-black">Medical Staff</span>
          <div className="text-xl font-semibold text-black mt-1.5">{totalStaff}</div>
          <span className="text-[11px] font-normal text-black mt-0.5 block opacity-60">Hospital archive staff</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3.5 text-black">
          <span className="text-xs font-normal text-black">Patients</span>
          <div className="text-xl font-semibold text-black mt-1.5">{totalPatients}</div>
          <span className="text-[11px] font-normal text-black mt-0.5 block opacity-60">Secure record holders</span>
        </div>
      </div>

      {/* VIEW 1: USER DIRECTORY */}
      {activeAdminView === 'directory' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4 text-black">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-black">Provisioned Healthcare Directory</h3>
              <p className="text-xs font-normal text-black mt-0.5 opacity-75">
                All accounts created by the administrator. Doctors, staff, and patients use these credentials to log in.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadProfiles}
                disabled={loadingProfiles}
                className="text-xs font-medium text-black bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer"
              >
                <span>{loadingProfiles ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminView('create')}
                className="text-xs font-medium text-white bg-black hover:bg-gray-900 px-3 py-1.5 rounded-lg cursor-pointer"
              >
                <span>Add User</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Strip */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search by name, email, or wallet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-1.5 text-xs text-black outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
              {['all', 'doctor', 'medicalStaff', 'patient', 'admin'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer capitalize ${
                    roleFilter === r
                      ? 'bg-white text-black font-semibold border border-gray-300 shadow-xs'
                      : 'bg-gray-100 text-black hover:bg-gray-200'
                  }`}
                >
                  {r === 'medicalStaff' ? 'Staff' : r}
                </button>
              ))}
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-black font-medium border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3.5">Practitioner / User</th>
                  <th className="py-2.5 px-3.5">Email (Login ID)</th>
                  <th className="py-2.5 px-3.5">Assigned Role</th>
                  <th className="py-2.5 px-3.5">Linked Wallet</th>
                  <th className="py-2.5 px-3.5">Created At</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-black">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-black">
                      {loadingProfiles ? (
                        <span>Loading users...</span>
                      ) : (
                        <div>
                          <p className="font-medium text-black">No users found.</p>
                          <p className="text-[11px] font-normal text-black mt-1 opacity-60">
                            Click "Add User" above to create credentials for a Doctor, Patient, or Staff member.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((p) => {
                    const roleLabel = {
                      doctor: 'Doctor',
                      medicalStaff: 'Medical Staff',
                      patient: 'Patient',
                      admin: 'Administrator'
                    }[p.role] || p.role;

                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70">
                        <td className="py-2.5 px-3.5 font-medium text-black">
                          <span>{p.full_name || 'Healthcare User'}</span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-black">{p.email}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(p.email, `email_${p.id}`)}
                              className="text-black hover:underline text-[11px] px-1 cursor-pointer"
                              title="Copy Email ID"
                            >
                              {copiedKey === `email_${p.id}` ? '[Copied]' : '[Copy]'}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border border-gray-200 bg-gray-50 text-black">
                            <span>{roleLabel}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5">
                          {p.wallet_address ? (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-black">
                              <span>{p.wallet_address.slice(0, 6)}...{p.wallet_address.slice(-4)}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(p.wallet_address, `wallet_${p.id}`)}
                                className="text-black hover:underline text-[11px] px-1 cursor-pointer"
                              >
                                {copiedKey === `wallet_${p.id}` ? '[Copied]' : '[Copy]'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-black opacity-50 italic font-normal">Not linked</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-black text-[11px] font-normal">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            {p.wallet_address && (
                              <button
                                type="button"
                                onClick={() => handleBlockchainOnboard(p.role, p.wallet_address)}
                                className="text-black hover:underline text-xs cursor-pointer"
                                title="Sync On-Chain Role"
                              >
                                [Sync]
                              </button>
                            )}
                            {p.role !== 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProfile(p.id, p.email)}
                                className="text-black hover:underline text-xs cursor-pointer"
                                title="Remove User Profile"
                              >
                                [Delete]
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

      {/* VIEW 2: CREATE USER CREDENTIALS (ID + PASSWORD GENERATOR) */}
      {activeAdminView === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-black">
          {/* Create Form */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-5 text-black">
            <div>
              <h3 className="text-sm font-semibold text-black">Create Healthcare Practitioner Account</h3>
              <p className="text-xs font-normal text-black mt-0.5 opacity-75">
                Generate login credentials for Doctors, Patients, or Medical Staff. The user will use this Email ID and Password to sign in.
              </p>
            </div>

            {createMessage.text && (
              <div className="p-3 rounded-lg text-xs bg-gray-50 border border-gray-300 text-black">
                <span>{createMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-medium text-black mb-1.5">
                  Select User Role
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'doctor', title: 'Doctor' },
                    { id: 'medicalStaff', title: 'Medical Staff' },
                    { id: 'patient', title: 'Patient' }
                  ].map((r) => {
                    const isSelected = newUserRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setNewUserRole(r.id)}
                        className={`p-3 rounded-lg border text-left cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'border-black bg-gray-50 text-black font-semibold'
                            : 'bg-white border-gray-200 text-black hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-xs font-medium">{r.title}</div>
                        <span className="text-[10px] font-normal text-black opacity-60">
                          {r.id === 'doctor' ? 'Clinical & Certificates' : r.id === 'medicalStaff' ? 'Hospital Archives' : 'Health Records'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Full Name / Practitioner Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Jane Smith / John Doe"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-2 text-xs text-black outline-none"
                />
              </div>

              {/* Email (Login ID) */}
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Healthcare Email (Login ID)
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. doctor.smith@hospital.org"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-2 text-xs text-black outline-none"
                />
              </div>

              {/* Password & Generator */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-black">
                    Account Password
                  </label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="text-[11px] font-medium text-black underline cursor-pointer"
                  >
                    Generate Secure Password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter or generate temporary password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-2 text-xs text-black outline-none pr-14 font-mono"
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

              {/* Optional Wallet Address */}
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Optional Ethereum Wallet Address (0x...)
                </label>
                <input
                  type="text"
                  placeholder="0x... (Optional, for blockchain verification)"
                  value={newUserWallet}
                  onChange={(e) => setNewUserWallet(e.target.value)}
                  className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-2 text-xs text-black outline-none font-mono"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full py-2 px-4 bg-black hover:bg-gray-900 disabled:bg-gray-300 text-white font-medium rounded-lg text-xs flex items-center justify-center cursor-pointer"
              >
                <span>{isCreatingUser ? 'Provisioning Account...' : `Create & Authorize ${newUserRole.charAt(0).toUpperCase() + newUserRole.slice(1)} Account`}</span>
              </button>
            </form>
          </div>

          {/* Right Column: Generated Credentials Card */}
          <div className="space-y-4 text-black">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4 text-black">
              <h4 className="text-xs font-semibold text-black">
                Credentials Handout Slip
              </h4>
              <p className="text-xs font-normal text-black opacity-75">
                When you create an account, copy the credentials below to provide to the doctor, patient, or staff member.
              </p>

              {lastCreatedCredentials ? (
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-[11px] font-medium text-black">Ready for Use</span>
                    <span className="text-[10px] bg-gray-100 font-mono px-2 py-0.5 rounded text-black capitalize">
                      {lastCreatedCredentials.role}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] font-medium text-black opacity-60 block">Name</span>
                      <span className="font-medium text-black">{lastCreatedCredentials.name}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-black opacity-60 block">Login Email ID</span>
                      <div className="flex items-center justify-between bg-gray-50 p-1.5 rounded border border-gray-200 font-mono text-[11px] mt-0.5">
                        <span>{lastCreatedCredentials.email}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lastCreatedCredentials.email, 'last_email')}
                          className="text-black hover:underline text-[11px] px-1 cursor-pointer"
                        >
                          {copiedKey === 'last_email' ? '[Copied]' : '[Copy]'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-black opacity-60 block">Password</span>
                      <div className="flex items-center justify-between bg-gray-50 p-1.5 rounded border border-gray-200 font-mono text-[11px] mt-0.5">
                        <span>{lastCreatedCredentials.password}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lastCreatedCredentials.password, 'last_pwd')}
                          className="text-black hover:underline text-[11px] px-1 cursor-pointer"
                        >
                          {copiedKey === 'last_pwd' ? '[Copied]' : '[Copy]'}
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
                    className="w-full py-2 bg-black hover:bg-gray-900 text-white rounded-lg text-xs font-medium flex items-center justify-center cursor-pointer"
                  >
                    <span>{copiedKey === 'copy_all' ? 'Copied Slip' : 'Copy Credentials Slip'}</span>
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-dashed border-gray-200 rounded-lg p-6 text-center text-black opacity-60 text-xs font-normal">
                  Fill out the form on the left to generate active login credentials.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: BLOCKCHAIN RBAC ON-CHAIN PERMISSIONS */}
      {activeAdminView === 'blockchain' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-5 text-black">
          <div>
            <h3 className="text-sm font-semibold text-black">Smart Contract Role-Based Access Control (RBAC)</h3>
            <p className="text-xs font-normal text-black mt-0.5 opacity-75">
              Directly grant cryptographic roles on the <code className="font-mono text-black bg-gray-100 px-1 py-0.5 rounded">BlockDriveAccessControl.sol</code> Ethereum contract.
            </p>
          </div>

          {contractStatus && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-black">
              <span>{contractStatus}</span>
            </div>
          )}

          {contractError && (
            <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg text-xs text-black">
              <span>{contractError}</span>
            </div>
          )}

          <div className="space-y-4 max-w-xl text-black">
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Target Ethereum Wallet Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded-lg px-3 py-2 text-xs text-black font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-1.5">
                Select On-Chain Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['doctor', 'medicalStaff', 'patient'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setBlockchainRole(r)}
                    className={`py-2 px-3 rounded border text-xs font-medium capitalize cursor-pointer ${
                      blockchainRole === r
                        ? 'bg-white text-black border-black font-semibold'
                        : 'bg-white text-black border-gray-200 hover:bg-gray-50'
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
                className="py-2 px-4 bg-black hover:bg-gray-900 disabled:bg-gray-300 text-white font-medium rounded-lg text-xs flex items-center justify-center cursor-pointer"
              >
                <span>{isContractProcessing ? 'Executing On-Chain RBAC Transaction...' : `Assign On-Chain ${blockchainRole.toUpperCase()} Role`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
