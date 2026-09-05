import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Shield, HardDrive, Key, User, LogOut, LogIn, Sparkles } from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import WalletConnect from './components/WalletConnect';
import UploadFile from './components/UploadFile';
import MyFiles from './components/MyFiles';
import SharedFiles from './components/SharedFiles';
import RequestAccessDecrypt from './components/RequestAccessDecrypt';
import AuthModal from './components/AuthModal';

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [userKeys, setUserKeys] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');

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
    await supabase.auth.signOut();
    setAuthUser(null);
  };

  // Initialize client-side ECDH keypair for session-based key wrapping
  useEffect(() => {
    async function initKeys() {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      const pubJWK = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const privJWK = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
      setUserKeys({
        publicKeyJWK: pubJWK,
        privateKeyJWK: privJWK,
      });
    }
    initKeys();
  }, []);

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

  const HARDHAT_TEST_ACCOUNTS = [
    {
      index: 0,
      name: "Account #0 (Primary Uploader)",
      address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    },
    {
      index: 1,
      name: "Account #1 (Recipient / Anmol2)",
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    },
    {
      index: 2,
      name: "Account #2 (Third Party / Guest)",
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      privateKey: "0x5de4111afa1a4b94908f83103eb2f958080a12f9f2a24d6bdaab40273a10dd51"
    }
  ];

  const connectTestAccountByIndex = async (index = 0) => {
    setIsConnecting(true);
    setError("");
    try {
      const targetAcc = HARDHAT_TEST_ACCOUNTS[index] || HARDHAT_TEST_ACCOUNTS[0];
      const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const localSigner = new ethers.Wallet(targetAcc.privateKey, localProvider);
      const address = await localSigner.getAddress();
      setProvider(localProvider);
      setSigner(localSigner);
      setAccount(address);
      setChainId("0x7a69");
    } catch (err) {
      console.error("Local test wallet error:", err);
      setError("Failed to connect to local Hardhat node at http://127.0.0.1:8545. Make sure 'npx hardhat node' is running.");
    } finally {
      setIsConnecting(false);
    }
  };

  const connectLocalTestWallet = async () => {
    await connectTestAccountByIndex(0);
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      // If MetaMask is missing or broken, fallback to local test wallet automatically
      connectLocalTestWallet();
      return;
    }
    setIsConnecting(true);
    setError("");

    try {
      // 1. Request account access from MetaMask
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

      // 2. Prompt switch to localhost if on mainnet/wrong network
      if (currentChainHex !== "0x7a69" && currentChainHex !== "0xaa36a7") {
        await switchToLocalhostNetwork();
      }
    } catch (err) {
      console.error("Wallet connection error:", err);
      if (err.code === -32002) {
        setError("MetaMask is currently busy or locked. You can click 'Use Built-in Test Wallet' below to test instantly!");
      } else if (err.code === 4001) {
        setError("Connection request rejected. Please approve the MetaMask prompt to proceed.");
      } else {
        setError(err.message || "Failed to connect wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      // Auto-check already connected accounts on page load
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">BlockDrive</h1>
            <p className="text-xs text-slate-500">Decentralized Access-Controlled IPFS Storage</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Supabase User Auth State / Button */}
          {authUser ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 shadow-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <User className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-medium max-w-[150px] truncate">{authUser.email}</span>
              <button
                onClick={handleSignOut}
                title="Sign Out"
                className="ml-2 text-slate-400 hover:text-rose-600 transition-colors p-1"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setAuthModalView('signIn');
                  setIsAuthModalOpen(true);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-600" />
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthModalView('signUp');
                  setIsAuthModalOpen(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Sign Up
              </button>
            </div>
          )}

          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>IEEE Access 2018</span>
          </div>
        </div>
      </header>

      {/* Auth Modal Component */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialView={authModalView}
        onAuthSuccess={(user) => setAuthUser(user)}
      />

      {/* Wallet Connection */}
      <WalletConnect
        account={account}
        onConnect={connectWallet}
        onConnectTestWallet={connectLocalTestWallet}
        onSelectTestAccount={connectTestAccountByIndex}
        isConnecting={isConnecting}
        error={error}
        chainId={chainId}
        onSwitchNetwork={switchToLocalhostNetwork}
      />

      {/* Main Content Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200 gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Upload & Encrypt
          </button>
          <button
            onClick={() => setActiveTab('myfiles')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'myfiles'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Files & Access
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'shared'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Shared With Me
          </button>
          <button
            onClick={() => setActiveTab('decrypt')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
              activeTab === 'decrypt'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Manual Decrypt
          </button>
        </div>

        {activeTab === 'upload' && (
          <UploadFile
            signer={signer}
            userKeys={userKeys}
            onConnectWallet={connectLocalTestWallet}
            onFileUploaded={() => setActiveTab('myfiles')}
          />
        )}
        {activeTab === 'myfiles' && (
          <MyFiles signer={signer} account={account} userKeys={userKeys} />
        )}
        {activeTab === 'shared' && (
          <SharedFiles signer={signer} account={account} userKeys={userKeys} />
        )}
        {activeTab === 'decrypt' && (
          <RequestAccessDecrypt signer={signer} userKeys={userKeys} />
        )}
      </div>

      {/* Client Key Inspection Box */}
      {userKeys && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 shadow-sm">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold mb-1">
            <Key className="w-3.5 h-3.5 text-indigo-600" />
            <span>Active Session ECDH Public Key (JWK format for recipient wrapping)</span>
          </div>
          <div className="truncate text-slate-500 select-all">
            {JSON.stringify(userKeys.publicKeyJWK)}
          </div>
        </div>
      )}
    </div>
  );
}
