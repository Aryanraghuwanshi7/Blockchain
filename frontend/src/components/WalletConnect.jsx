import React from 'react';
import { Wallet, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

export default function WalletConnect({ 
  account, 
  onConnect, 
  isConnecting, 
  error, 
  chainId, 
  onSwitchNetwork 
}) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">MetaMask Wallet</h2>
          <p className="text-sm text-slate-500">
            {account ? (
              <span className="font-mono text-emerald-600 font-medium flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-4 h-4 inline shrink-0" />
                <span>Connected:</span>
                <code className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md border border-slate-200">
                  {account}
                </code>
              </span>
            ) : (
              "Connect MetaMask to manage your encrypted files"
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {account && !isLocalOrSepolia && (
          <button
            onClick={onSwitchNetwork}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/20 animate-pulse"
          >
            ⚡ Switch Network to Localhost (31337)
          </button>
        )}

        {account ? (
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {chainId === "0xaa36a7" || chainId === "11155111" ? "Sepolia Testnet" : "Hardhat Local (31337)"}
            </div>

            <button
              onClick={onConnect}
              title="Click to request account switch in MetaMask"
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              Switch Account in MetaMask
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" /> Connect MetaMask
          </button>
        )}
      </div>

      {error && (
        <div className="w-full mt-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}


