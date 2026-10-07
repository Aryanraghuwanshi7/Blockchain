import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
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
      <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center text-black">
        <span className="text-sm text-black">Verifying healthcare credentials...</span>
      </div>
    );
  }

  // Strict Healthcare RBAC: Only doctor and medicalStaff can manage file access & register files
  if (role !== "doctor" && role !== "medicalStaff") {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center space-y-4 text-black">
        <div>
          <h3 className="text-base font-semibold text-black mb-1">Access Restricted</h3>
          <p className="text-sm text-black max-w-md mx-auto">
            Only verified doctors and medical staff can manage access permissions and registered files.
          </p>
          <p className="text-xs text-black max-w-md mx-auto mt-2">
            As a <strong>Patient</strong>, you can view and decrypt medical records shared with you in the <span className="font-semibold text-black">"Shared With Me"</span> section.
          </p>
        </div>
        {onNavigateTab && (
          <button
            onClick={() => onNavigateTab('shared')}
            className="px-4 py-2 bg-black hover:bg-gray-900 text-white rounded-md text-xs font-semibold inline-flex items-center cursor-pointer"
          >
            <span>Go to Shared With Me</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3.5 mb-4 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-black">Registered Documents & Access Control</h3>
          <p className="text-xs text-black mt-0.5 font-normal">
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
            className="text-xs px-3 py-1.5 bg-black hover:bg-gray-900 text-white font-medium rounded-md cursor-pointer"
          >
            <span>Grant Access</span>
          </button>
          <span className="text-xs px-2.5 py-1.5 bg-gray-100 text-black font-medium rounded-md border border-gray-200">
            {files.length} {files.length === 1 ? 'Record' : 'Records'}
          </span>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="text-xs px-2.5 py-1.5 bg-white hover:bg-gray-50 text-black rounded-md border border-gray-200 font-medium cursor-pointer"
          >
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="py-10 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200 p-6 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-black">No Registered Files Found</h4>
            <p className="text-xs text-black mt-1 max-w-sm mx-auto">
              Your connected wallet (<code className="font-mono text-black select-all">{account ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}` : '0x...'}</code>) has not uploaded records yet.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setSelectedFileId('custom');
                setActiveRecipients([]);
                setAuthStatus('');
              }}
              className="px-3.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-black rounded-md text-xs font-medium cursor-pointer"
            >
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
                className="p-4 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-black"
              >
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
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-400 focus:border-black rounded-md text-black outline-none"
                      />
                      <button
                        onClick={() => handleSaveRename(fileId)}
                        className="px-2 py-1 bg-black text-white rounded text-xs cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 bg-gray-200 text-black rounded text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <h4 className="text-sm font-semibold text-black truncate" title={fileName}>
                        {fileName}
                      </h4>
                      <button
                        onClick={() => handleStartRename(fileId, fileName)}
                        className="text-xs text-black underline cursor-pointer"
                      >
                        [Rename]
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-black mt-1">
                    <span className="font-medium text-black">
                      {fileSize}
                    </span>
                    <span>•</span>
                    <span>
                      {uploadDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] font-semibold text-black uppercase">File ID:</span>
                    <code className="text-xs font-mono text-black bg-white border border-gray-200 px-1.5 py-0.5 rounded select-all">
                      {fileId.substring(0, 10)}...{fileId.substring(fileId.length - 8)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(fileId, fileId)}
                      title="Copy full File ID"
                      className="text-xs text-black underline px-1 cursor-pointer"
                    >
                      {copiedId === fileId ? '[Copied]' : '[Copy]'}
                    </button>
                  </div>
                </div>

                <div className="shrink-0 self-end md:self-center flex items-center gap-2">
                  <button
                    onClick={() => handleDecryptAndDownload(fileId)}
                    disabled={decryptingFileId === fileId}
                    className="px-3 py-1.5 bg-black hover:bg-gray-900 text-white rounded-md text-xs font-medium cursor-pointer"
                    title="Decrypt and download file"
                  >
                    <span>{decryptingFileId === fileId ? 'Decrypting...' : 'Download'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenAccessModal(fileId)}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-black border border-gray-300 rounded-md text-xs font-medium cursor-pointer"
                  >
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
        <div className="mt-6 p-5 bg-gray-50 border border-gray-200 rounded-lg space-y-4 text-black">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div>
              <h4 className="text-sm font-semibold text-black">
                Access Authorization: <span className="font-normal text-black">{fileDetails[selectedFileId]?.name || selectedFileId}</span>
              </h4>
            </div>
            <button
              onClick={() => setSelectedFileId(null)}
              className="text-xs text-black font-medium hover:underline cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-black uppercase tracking-wide mb-2">
              Authorized Recipients ({activeRecipients.length})
            </h5>

            {loadingRecipients ? (
              <div className="p-3 bg-white border border-gray-200 rounded text-xs text-black">
                Loading authorized addresses...
              </div>
            ) : activeRecipients.length === 0 ? (
              <div className="p-3 bg-white border border-gray-200 rounded text-xs text-black">
                No external recipients authorized. Only the owner wallet can decrypt this file.
              </div>
            ) : (
              <div className="space-y-2">
                {activeRecipients.map((recAddress) => (
                  <div
                    key={recAddress}
                    className="p-2.5 bg-white border border-gray-200 rounded flex items-center justify-between text-xs font-mono text-black"
                  >
                    <span className="text-black">{recAddress}</span>
                    <button
                      onClick={() => handleRevokeAccess(selectedFileId, recAddress)}
                      disabled={revokingAddress === recAddress}
                      className="px-2.5 py-1 bg-white hover:bg-gray-100 text-black border border-gray-300 rounded text-xs font-sans font-medium cursor-pointer"
                    >
                      {revokingAddress === recAddress ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-3">
            <h5 className="text-xs font-semibold text-black uppercase tracking-wide">
              Authorize New Recipient
            </h5>

            {selectedFileId === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-black mb-1">
                  Document File Identifier (bytes32 Hex) *
                </label>
                <input
                  type="text"
                  placeholder="0x... (66-character bytes32 file ID)"
                  value={manualFileId}
                  onChange={(e) => setManualFileId(e.target.value)}
                  className="w-full bg-white border border-gray-300 focus:border-black rounded-md px-3 py-2 text-xs font-mono text-black outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Recipient Wallet Address *
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded-md px-3 py-2 text-xs font-mono text-black outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Recipient Public Key JWK (Optional — auto-generated if left blank)
              </label>
              <textarea
                placeholder='{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"...","y":"..."}'
                rows={2}
                value={recipientPubKeyJWK}
                onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded-md px-3 py-2 text-xs font-mono text-black outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleGrantAccess(selectedFileId)}
                disabled={isSubmittingAuth || !recipientAddress.trim()}
                className="px-4 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-300 text-white rounded text-xs font-medium cursor-pointer"
              >
                {isSubmittingAuth ? 'Authorizing On-Chain...' : 'Grant Access'}
              </button>
              <button
                onClick={() => setSelectedFileId(null)}
                className="px-3 py-2 bg-white hover:bg-gray-100 text-black border border-gray-300 rounded text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>

          {authStatus && (
            <div className="p-2.5 bg-white border border-gray-200 rounded text-xs font-mono text-black">
              {authStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

