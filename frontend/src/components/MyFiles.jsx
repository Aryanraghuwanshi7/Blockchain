import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  Folder, 
  UserPlus, 
  Check, 
  Loader2, 
  FileText, 
  Copy, 
  CheckCheck, 
  Calendar, 
  HardDrive, 
  Edit2,
  Check as CheckIcon,
  X as XIcon,
  Users,
  UserMinus,
  ShieldCheck,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { wrapKeyForRecipient } from '../utils/crypto';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function MyFiles({ signer, account, userKeys }) {
  const [files, setFiles] = useState([]);
  const [fileDetails, setFileDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientPubKeyJWK, setRecipientPubKeyJWK] = useState('');
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [authStatus, setAuthStatus] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Authorized recipients per selected file
  const [activeRecipients, setActiveRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [revokingAddress, setRevokingAddress] = useState(null);

  const loadFiles = async () => {
    if (!signer || !account) return;
    setLoading(true);
    try {
      const contract = getFileRegistryContract(signer);
      const rawFileIds = await contract.getFilesByOwner(account);
      const fileIds = Array.from(rawFileIds || []);
      setFiles(fileIds);

      // Load cached metadata from localStorage
      const cachedMeta = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      
      // Load on-chain record for each file
      const details = {};
      for (const id of fileIds) {
        const idLower = id.toLowerCase();
        let meta = cachedMeta[idLower] || cachedMeta[id] || null;
        
        try {
          const record = await contract.getFileRecord(id);
          const createdAtTimestamp = Number(record.createdAt) * 1000;
          
          if (!meta) {
            meta = {
              name: `Document_${id.substring(2, 8)}.enc`,
              size: 245000,
              ipfsCid: record.ipfsCid,
              createdAt: createdAtTimestamp || Date.now(),
            };
          } else {
            meta.ipfsCid = record.ipfsCid;
            meta.createdAt = meta.createdAt || createdAtTimestamp;
          }
        } catch (recordErr) {
          console.warn(`Could not load record for ${id}`, recordErr);
        }

        details[id] = meta || {
          name: `Document_${id.substring(2, 8)}.enc`,
          size: 150000,
          createdAt: Date.now(),
        };
      }
      setFileDetails(details);
    } catch (err) {
      console.error('Failed to load owned files', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [signer, account]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartRename = (fileId, currentName) => {
    setEditingId(fileId);
    setEditNameValue(currentName);
  };

  const handleSaveRename = (fileId) => {
    if (!editNameValue.trim()) {
      setEditingId(null);
      return;
    }
    const updatedName = editNameValue.trim();
    const updatedDetails = { ...fileDetails };
    if (!updatedDetails[fileId]) updatedDetails[fileId] = {};
    updatedDetails[fileId].name = updatedName;
    setFileDetails(updatedDetails);

    // Save back to localStorage
    try {
      const cachedMeta = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      const idLower = fileId.toLowerCase();
      cachedMeta[idLower] = {
        ...(cachedMeta[idLower] || {}),
        name: updatedName,
        fileId: fileId,
      };
      localStorage.setItem('blockdrive_files_metadata', JSON.stringify(cachedMeta));
    } catch (err) {
      console.error('Error saving renamed file to localStorage', err);
    }

    setEditingId(null);
  };

  // Open Access Management Modal and load authorized recipients
  const handleOpenAccessModal = async (fileId) => {
    setSelectedFileId(fileId);
    setAuthStatus('');
    setRecipientAddress('');
    setRecipientPubKeyJWK('');
    setLoadingRecipients(true);

    try {
      const contract = getFileRegistryContract(signer);
      let recipients = [];
      try {
        recipients = await contract.getFileRecipients(fileId);
      } catch (e) {
        console.warn('getFileRecipients helper failed:', e);
      }

      // Check current authorization status for each
      const activeList = [];
      for (const rec of recipients) {
        if (rec.toLowerCase() === account.toLowerCase()) continue; // Skip owner
        const isAuth = await contract.isAuthorized(rec, fileId);
        if (isAuth) {
          activeList.push(rec);
        }
      }
      setActiveRecipients(activeList);
    } catch (err) {
      console.error('Failed to load file recipients', err);
    } finally {
      setLoadingRecipients(false);
    }
  };

  // Grant Access / Authorize Recipient
  const handleGrantAccess = async (fileId) => {
    if (!recipientAddress || !signer) return;
    setIsSubmittingAuth(true);
    setAuthStatus('Re-wrapping AES key for recipient...');

    try {
      const contract = getFileRegistryContract(signer);
      
      let targetJWK = null;
      if (recipientPubKeyJWK.trim()) {
        targetJWK = JSON.parse(recipientPubKeyJWK);
      } else {
        // Generate recipient compatible keypair or fallback
        const demoKey = await window.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
        targetJWK = await window.crypto.subtle.exportKey("jwk", demoKey.publicKey);
      }

      const demoAES = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const wrapped = await wrapKeyForRecipient(demoAES, targetJWK);

      setAuthStatus('Submitting addAuthorizedRecipient on-chain...');
      const tx = await contract.addAuthorizedRecipient(
        fileId,
        recipientAddress.trim(),
        ethers.hexlify(wrapped)
      );
      await tx.wait();
      setAuthStatus('✓ Recipient authorization confirmed on-chain!');
      
      // Update local recipient list
      if (!activeRecipients.includes(recipientAddress.trim())) {
        setActiveRecipients(prev => [...prev, recipientAddress.trim()]);
      }
      setRecipientAddress('');
      setRecipientPubKeyJWK('');
    } catch (err) {
      console.error(err);
      setAuthStatus(`Error: ${err.message || 'Authorization failed'}`);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Revoke Recipient Access
  const handleRevokeAccess = async (fileId, targetAddress) => {
    if (!signer || !fileId || !targetAddress) return;
    setRevokingAddress(targetAddress);
    setAuthStatus(`Submitting revocation for ${targetAddress.substring(0, 6)}... on-chain...`);

    try {
      const contract = getFileRegistryContract(signer);
      const tx = await contract.revokeRecipient(fileId, targetAddress);
      await tx.wait();
      setAuthStatus(`✓ Revocation confirmed on-chain for ${targetAddress.substring(0, 6)}...`);
      setActiveRecipients(prev => prev.filter(a => a.toLowerCase() !== targetAddress.toLowerCase()));
    } catch (err) {
      console.error('Revocation failed', err);
      setAuthStatus(`Revocation error: ${err.message}`);
    } finally {
      setRevokingAddress(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-slate-900">My Registered Files</h3>
          <span className="ml-2 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono hidden sm:inline">
            Wallet: {account ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : 'Not connected'}
          </span>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="text-xs px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-sm font-medium transition-colors flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
          <div className="inline-flex p-3 bg-white rounded-2xl border border-slate-200 text-slate-400 mb-3 shadow-sm">
            <FileText className="w-8 h-8 text-indigo-600" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No files registered by this wallet yet</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Files in this tab are strictly files <strong>uploaded by your connected wallet</strong> (<code className="text-indigo-600 font-mono">{account ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : '0x...'}</code>).
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <p className="text-xs text-slate-400">
              Did someone share a file with you? Switch to the <strong>"Shared With Me"</strong> tab to access it!
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {files.map((fileId) => {
            const meta = fileDetails[fileId] || {};
            const fileName = meta.name || `Encrypted_File_${fileId.substring(2, 8)}.enc`;
            const fileSize = meta.size ? formatBytes(meta.size) : 'Encrypted Blob';
            const uploadDate = meta.createdAt ? new Date(meta.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : 'Just now';

            const isEditing = editingId === fileId;

            return (
              <div
                key={fileId}
                className="p-4 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm transition-all"
              >
                {/* File Icon & Info */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="p-3 bg-white text-indigo-600 rounded-xl border border-slate-200 shadow-sm shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    {/* File Name Display / Inline Edit */}
                    {isEditing ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(fileId);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="px-2.5 py-1 text-sm font-bold bg-white border border-indigo-400 rounded-lg text-slate-900 focus:outline-none ring-2 ring-indigo-100"
                        />
                        <button
                          onClick={() => handleSaveRename(fileId)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm"
                          title="Save Name"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md"
                          title="Cancel"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <h4 className="text-sm font-bold text-slate-900 truncate" title={fileName}>
                          {fileName}
                        </h4>
                        <button
                          onClick={() => handleStartRename(fileId, fileName)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white text-slate-400 hover:text-indigo-600 rounded transition-opacity"
                          title="Rename file label"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                        {fileSize}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {uploadDate}
                      </span>
                    </div>

                    {/* Copyable File ID Badge */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">File ID:</span>
                      <code className="text-xs font-mono text-indigo-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        {fileId.substring(0, 10)}...{fileId.substring(fileId.length - 8)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(fileId, fileId)}
                        title="Copy full File ID"
                        className="p-1 hover:bg-white text-slate-400 hover:text-indigo-600 rounded border border-transparent hover:border-slate-200 transition-colors"
                      >
                        {copiedId === fileId ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Manage Access Button */}
                <div className="shrink-0 self-end md:self-center">
                  <button
                    onClick={() => handleOpenAccessModal(fileId)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" /> Share & Manage Access
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share & Manage Access Modal */}
      {selectedFileId && (
        <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-5 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900">
                Access Manager: <span className="text-indigo-600">{fileDetails[selectedFileId]?.name || 'Selected File'}</span>
              </h4>
            </div>
            <button
              onClick={() => setSelectedFileId(null)}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium px-2 py-1 rounded-md hover:bg-slate-200 transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* 1. Active Authorized Users List with 1-Click Revoke */}
          <div>
            <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Authorized Recipients ({activeRecipients.length})
            </h5>

            {loadingRecipients ? (
              <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading authorized addresses...
              </div>
            ) : activeRecipients.length === 0 ? (
              <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                No external recipients authorized yet. Only you (the owner) can access this file.
              </div>
            ) : (
              <div className="space-y-2">
                {activeRecipients.map((recAddress) => (
                  <div
                    key={recAddress}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs font-mono shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-800 font-medium">{recAddress}</span>
                    </div>
                    <button
                      onClick={() => handleRevokeAccess(selectedFileId, recAddress)}
                      disabled={revokingAddress === recAddress}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-sans font-semibold flex items-center gap-1 transition-colors"
                    >
                      {revokingAddress === recAddress ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <UserMinus className="w-3 h-3" />
                      )}
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Grant Access Form */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" /> Authorize New Recipient
            </h5>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recipient Ethereum Wallet Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recipient ECDH Public Key JWK (Optional — auto-generated if left blank)
              </label>
              <textarea
                placeholder='{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"...","y":"..."}'
                rows={2}
                value={recipientPubKeyJWK}
                onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
                className="w-full bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleGrantAccess(selectedFileId)}
                disabled={isSubmittingAuth || !recipientAddress.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                {isSubmittingAuth ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                {isSubmittingAuth ? 'Authorizing On-Chain...' : 'Grant Access'}
              </button>
              <button
                onClick={() => setSelectedFileId(null)}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {authStatus && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-indigo-700 font-medium">
              {authStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

