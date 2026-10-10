import React, { useState } from 'react';
import { useRole } from '../context/RoleContext';

export function formatRoleName(roleKey) {
  if (!roleKey) return 'Unregistered';
  const lower = roleKey.toLowerCase();
  if (lower === 'doctor') return 'Doctor';
  if (lower === 'medicalstaff' || lower === 'staff') return 'Medical Staff';
  if (lower === 'patient') return 'Patient';
  if (lower === 'admin' || lower === 'administrator') return 'Administrator';
  return roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
}

export default function WalletConnect({
  account,
  onConnect,
  isConnecting,
  error,
  chainId,
  onSwitchNetwork,
  currentRole,
}) {
  const isLocalOrSepolia = chainId === "0x7a69" || chainId === "0xaa36a7" || chainId === "31337" || chainId === "11155111";
  const { role } = useRole();
  const [copied, setCopied] = useState(false);

  const displayRole = formatRoleName(currentRole || (role !== 'unregistered' ? role : '') || role || 'doctor');

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
                <span className="text-black bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 font-mono">
                  {formatAddress(account)}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copy address"
                  className="text-black hover:underline text-[11px] px-1 py-0.5 border border-gray-200 rounded bg-white cursor-pointer"
                >
                  {copied ? '[Copied]' : '[Copy]'}
                </button>
                <span className="text-xs text-black bg-gray-100 px-2 py-0.5 rounded font-medium">
                  {displayRole}
                </span>
              </div>
            ) : (
              <span>Connect MetaMask to sign transactions and encrypt records.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
        {account && !isLocalOrSepolia && (
          <button
            onClick={onSwitchNetwork}
            className="px-2.5 py-1 bg-black text-white text-xs font-medium rounded cursor-pointer"
          >
            Switch to Localhost
          </button>
        )}

        {!account && (
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
        <div className="w-full mt-2 p-2 bg-gray-50 border border-gray-300 text-black text-xs rounded">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
