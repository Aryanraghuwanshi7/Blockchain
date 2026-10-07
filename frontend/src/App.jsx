import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  Shield,
  HardDrive,
  Key,
  User,
  LogOut,
  LogIn,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Upload,
  FileText,
  Share2,
  CheckCircle2,
  Award,
  ChevronRight,
  Copy,
  Check,
  Users,
  ShieldAlert
} from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import WalletConnect from './components/WalletConnect';
import UploadFile from './components/UploadFile';
import MyFiles from './components/MyFiles';
import SharedFiles from './components/SharedFiles';
import RequestAccessDecrypt from './components/RequestAccessDecrypt';
import AuthModal from './components/AuthModal';
import RoleSelection from './components/RoleSelection';
import RoleLogin from './components/RoleLogin';
import RoleManagement from './components/admin/RoleManagement';
import { CertificateVerifier, CertificateIssuer } from './features/certificate-verification';
import { RoleProvider, useRole } from './context/RoleContext';
import { isLocalNodeAlive } from './utils/contracts';

function AppContent({
  signer,
  account,
  isConnecting,
  error,
  chainId,
  switchToLocalhostNetwork,
  connectWallet,
  connectLocalTestWallet,
  authUser,
  isAuthModalOpen,
  setIsAuthModalOpen,
  authModalView,
  setAuthModalView,
  handleSignOut,
  setAuthUser,
  userKeys,
  showKeyDetails,
  setShowKeyDetails,
  activeTab,
  setActiveTab,
  currentRole,
  onOpenRolePortal
}) {
  const { role } = useRole();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedJWK, setCopiedJWK] = useState(false);

  // Close sidebar on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyJWK = () => {
    if (!userKeys?.publicKeyJWK) return;
    navigator.clipboard.writeText(JSON.stringify(userKeys.publicKeyJWK));
    setCopiedJWK(true);
    setTimeout(() => setCopiedJWK(false), 2000);
  };

  const activeRole = currentRole || role || 'doctor';

  const ALL_NAV_GROUPS = [
    {
      title: 'WORKSPACE',
      roles: ['doctor', 'medicalStaff', 'patient'],
      items: [
        {
          id: 'upload',
          label: 'Upload & Encrypt',
          desc: 'Securely upload records',
          icon: Upload,
          roles: ['doctor', 'medicalStaff'],
        },
        {
          id: 'myfiles',
          label: 'My Files & Access',
          desc: 'Manage your documents',
          icon: FileText,
          roles: ['doctor', 'medicalStaff'],
        },
        {
          id: 'shared',
          label: 'Shared With Me',
          desc: 'Records shared with you',
          icon: Share2,
          roles: ['doctor', 'medicalStaff', 'patient'],
        },
      ],
    },
    {
      title: 'SECURITY',
      roles: ['doctor', 'medicalStaff', 'patient', 'admin'],
      items: [
        {
          id: 'decrypt',
          label: 'Manual Decrypt',
          desc: 'Decrypt a document',
          icon: Key,
          roles: ['doctor', 'medicalStaff', 'patient'],
        },
        {
          id: 'verify',
          label: 'Verify Document',
          desc: 'Validate document integrity',
          icon: CheckCircle2,
          roles: ['doctor', 'medicalStaff', 'patient', 'admin'],
        },
        {
          id: 'issue',
          label: 'Issue Certificate',
          desc: 'Create a digital certificate',
          icon: Award,
          roles: ['doctor'],
        },
      ],
    },
    {
      title: 'ADMINISTRATION',
      roles: ['admin'],
      items: [
        {
          id: 'admin',
          label: 'Role Management',
          desc: 'Onboard & revoke roles',
          icon: ShieldAlert,
          roles: ['admin'],
        },
      ],
    },
  ];

  // Filter groups and items specifically for the active role
  const NAV_GROUPS = ALL_NAV_GROUPS
    .filter((g) => !g.roles || g.roles.includes(activeRole))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.roles || item.roles.includes(activeRole)),
    }))
    .filter((g) => g.items.length > 0);

  const allTabs = NAV_GROUPS.flatMap((g) => g.items);
  const currentActiveTab = allTabs.find((t) => t.id === activeTab) || allTabs[0] || {
    id: activeTab,
    label: activeTab,
    icon: HardDrive
  };
  const CurrentIcon = currentActiveTab.icon;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Backdrop Overlay with smooth fade-in and fade-out */}
      <div
        className={`fixed inset-0 bg-slate-900/25 backdrop-blur-[1.5px] z-40 transition-opacity duration-[260ms] ease-out ${
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Collapsible Vertical Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 max-w-[80vw] bg-white border-r border-slate-200 z-50 shadow-lg flex flex-col transform transition-transform duration-[240ms] ease-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigation Sidebar"
      >
        {/* Sidebar Header */}
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-slate-900 text-white rounded">
              <HardDrive className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900">BlockDrive</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Grouped Navigation */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {NAV_GROUPS.map((group, groupIdx) => {
            let runningIdx = groupIdx * 3;
            return (
              <div key={group.title} className="space-y-0.5">
                <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  {group.title}
                </div>
                {group.items.map((tab, itemIdx) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const itemIndex = runningIdx + itemIdx;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsSidebarOpen(false);
                      }}
                      style={{
                        transitionDelay: isSidebarOpen ? `${itemIndex * 20 + 20}ms` : '0ms',
                      }}
                      className={`w-full group flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all duration-150 relative cursor-pointer ${
                        isSidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                      } ${
                        isActive
                          ? 'bg-slate-100 text-slate-900 font-medium shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-slate-900 rounded-r" />
                      )}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`p-0.5 transition-colors shrink-0 mt-0.5 ${
                          isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-xs ${isActive ? 'font-medium text-slate-900' : 'font-normal text-slate-700'}`}>
                            {tab.label}
                          </div>
                          <p className="text-[11px] text-slate-400 group-hover:text-slate-500 font-normal truncate mt-0.5">
                            {tab.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ml-1.5 ${
                        isActive ? 'opacity-100 text-slate-700' : 'opacity-0 group-hover:opacity-100 text-slate-400'
                      }`} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer Info & Role Portal Switcher */}
        <div className="p-3 border-t border-slate-200 text-xs text-slate-600 bg-white flex flex-col gap-2.5 shrink-0">
          <button
            onClick={() => {
              setIsSidebarOpen(false);
              onOpenRolePortal();
            }}
            className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Switch Role Portal</span>
          </button>

          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 font-normal">Status</span>
            <div className="flex items-center gap-1.5 font-normal text-slate-700 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${account ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{account ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Enterprise Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Hamburger / Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="p-1.5 -ml-1.5 mr-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1.5 focus:outline-none cursor-pointer"
            >
              <Menu className="w-4 h-4" />
              <span className="text-xs font-medium text-slate-600 hidden md:inline">Menu</span>
            </button>

            <div className="p-1 bg-slate-900 text-white rounded">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">BlockDrive</span>
                <span className="px-1.5 py-0.2 text-[10px] font-medium bg-slate-100 text-slate-600 rounded border border-slate-200">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block font-normal">Decentralized Access-Controlled Storage System</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Supabase User Email Indicator */}
            {authUser && (
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-normal max-w-[160px] truncate">{authUser.email}</span>
              </div>
            )}

            {/* Clean Log Out Button */}
            <button
              onClick={handleSignOut}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Log out and return to choose role page"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1 w-full">
        {/* Auth Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialView={authModalView}
          onAuthSuccess={(user) => setAuthUser(user)}
        />

        {/* Web3 Wallet Connection Card */}
        <WalletConnect
          account={account}
          onConnect={connectWallet}
          isConnecting={isConnecting}
          error={error}
          chainId={chainId}
          onSwitchNetwork={switchToLocalhostNetwork}
        />

        {/* Clean Page Breadcrumb / View Header */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-200">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-normal">
            <span className="text-slate-400">BlockDrive</span>
            <span>/</span>
            <span className="font-medium text-slate-900 flex items-center gap-1.5">
              <CurrentIcon className="w-3.5 h-3.5 text-slate-500" />
              {currentActiveTab.label}
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Menu className="w-3.5 h-3.5" />
            <span>Switch Tab</span>
          </button>
        </div>

        {/* Tab Content Panes */}
        <div>
          {activeTab === 'upload' && (
            <UploadFile
              signer={signer}
              account={account}
              userKeys={userKeys}
              onConnectWallet={connectLocalTestWallet}
              onFileUploaded={() => setActiveTab('myfiles')}
            />
          )}
          {activeTab === 'myfiles' && (
            <MyFiles
              signer={signer}
              account={account}
              userKeys={userKeys}
              onNavigateTab={setActiveTab}
            />
          )}
          {activeTab === 'shared' && (
            <SharedFiles signer={signer} account={account} userKeys={userKeys} />
          )}
          {activeTab === 'decrypt' && (
            <RequestAccessDecrypt signer={signer} userKeys={userKeys} />
          )}
          {activeTab === 'verify' && (
            <CertificateVerifier />
          )}
          {activeTab === 'issue' && (
            <CertificateIssuer
              signer={signer}
              account={account}
              onConnectWallet={connectLocalTestWallet}
            />
          )}
          {activeTab === 'admin' && (
            <RoleManagement signer={signer} account={account} />
          )}
        </div>

        {/* Collapsible Session ECDH Public Key Inspector */}
        {userKeys && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-600 shadow-2xs">
            <button
              onClick={() => setShowKeyDetails(!showKeyDetails)}
              className="w-full flex items-center justify-between text-slate-700 font-medium hover:text-slate-900 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span>Client ECDH Public Key (P-256 JWK Session)</span>
              </div>
              {showKeyDetails ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {showKeyDetails && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-slate-400">P-256 JWK Parameters</span>
                  <button
                    onClick={handleCopyJWK}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors"
                  >
                    {copiedJWK ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedJWK ? 'Copied' : 'Copy JWK'}</span>
                  </button>
                </div>
                <div className="font-mono text-[11px] text-slate-600 break-all select-all bg-slate-50 p-2 rounded border border-slate-100">
                  {JSON.stringify(userKeys.publicKeyJWK)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subtle Security Status Footer Strip */}
        <div className="border border-slate-200 bg-white rounded-lg p-3 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium text-slate-700 text-xs">Security Status</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-normal">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${account ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{account ? 'Wallet connected' : 'Wallet not connected'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${userKeys ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{userKeys ? 'Encryption available' : 'Session keys pending'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${account ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>Access control active</span>
            </span>
          </div>
        </div>
      </main>

      {/* Formal Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-400 font-normal">
        BlockDrive Decentralized Storage Architecture • Cryptographic Access Control Layer
      </footer>
    </div>
  );
}

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [userKeys, setUserKeys] = useState(null);
  const [showKeyDetails, setShowKeyDetails] = useState(false);

  // Determine initial view and role
  const getInitialView = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam && ['roleSelection', 'roleLogin', 'dashboard'].includes(viewParam)) {
      return viewParam;
    }
    const tabParam = urlParams.get('tab');
    if (tabParam) return 'dashboard';
    return 'roleSelection';
  };

  const [currentView, setCurrentView] = useState(getInitialView);
  const [selectedRole, setSelectedRole] = useState(() => {
    return localStorage.getItem('blockdrive_active_role') || 'doctor';
  });

  // Support deep links like ?tab=verify or ?tab=issue or #verify
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['upload', 'myfiles', 'shared', 'decrypt', 'verify', 'issue', 'admin'].includes(tabParam)) {
      return tabParam;
    }
    const hash = window.location.hash.replace('#', '');
    if (['upload', 'myfiles', 'shared', 'decrypt', 'verify', 'issue', 'admin'].includes(hash)) {
      return hash;
    }
    return 'upload';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Supabase User Auth State
  const [authUser, setAuthUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState('signIn');

  useEffect(() => {
    // Check initial Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
    });

    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Sign out note:', e);
    }
    setAuthUser(null);
    setSelectedRole('patient');
    setCurrentView('roleSelection');
  };

  // Initialize client-side ECDH keypair per connected account for reliable key agreement
  useEffect(() => {
    async function initKeys() {
      const targetAddress = account ? account.toLowerCase() : 'default_session';
      const storageKey = `blockdrive_ecdh_keys_${targetAddress}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setUserKeys(parsed);
          if (account) {
            const pubRegistry = JSON.parse(localStorage.getItem('blockdrive_public_ecdh_registry') || '{}');
            pubRegistry[targetAddress] = parsed.publicKeyJWK;
            localStorage.setItem('blockdrive_public_ecdh_registry', JSON.stringify(pubRegistry));
          }
          return;
        } catch (e) {
          console.warn(e);
        }
      }

      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      const pubJWK = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const privJWK = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const newKeys = {
        publicKeyJWK: pubJWK,
        privateKeyJWK: privJWK,
      };
      localStorage.setItem(storageKey, JSON.stringify(newKeys));
      if (account) {
        const pubRegistry = JSON.parse(localStorage.getItem('blockdrive_public_ecdh_registry') || '{}');
        pubRegistry[targetAddress] = pubJWK;
        localStorage.setItem('blockdrive_public_ecdh_registry', JSON.stringify(pubRegistry));
      }
      setUserKeys(newKeys);
    }
    initKeys();
  }, [account]);

  const [chainId, setChainId] = useState('');

  const switchToLocalhostNetwork = async () => {
    if (!window.ethereum) return;
    const targetChainId = "0x7a69"; // 31337 in hex
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
      setChainId(targetChainId);
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetChainId,
                chainName: "Hardhat Localhost",
                rpcUrls: ["http://127.0.0.1:8545/"],
                nativeCurrency: {
                  name: "ETH",
                  symbol: "ETH",
                  decimals: 18,
                },
              },
            ],
          });
          setChainId(targetChainId);
        } catch (addError) {
          console.error("Failed to add local network", addError);
        }
      }
    }
  };

  const connectLocalTestWallet = async () => {
    try {
      const alive = await isLocalNodeAlive();
      if (alive) {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const localSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", localProvider);
        const address = await localSigner.getAddress();
        setProvider(localProvider);
        setSigner(localSigner);
        setAccount(address);
        setChainId("0x7a69");
      } else {
        const randomWallet = ethers.Wallet.createRandom();
        setSigner(randomWallet);
        setAccount(randomWallet.address);
        setChainId("0x7a69");
      }
    } catch (err) {
      console.error(err);
      setError("Please connect MetaMask or ensure local Hardhat node is running.");
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      connectLocalTestWallet();
      return;
    }
    setIsConnecting(true);
    setError("");

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No Ethereum account selected in MetaMask.");
      }

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const userSigner = await browserProvider.getSigner();
      const currentNetwork = await browserProvider.getNetwork();
      const currentChainHex = "0x" + currentNetwork.chainId.toString(16);

      setProvider(browserProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
      setChainId(currentChainHex);

      if (currentChainHex !== "0x7a69" && currentChainHex !== "0xaa36a7") {
        await switchToLocalhostNetwork();
      }
    } catch (err) {
      console.error("Wallet connection error:", err);
      if (err.code === -32002) {
        setError("MetaMask is currently locked or pending confirmation. Please unlock MetaMask.");
      } else if (err.code === 4001) {
        setError("Connection request was cancelled.");
      } else {
        setError(err.message || "Failed to connect wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
        if (accounts && accounts.length > 0) {
          try {
            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const userSigner = await browserProvider.getSigner();
            const network = await browserProvider.getNetwork();
            setProvider(browserProvider);
            setSigner(userSigner);
            setAccount(accounts[0]);
            setChainId("0x" + network.chainId.toString(16));
          } catch (e) {
            console.warn("Auto-connect initialization skipped:", e);
          }
        }
      });

      window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(id));

      const handleAccountsChanged = async (accounts) => {
        if (accounts && accounts.length > 0) {
          try {
            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const userSigner = await browserProvider.getSigner();
            const network = await browserProvider.getNetwork();
            setProvider(browserProvider);
            setSigner(userSigner);
            setAccount(accounts[0]);
            setChainId("0x" + network.chainId.toString(16));
            setError("");
          } catch (e) {
            console.error(e);
          }
        } else {
          setAccount("");
          setSigner(null);
          setProvider(null);
        }
      };

      const handleChainChanged = (newChainId) => {
        setChainId(newChainId);
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, []);

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleRoleContinue = (roleId) => {
    setSelectedRole(roleId);
    setCurrentView('roleLogin');
  };

  const handleEnterDashboard = (chosenRole) => {
    const cleanAccount = account ? account.toLowerCase() : 'default_session';
    localStorage.setItem(`blockdrive_role_override_${cleanAccount}`, chosenRole);
    localStorage.setItem('blockdrive_active_role', chosenRole);
    setSelectedRole(chosenRole);

    if (chosenRole === 'patient') {
      setActiveTab('shared');
    } else if (chosenRole === 'admin') {
      setActiveTab('admin');
    } else {
      setActiveTab('upload');
    }

    setCurrentView('dashboard');
  };

  return (
    <RoleProvider provider={provider} account={account}>
      {currentView === 'roleSelection' && (
        <RoleSelection
          selectedRole={selectedRole}
          onSelectRole={handleRoleSelect}
          onContinue={handleRoleContinue}
        />
      )}

      {currentView === 'roleLogin' && (
        <RoleLogin
          role={selectedRole}
          account={account}
          onBackToRoles={() => setCurrentView('roleSelection')}
          onLoginSuccess={(user) => setAuthUser(user)}
          onConnectWallet={connectWallet}
          isConnectingWallet={isConnecting}
          onEnterDashboard={handleEnterDashboard}
        />
      )}

      {currentView === 'dashboard' && (
        <AppContent
          signer={signer}
          account={account}
          isConnecting={isConnecting}
          error={error}
          chainId={chainId}
          switchToLocalhostNetwork={switchToLocalhostNetwork}
          connectWallet={connectWallet}
          connectLocalTestWallet={connectLocalTestWallet}
          authUser={authUser}
          isAuthModalOpen={isAuthModalOpen}
          setIsAuthModalOpen={setIsAuthModalOpen}
          authModalView={authModalView}
          setAuthModalView={setAuthModalView}
          handleSignOut={handleSignOut}
          setAuthUser={setAuthUser}
          userKeys={userKeys}
          showKeyDetails={showKeyDetails}
          setShowKeyDetails={setShowKeyDetails}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentRole={selectedRole}
          onOpenRolePortal={() => setCurrentView('roleSelection')}
        />
      )}
    </RoleProvider>
  );
}
