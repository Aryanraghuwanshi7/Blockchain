import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Shield, HardDrive, Key, User, LogOut, LogIn, Sparkles } from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import WalletConnect from './components/WalletConnect';
import UploadFile from './components/UploadFile';
import MyFiles from './components/MyFiles';
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

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("MetaMask or compatible Web3 wallet not detected.");
      return;
    }
    setIsConnecting(true);
    setError("");

    try {
      await switchToLocalhostNetwork();
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const userSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(userSigner);
      setAccount(accounts[0]);
      setChainId("0x" + network.chainId.toString(16));
    } catch (err) {
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_chainId" }).then((id) => setChainId(id));
      window.ethereum.on("accountsChanged", async (accounts) => {
        if (accounts.length > 0) {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          const userSigner = await browserProvider.getSigner();
          const network = await browserProvider.getNetwork();
          setProvider(browserProvider);
          setSigner(userSigner);
          setAccount(accounts[0]);
          setChainId("0x" + network.chainId.toString(16));
        } else {
          setAccount("");
          setSigner(null);
        }
      });
      window.ethereum.on("chainChanged", (newChainId) => {
        setChainId(newChainId);
      });
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
        isConnecting={isConnecting}
        error={error}
        chainId={chainId}
        onSwitchNetwork={switchToLocalhostNetwork}
      />

      {/* Main Content Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-slate-200 gap-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Upload & Encrypt
          </button>
          <button
            onClick={() => setActiveTab('myfiles')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'myfiles'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Files & Access
          </button>
          <button
            onClick={() => setActiveTab('decrypt')}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'decrypt'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Decrypt & Download
          </button>
        </div>

        {activeTab === 'upload' && (
          <UploadFile signer={signer} userKeys={userKeys} />
        )}
        {activeTab === 'myfiles' && (
          <MyFiles signer={signer} account={account} userKeys={userKeys} />
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
