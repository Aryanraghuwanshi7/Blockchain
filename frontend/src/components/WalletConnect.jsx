import React, { useState } from 'react';
import { ethers } from 'ethers';
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
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-black">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-black">Wallet:</span>
            <span className="text-xs text-black">
              {account ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <div className="text-xs text-black mt-0.5">
            {account ? (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-black bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                  {formatAddress(account)}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copy address"
                  className="text-black hover:underline text-[11px] px-1 py-0.5 border border-gray-200 rounded bg-white cursor-pointer"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <span className="text-xs text-black bg-gray-100 px-2 py-0.5 rounded capitalize">
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
            <span className="text-black px-1 hidden sm:inline">Role:</span>
            {['doctor', 'medicalStaff', 'patient'].map((r) => (
              <button
                key={r}
                onClick={() => handleSwitchRole(r)}
                disabled={isSwitching || role === r}
                className={`px-2 py-0.5 rounded text-xs cursor-pointer capitalize ${
                  role === r
                    ? 'bg-white text-black font-semibold border border-gray-300 shadow-xs'
                    : 'text-black hover:bg-gray-200/50'
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
            className="px-2.5 py-1 bg-black text-white text-xs font-medium rounded cursor-pointer"
          >
            Switch to Localhost
          </button>
        )}

        {account ? (
          <button
            onClick={onConnect}
            className="px-2.5 py-1 bg-white hover:bg-gray-50 text-black border border-gray-300 rounded text-xs font-medium flex items-center cursor-pointer"
          >
            <span>Switch Account</span>
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="px-3 py-1.5 bg-black hover:bg-gray-900 disabled:bg-gray-300 text-white text-xs font-medium rounded flex items-center cursor-pointer"
          >
            <span>{isConnecting ? "Connecting..." : "Connect Wallet"}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="w-full mt-2 p-2 bg-red-50 border border-red-200 text-black text-xs rounded">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}


