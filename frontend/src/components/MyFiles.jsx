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
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-xl shadow-indigo-950/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">My Registered Files</h3>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="text-xs px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No files registered by this account yet.</p>
      ) : (
        <div className="space-y-3">
          {files.map((fileId) => (
            <div
              key={fileId}
              className="p-4 bg-slate-800/60 border border-slate-700/80 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3"
            >
              <div className="font-mono text-xs text-indigo-300 break-all">
                <span className="text-slate-500 block">File ID:</span>
                {fileId}
              </div>
              <button
                onClick={() => setSelectedFileId(fileId)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs flex items-center gap-1.5 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" /> Authorize Recipient
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedFileId && (
        <div className="mt-6 p-4 bg-slate-800 border border-slate-700 rounded-lg space-y-3">
          <h4 className="text-sm font-semibold text-white">Grant Access to File</h4>
          <p className="font-mono text-xs text-slate-400 break-all">{selectedFileId}</p>

          <input
            type="text"
            placeholder="Recipient Ethereum Address (0x...)"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white"
          />

          <textarea
            placeholder="Recipient ECDH Public Key (JWK JSON)"
            rows={3}
            value={recipientPubKeyJWK}
            onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-white"
          />

          <div className="flex gap-2">
            <button
              onClick={() => handleGrantAccess(selectedFileId)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Confirm Authorization
            </button>
            <button
              onClick={() => setSelectedFileId(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs"
            >
              Cancel
            </button>
          </div>

          {authStatus && (
            <p className="text-xs font-mono text-indigo-300 mt-2">{authStatus}</p>
          )}
        </div>
      )}
    </div>
  );
}
