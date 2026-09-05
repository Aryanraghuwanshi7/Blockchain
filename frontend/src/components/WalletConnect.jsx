import React from 'react';
import { Wallet, ShieldCheck, AlertCircle } from 'lucide-react';

export default function WalletConnect({ account, onConnect, isConnecting, error, chainId, onSwitchNetwork }) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Ethereum Web3 Wallet</h2>
          <p className="text-sm text-slate-500">
            {account ? (
              <span className="font-mono text-emerald-600 font-medium flex items-center gap-1">
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
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/20 animate-pulse"
          >
            ⚡ Switch to Local Network (31337)
          </button>
        )}

        {account ? (
          <div className="px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-sm font-mono font-medium">
            {isLocalOrSepolia ? "Connected (Local 31337)" : "Wrong Network (Mainnet)"}
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>

      {error && (
        <div className="w-full mt-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
