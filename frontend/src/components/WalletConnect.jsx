import React from 'react';
import { Wallet, ShieldCheck, AlertCircle, ArrowLeftRight, UserCheck } from 'lucide-react';

export const HARDHAT_TEST_ACCOUNTS = [
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

export default function WalletConnect({ 
  account, 
  onConnect, 
  onConnectTestWallet, 
  onSelectTestAccount,
  isConnecting, 
  error, 
  chainId, 
  onSwitchNetwork 
}) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";

  const matchedAccount = HARDHAT_TEST_ACCOUNTS.find(
    a => a.address.toLowerCase() === (account || '').toLowerCase()
  );

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Ethereum Web3 Wallet</h2>
          <p className="text-sm text-slate-500">
            {account ? (
              <span className="font-mono text-emerald-600 font-medium flex items-center gap-1.5 flex-wrap">
                <ShieldCheck className="w-4 h-4 inline shrink-0" />
                <span>{matchedAccount ? matchedAccount.name : `${account.substring(0, 8)}...${account.substring(account.length - 6)}`}</span>
                <code className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  {account.substring(0, 6)}...{account.substring(account.length - 4)}
                </code>
              </span>
            ) : (
              "Connect MetaMask or use the instant 1-click test accounts below"
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {account && !isLocalOrSepolia && (
          <button
            onClick={onSwitchNetwork}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/20 animate-pulse"
          >
            ⚡ Switch to Local Network (31337)
          </button>
        )}

        {account ? (
          <div className="flex items-center gap-2">
            {/* Quick Switch Test Account Dropdown */}
            <div className="relative">
              <select
                value={matchedAccount ? matchedAccount.index : ""}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx) && onSelectTestAccount) {
                    onSelectTestAccount(idx);
                  }
                }}
                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold shadow-sm outline-none cursor-pointer"
                title="Switch test account to verify permissions"
              >
                <option value="" disabled>Switch Test Account...</option>
                {HARDHAT_TEST_ACCOUNTS.map((acc) => (
                  <option key={acc.index} value={acc.index}>
                    {acc.name} ({acc.address.substring(0, 6)}...)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onConnect}
              title="Switch to MetaMask extension"
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium shadow-sm transition-colors"
            >
              MetaMask
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-2"
            >
              Connect MetaMask
            </button>
            <button
              onClick={() => onSelectTestAccount ? onSelectTestAccount(0) : onConnectTestWallet()}
              disabled={isConnecting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
            >
              ⚡ Instant Account #0 (10k ETH)
            </button>
          </div>
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

