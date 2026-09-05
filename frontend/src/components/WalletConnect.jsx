import React from 'react';
import { Wallet, ShieldCheck, AlertCircle } from 'lucide-react';

export default function WalletConnect({ account, onConnect, isConnecting, error, chainId, onSwitchNetwork }) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-xl shadow-indigo-950/20 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-950 text-indigo-400 rounded-lg border border-indigo-800">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Ethereum Web3 Wallet</h2>
          <p className="text-sm text-slate-400">
            {account ? (
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 inline" /> {account.substring(0, 6)}...{account.substring(account.length - 4)}
              </span>
            ) : (
              "Connect MetaMask to manage files and execute cryptographic access control"
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {account && !isLocalOrSepolia && (
          <button
            onClick={onSwitchNetwork}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-amber-600/20 animate-pulse"
          >
            ⚡ Switch to Local Network (31337)
          </button>
        )}

        {account ? (
          <div className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm font-mono">
            {isLocalOrSepolia ? "Connected (Local 31337)" : "Wrong Network (Mainnet)"}
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>

      {error && (
        <div className="w-full mt-2 p-3 bg-red-950/50 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
