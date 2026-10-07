import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Wallet, AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import {
  onboardDoctor,
  onboardMedicalStaff,
  onboardPatient,
  revokeHealthcareRole,
  isLocalNodeAlive
} from '../utils/contracts';

export default function WalletConnect({
  account,
  onConnect,
  isConnecting,
  error,
  chainId,
  onSwitchNetwork
}) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";
  const { role, refreshRole } = useRole();
  const [isSwitching, setIsSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  const handleSwitchRole = async (targetRole) => {
    if (!account) return;
    setIsSwitching(true);
    const cleanAccount = account.toLowerCase();

    localStorage.setItem(`blockdrive_role_override_${cleanAccount}`, targetRole);

    if (refreshRole) {
      await refreshRole();
    }

    try {
      const isAlive = await isLocalNodeAlive();
      if (isAlive) {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const adminSigner = new ethers.Wallet(
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          localProvider
        );
      
        try {
          await adminSigner.sendTransaction({
            to: account,
            value: ethers.parseEther("2.0")
          });
        } catch {}

        try { await revokeHealthcareRole(adminSigner, account, 'patient'); } catch {}
        try { await revokeHealthcareRole(adminSigner, account, 'doctor'); } catch {}
        try { await revokeHealthcareRole(adminSigner, account, 'medicalStaff'); } catch {}

        if (targetRole === 'doctor') {
          await onboardDoctor(adminSigner, account);
        } else if (targetRole === 'medicalStaff') {
          await onboardMedicalStaff(adminSigner, account);
        } else if (targetRole === 'patient') {
          await onboardPatient(adminSigner, account);
        }
      }
    } catch (err) {
      console.warn("Role update note:", err.message);
    } finally {
      if (refreshRole) await refreshRole();
      setIsSwitching(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-gray-100 text-gray-700 rounded shrink-0">
          <Wallet className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-900">Wallet</span>
            <span className="text-xs text-gray-500">
              {account ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {account ? (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                  {formatAddress(account)}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copy address"
                  className="text-gray-400 hover:text-gray-700 p-0.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded capitalize">
                  {role}
                </span>
              </div>
            ) : (
              <span>Connect MetaMask to sign transactions and encrypt records.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
        {account && (
          <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded p-0.5 text-xs">
            <span className="text-gray-500 px-1 hidden sm:inline">Role:</span>
            {['doctor', 'medicalStaff', 'patient'].map((r) => (
              <button
                key={r}
                onClick={() => handleSwitchRole(r)}
                disabled={isSwitching || role === r}
                className={`px-2 py-0.5 rounded text-xs cursor-pointer capitalize ${
                  role === r
                    ? 'bg-white text-gray-900 font-semibold border border-gray-300 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {r === 'medicalStaff' ? 'Staff' : r}
              </button>
            ))}
          </div>
        )}

        {account && !isLocalOrSepolia && (
          <button
            onClick={onSwitchNetwork}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded cursor-pointer"
          >
            Switch to Localhost
          </button>
        )}

        {account ? (
          <button
            onClick={onConnect}
            className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-gray-500" />
            <span>Switch Account</span>
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="w-full mt-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

