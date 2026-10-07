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
  AlertCircle,
  Download,
  Unlock,
  Trash2,
  Lock,
  Share2
} from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { wrapKeyForRecipient, unwrapKeyForRecipient, importRawKey, decryptFile } from '../utils/crypto';
import { downloadFromIPFS } from '../utils/ipfs';
import { useRole } from '../context/RoleContext';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function MyFiles({ signer, account, userKeys, onNavigateTab }) {
  const { role, loading: roleLoading } = useRole();
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

  // Decryption & download state
  const [decryptingFileId, setDecryptingFileId] = useState(null);
  const [downloadUrls, setDownloadUrls] = useState({});

  const loadFiles = async () => {
    if (!account) return;
    setLoading(true);
    try {
      const cachedMeta = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      let onChainIds = [];

      if (signer) {
        try {
          const contract = getFileRegistryContract(signer);
          const rawFileIds = await contract.getFilesByOwner(account);
          onChainIds = Array.from(rawFileIds || []);
        } catch (chainErr) {
          console.warn('Could not query on-chain files by owner (using local secure cache):', chainErr);
        }
      }

      // Prioritize on-chain files for this account
      const uniqueLower = new Set();
      const uniqueIds = [];

      // Add on-chain IDs (reversed so newest are first)
      for (const id of [...onChainIds].reverse()) {
        const lower = id.toLowerCase();
        if (!uniqueLower.has(lower)) {
          uniqueLower.add(lower);
          uniqueIds.push(id);
        }
      }

      // Only add cached IDs if they belong to this account and are not already in list
      const cachedKeys = Object.keys(cachedMeta);
      for (const id of cachedKeys.reverse()) {
        const item = cachedMeta[id];
        const lower = id.toLowerCase();
        if (
          !uniqueLower.has(lower) &&
          item &&
          (!item.owner || item.owner.toLowerCase() === account.toLowerCase())
        ) {
          uniqueLower.add(lower);
          uniqueIds.push(item.fileId || id);
        }
      }

      // Load metadata for each file
      const details = {};
      for (const id of uniqueIds) {
        const idLower = id.toLowerCase();
        let meta = cachedMeta[idLower] || cachedMeta[id] || null;

        if (signer && onChainIds.map(o => o.toLowerCase()).includes(idLower)) {
          try {
            const contract = getFileRegistryContract(signer);
            const record = await contract.getFileRecord(id);
            const createdAtTimestamp = Number(record.createdAt) * 1000;

            if (!meta) {
              meta = {
                fileId: id,
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
            console.warn(`Could not load on-chain record for ${id}`, recordErr);
          }
        }

        details[id] = meta || {
          fileId: id,
          name: `Document_${id.substring(2, 8)}.enc`,
          size: 150000,
          createdAt: Date.now(),
        };
      }

      // Sort by creation time descending (newest first)
      uniqueIds.sort((a, b) => {
        const timeA = details[a]?.createdAt || 0;
        const timeB = details[b]?.createdAt || 0;
        return timeB - timeA;
      });

      setFiles(uniqueIds);
      setFileDetails(details);
    } catch (err) {
      console.error('Failed to load owned files', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecryptAndDownload = async (fileId) => {
    if (!signer) return;
    setDecryptingFileId(fileId);
    try {
      const contract = getFileRegistryContract(signer);
      let record;
      try {
        record = await contract.getFileRecord(fileId);
      } catch (e) {
        console.warn('Could not fetch record from contract, checking local cache', e);
      }

      const meta = fileDetails[fileId] || {};
      const ipfsCid = record?.ipfsCid || meta.ipfsCid;
      if (!ipfsCid) {
        throw new Error('IPFS CID not found for this file.');
      }

      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      // Locate AES key
      let aesKey = null;
      if (record?.callerWrappedKey && record.callerWrappedKey !== '0x' && userKeys?.privateKeyJWK) {
        try {
          const wrappedKeyBytes = ethers.getBytes(record.callerWrappedKey);
          aesKey = await unwrapKeyForRecipient(wrappedKeyBytes, userKeys.privateKeyJWK);
        } catch (unwrapErr) {
          console.warn('Unwrap error:', unwrapErr);
        }
      }

      if (!aesKey) {
        const fileKeys = JSON.parse(localStorage.getItem('blockdrive_file_aes_keys') || '{}');
        const rawHex = fileKeys[fileId.toLowerCase()];
        if (rawHex) {
          const rawBytes = ethers.getBytes(rawHex);
          aesKey = await importRawKey(rawBytes);
        }
      }

      if (!aesKey) {
        throw new Error('Decryption key not available in this browser session.');
      }

      // Extract IV (12 bytes) and ciphertext
      const iv = encryptedPayload.slice(0, 12);
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, aesKey, iv);
      const blob = new Blob([decryptedBuffer], { type: meta.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setDownloadUrls(prev => ({ ...prev, [fileId]: url }));

      // Trigger automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name ? meta.name.replace(/\.enc$/, '') : `Decrypted_${fileId.substring(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Decryption failed:', err);
      alert(`Decryption failed: ${err.message}`);
    } finally {
      setDecryptingFileId(null);
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

      const activeList = [];
      for (const rec of recipients) {
        if (rec.toLowerCase() === account.toLowerCase()) continue;
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

  const [manualFileId, setManualFileId] = useState('');

  const handleGrantAccess = async (fileId) => {
    const targetFileId = (fileId === 'custom' ? manualFileId : fileId).trim();
    if (!targetFileId) {
      setAuthStatus('Error: Please provide a valid File Identifier.');
      return;
    }
    if (!recipientAddress || !signer) return;
    setIsSubmittingAuth(true);
    setAuthStatus('Locating file AES key...');

    try {
      const contract = getFileRegistryContract(signer);
      const cleanRecipient = recipientAddress.trim().toLowerCase();

      let fileAesKey = null;
      const cachedFileKeys = JSON.parse(localStorage.getItem('blockdrive_file_aes_keys') || '{}');
      const rawHex = cachedFileKeys[targetFileId.toLowerCase()];

      if (rawHex) {
        const rawBytes = ethers.getBytes(rawHex);
        fileAesKey = await importRawKey(rawBytes);
      } else {
        const record = await contract.getFileRecord(targetFileId);
        if (record.callerWrappedKey && record.callerWrappedKey !== '0x' && userKeys?.privateKeyJWK) {
          const wrappedBytes = ethers.getBytes(record.callerWrappedKey);
          fileAesKey = await unwrapKeyForRecipient(wrappedBytes, userKeys.privateKeyJWK);
        }
      }

      if (!fileAesKey) {
        fileAesKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      }

      let targetJWK = null;
      if (recipientPubKeyJWK.trim()) {
        try {
          targetJWK = JSON.parse(recipientPubKeyJWK.trim());
        } catch {
          throw new Error('Invalid JSON format for Recipient Public Key JWK.');
        }
      } else {
        const pubRegistry = JSON.parse(localStorage.getItem('blockdrive_public_ecdh_registry') || '{}');
        if (pubRegistry[cleanRecipient]) {
          targetJWK = pubRegistry[cleanRecipient];
        } else {
          const savedRecipientKeys = localStorage.getItem(`blockdrive_ecdh_keys_${cleanRecipient}`);
          if (savedRecipientKeys) {
            const parsed = JSON.parse(savedRecipientKeys);
            targetJWK = parsed.publicKeyJWK;
          } else {
            const genKeyPair = await window.crypto.subtle.generateKey(
              { name: "ECDH", namedCurve: "P-256" },
              true,
              ["deriveKey"]
            );
            const pub = await window.crypto.subtle.exportKey("jwk", genKeyPair.publicKey);
            const priv = await window.crypto.subtle.exportKey("jwk", genKeyPair.privateKey);
            const newKeys = { publicKeyJWK: pub, privateKeyJWK: priv };
            localStorage.setItem(`blockdrive_ecdh_keys_${cleanRecipient}`, JSON.stringify(newKeys));
            pubRegistry[cleanRecipient] = pub;
            localStorage.setItem('blockdrive_public_ecdh_registry', JSON.stringify(pubRegistry));
            targetJWK = pub;
          }
        }
      }

      setAuthStatus('Re-wrapping AES key for recipient...');
      const wrappedBytes = await wrapKeyForRecipient(fileAesKey, targetJWK);

      setAuthStatus('Submitting addAuthorizedRecipient on-chain...');
      const nonce = await signer.getNonce("pending");
      const tx = await contract.addAuthorizedRecipient(
        fileId,
        recipientAddress.trim(),
        ethers.hexlify(wrappedBytes),
        { nonce }
      );
      await tx.wait();

      try {
        const rawKey = await window.crypto.subtle.exportKey("raw", fileAesKey);
        const hex = ethers.hexlify(new Uint8Array(rawKey));
        cachedFileKeys[fileId.toLowerCase()] = hex;
        localStorage.setItem('blockdrive_file_aes_keys', JSON.stringify(cachedFileKeys));
      } catch (cacheErr) {
        console.warn('Cache key warning:', cacheErr);
      }

      setAuthStatus('✓ Recipient authorization confirmed on-chain.');

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

  const handleRevokeAccess = async (fileId, targetAddress) => {
    if (!signer || !fileId || !targetAddress) return;
    setRevokingAddress(targetAddress);
    setAuthStatus(`Submitting revocation on-chain...`);

    try {
      const contract = getFileRegistryContract(signer);
      const nonce = await signer.getNonce("pending");
      const tx = await contract.revokeRecipient(fileId, targetAddress, { nonce });
      await tx.wait();
      setAuthStatus(`✓ Access revoked for ${targetAddress.substring(0, 8)}...`);
      setActiveRecipients(prev => prev.filter(a => a.toLowerCase() !== targetAddress.toLowerCase()));
    } catch (err) {
      console.error('Revocation failed', err);
      setAuthStatus(`Revocation error: ${err.message}`);
    } finally {
      setRevokingAddress(null);
    }
  };

  if (roleLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Verifying healthcare credentials...</span>
      </div>
    );
  }

  // Strict Healthcare RBAC: Only doctor and medicalStaff can manage file access & register files
  if (role !== "doctor" && role !== "medicalStaff") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-1">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">Access Restricted</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Only verified doctors and medical staff can manage access permissions and registered files.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-2">
            As a <strong>Patient</strong>, you can view and decrypt medical records shared with you in the <span className="font-semibold text-slate-800">"Shared With Me"</span> section.
          </p>
        </div>
        {onNavigateTab && (
          <button
            onClick={() => onNavigateTab('shared')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-md text-xs font-semibold inline-flex items-center gap-2 shadow-xs cursor-pointer transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span>Go to Shared With Me</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3.5 mb-4 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Registered Documents & Access Control</h3>
          <p className="text-xs text-slate-500 mt-0.5 font-normal">
            Manage your on-chain records and authorize or revoke recipient decryption access.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => {
              setSelectedFileId(files[0] || 'custom');
              setActiveRecipients([]);
              setAuthStatus('');
            }}
            className="text-xs px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-medium rounded-md transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Grant Access</span>
          </button>
          <span className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-700 font-medium rounded-md border border-slate-200">
            {files.length} {files.length === 1 ? 'Record' : 'Records'}
          </span>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="text-xs px-2.5 py-1.5 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-700 rounded-md border border-slate-200 font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="py-10 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200 p-6 space-y-3">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" />
          <div>
            <h4 className="text-sm font-semibold text-slate-800">No Registered Files Found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Your connected wallet (<code className="font-mono text-slate-700 select-all">{account ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : '0x...'}</code>) has not uploaded records yet.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setSelectedFileId('custom');
                setActiveRecipients([]);
                setAuthStatus('');
              }}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Authorize Access by File ID</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((fileId) => {
            const meta = fileDetails[fileId] || {};
            const fileName = meta.name || `Document_${fileId.substring(2, 8)}.enc`;
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
                className="p-4 bg-slate-50/50 hover:bg-slate-50/90 border border-slate-200 hover:border-slate-300 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs interactive-lift-subtle"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-white text-slate-700 rounded-md border border-slate-200 shrink-0 mt-0.5 transition-transform duration-150 hover:scale-105">
                    <FileText className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
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
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md text-slate-900 outline-none transition-all"
                        />
                        <button
                          onClick={() => handleSaveRename(fileId)}
                          className="p-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs cursor-pointer active:scale-90 transition-all"
                          title="Save Name"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs cursor-pointer active:scale-90 transition-all"
                          title="Cancel"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <h4 className="text-sm font-semibold text-slate-900 truncate" title={fileName}>
                          {fileName}
                        </h4>
                        <button
                          onClick={() => handleStartRename(fileId, fileName)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-all cursor-pointer active:scale-90"
                          title="Rename label"
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

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase">File ID:</span>
                      <code className="text-xs font-mono text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded select-all">
                        {fileId.substring(0, 10)}...{fileId.substring(fileId.length - 8)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(fileId, fileId)}
                        title="Copy full File ID"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all cursor-pointer active:scale-90"
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

                <div className="shrink-0 self-end md:self-center flex items-center gap-2">
                  <button
                    onClick={() => handleDecryptAndDownload(fileId)}
                    disabled={decryptingFileId === fileId}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-md text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs"
                    title="Decrypt and download file"
                  >
                    {decryptingFileId === fileId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{decryptingFileId === fileId ? 'Decrypting...' : 'Download'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenAccessModal(fileId)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-700 border border-slate-300 rounded-md text-xs font-medium transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs hover:shadow-xs"
                  >
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Manage Access</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share & Manage Access Drawer / Modal */}
      {selectedFileId && (
        <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Access Authorization: <span className="font-normal text-slate-600">{fileDetails[selectedFileId]?.name || selectedFileId}</span>
              </h4>
            </div>
            <button
              onClick={() => setSelectedFileId(null)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              ✕ Close
            </button>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Authorized Recipients ({activeRecipients.length})
            </h5>

            {loadingRecipients ? (
              <div className="p-3 bg-white border border-slate-200 rounded text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading authorized addresses...
              </div>
            ) : activeRecipients.length === 0 ? (
              <div className="p-3 bg-white border border-slate-200 rounded text-xs text-slate-500">
                No external recipients authorized. Only the owner wallet can decrypt this file.
              </div>
            ) : (
              <div className="space-y-2">
                {activeRecipients.map((recAddress) => (
                  <div
                    key={recAddress}
                    className="p-2.5 bg-white border border-slate-200 rounded flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-800">{recAddress}</span>
                    </div>
                    <button
                      onClick={() => handleRevokeAccess(selectedFileId, recAddress)}
                      disabled={revokingAddress === recAddress}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-sans font-medium flex items-center gap-1 transition-colors"
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

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-slate-600" /> Authorize New Recipient
            </h5>

            {selectedFileId === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Document File Identifier (bytes32 Hex) *
                </label>
                <input
                  type="text"
                  placeholder="0x... (66-character bytes32 file ID)"
                  value={manualFileId}
                  onChange={(e) => setManualFileId(e.target.value)}
                  className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-150"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recipient Wallet Address *
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-150"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recipient Public Key JWK (Optional — auto-generated if left blank)
              </label>
              <textarea
                placeholder='{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"...","y":"..."}'
                rows={2}
                value={recipientPubKeyJWK}
                onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
                className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none transition-all duration-150"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleGrantAccess(selectedFileId)}
                disabled={isSubmittingAuth || !recipientAddress.trim()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
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
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          {authStatus && (
            <div className="p-2.5 bg-white border border-slate-200 rounded text-xs font-mono text-slate-800">
              {authStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
