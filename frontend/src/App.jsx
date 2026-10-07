import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
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
          roles: ['doctor', 'medicalStaff'],
        },
        {
          id: 'myfiles',
          label: 'My Files & Access',
          desc: 'Manage your documents',
          roles: ['doctor', 'medicalStaff'],
        },
        {
          id: 'shared',
          label: 'Shared With Me',
          desc: 'Records shared with you',
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
          roles: ['doctor', 'medicalStaff', 'patient'],
        },
        {
          id: 'verify',
          label: 'Verify Document',
          desc: 'Validate document integrity',
          roles: ['doctor', 'medicalStaff', 'patient', 'admin'],
        },
        {
          id: 'issue',
          label: 'Issue Certificate',
          desc: 'Create a digital certificate',
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
    label: activeTab
  };


  return (
    <div className="min-h-screen bg-gray-50 text-black flex flex-col justify-between">
      {/* Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Vertical Sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 max-w-[80vw] bg-white border-r border-gray-200 z-50 shadow-md flex flex-col ${
          isSidebarOpen ? 'block' : 'hidden'
        }`}
        aria-label="Navigation Sidebar"
      >
        {/* Sidebar Header */}
        <div className="h-14 px-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-black">BlockDrive</span>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 text-black hover:bg-gray-100 rounded text-xs font-medium cursor-pointer"
            aria-label="Close sidebar"
          >
            Close ✕
          </button>
        </div>

        {/* Sidebar Grouped Navigation */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-0.5">
              <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-black">
                {group.title}
              </div>
              {group.items.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left cursor-pointer ${
                      isActive
                        ? 'bg-gray-100 text-black font-semibold'
                        : 'text-black hover:bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs ${isActive ? 'font-semibold text-black' : 'font-normal text-black'}`}>
                        {tab.label}
                      </div>
                      <p className="text-[11px] text-black font-normal truncate mt-0.5 opacity-70">
                        {tab.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer Info & Role Portal Switcher */}
        <div className="p-3 border-t border-gray-200 text-xs text-black bg-white flex flex-col gap-2 shrink-0">
          <button
            onClick={() => {
              setIsSidebarOpen(false);
              onOpenRolePortal();
            }}
            className="w-full py-1.5 px-3 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium text-black flex items-center justify-center cursor-pointer"
          >
            <span>Switch Role Portal</span>
          </button>

          <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs text-black">
            <span>Status</span>
            <span className="text-black font-medium">{account ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="px-2.5 py-1 text-black hover:bg-gray-100 border border-gray-200 rounded text-xs font-medium cursor-pointer"
            >
              <span>Menu</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-black">BlockDrive</span>
                <span className="px-1.5 py-0.2 text-[10px] font-medium bg-gray-100 text-black rounded border border-gray-200">
                  v1.0
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {authUser && (
              <div className="hidden sm:flex items-center bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-xs text-black">
                <span className="max-w-[160px] truncate">{authUser.email}</span>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 text-black rounded text-xs font-medium flex items-center cursor-pointer"
              title="Log out and return to choose role page"
            >
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4 flex-1 w-full text-black">
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

        {/* Page Breadcrumb */}
        <div className="flex items-center justify-between pb-1 border-b border-gray-200">
          <div className="flex items-center gap-1.5 text-xs text-black">
            <span>BlockDrive</span>
            <span>/</span>
            <span className="font-semibold text-black">
              {currentActiveTab.label}
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex items-center text-xs text-black font-medium px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 cursor-pointer"
          >
            <span>Menu</span>
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
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-400">
        BlockDrive • Decentralized Healthcare Storage
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
