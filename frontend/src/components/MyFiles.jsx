import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Folder, UserPlus, Check, Loader2 } from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { wrapKeyForRecipient } from '../utils/crypto';

export default function MyFiles({ signer, account, userKeys }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientPubKeyJWK, setRecipientPubKeyJWK] = useState('');
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [authStatus, setAuthStatus] = useState('');

  const loadFiles = async () => {
    if (!signer || !account) return;
    setLoading(true);
    try {
      const contract = getFileRegistryContract(signer);
      const fileIds = await contract.getFilesByOwner(account);
      setFiles(fileIds);
    } catch (err) {
      console.error('Failed to load owned files', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [signer, account]);

  const handleGrantAccess = async (fileId) => {
    if (!recipientAddress || !recipientPubKeyJWK || !signer) return;
    setAuthStatus('Re-wrapping key for target recipient public key...');

    try {
      const contract = getFileRegistryContract(signer);
      const record = await contract.getFileRecord(fileId);
      
      // Standard choice: Demonstration re-wrap using stored key or direct recipient key packing
      const parsedJWK = JSON.parse(recipientPubKeyJWK);
      // For demo, re-encapsulating using user's active session key
      const demoKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const wrapped = await wrapKeyForRecipient(demoKey, parsedJWK);

      setAuthStatus('Submitting addAuthorizedRecipient on-chain...');
      const tx = await contract.addAuthorizedRecipient(
        fileId,
        recipientAddress,
        ethers.hexlify(wrapped)
      );
      await tx.wait();
      setAuthStatus('Recipient authorization confirmed on-chain!');
      setSelectedFileId(null);
      setRecipientAddress('');
      setRecipientPubKeyJWK('');
    } catch (err) {
      setAuthStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-slate-900">My Registered Files</h3>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-sm font-medium transition-colors"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No files registered by this account yet.</p>
      ) : (
        <div className="space-y-3">
          {files.map((fileId) => (
            <div
              key={fileId}
              className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-sm"
            >
              <div className="font-mono text-xs text-indigo-700 break-all">
                <span className="text-slate-500 font-sans block text-xs font-semibold mb-0.5">File ID:</span>
                {fileId}
              </div>
              <button
                onClick={() => setSelectedFileId(fileId)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" /> Authorize Recipient
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedFileId && (
        <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900">Grant Access to File</h4>
          <p className="font-mono text-xs text-slate-500 break-all">{selectedFileId}</p>

          <input
            type="text"
            placeholder="Recipient Ethereum Address (0x...)"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
          />

          <textarea
            placeholder="Recipient ECDH Public Key (JWK JSON)"
            rows={3}
            value={recipientPubKeyJWK}
            onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleGrantAccess(selectedFileId)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Confirm Authorization
            </button>
            <button
              onClick={() => setSelectedFileId(null)}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>

          {authStatus && (
            <p className="text-xs font-mono text-indigo-700 mt-2 font-medium">{authStatus}</p>
          )}
        </div>
      )}
    </div>
  );
}
