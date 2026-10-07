import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getFileRegistryContract } from '../utils/contracts';
import { downloadFromIPFS } from '../utils/ipfs';
import { unwrapKeyForRecipient, decryptFile, importRawKey } from '../utils/crypto';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SharedFiles({ signer, account, userKeys }) {
  const [sharedFileIds, setSharedFileIds] = useState([]);
  const [fileMetadataMap, setFileMetadataMap] = useState({});
  const [searchOwnerAddress, setSearchOwnerAddress] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [decryptingFileId, setDecryptingFileId] = useState(null);
  const [decryptStatus, setDecryptStatus] = useState({});
  const [downloadUrls, setDownloadUrls] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadSharedFiles = async () => {
    if (!signer || !account) return;
    setLoading(true);
    try {
      const contract = getFileRegistryContract(signer);
      let fileIds = [];
      try {
        const rawIds = await contract.getFilesSharedWithUser(account);
        fileIds = Array.from(rawIds || []);
      } catch (err) {
        console.warn('getFilesSharedWithUser warning:', err);
      }

      setSharedFileIds(fileIds);

      const cached = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      const details = {};

      for (const id of fileIds) {
        const idLower = id.toLowerCase();
        let meta = cached[idLower] || cached[id] || null;
        try {
          const record = await contract.getFileRecord(id);
          const createdAt = Number(record.createdAt) * 1000;
          if (!meta) {
            meta = {
              name: `Shared_File_${id.substring(2, 8)}.enc`,
              size: 250000,
              ipfsCid: record.ipfsCid,
              owner: record.ownerAddress,
              createdAt: createdAt || Date.now(),
            };
          } else {
            meta.owner = record.ownerAddress;
            meta.ipfsCid = record.ipfsCid;
          }
        } catch (e) {
          console.warn(`Could not fetch details for shared file ${id}`, e);
        }
        details[id] = meta || {
          name: `Shared_File_${id.substring(2, 8)}.enc`,
          size: 150000,
          owner: 'Unknown',
          createdAt: Date.now(),
        };
      }
      setFileMetadataMap(details);
    } catch (err) {
      console.error('Failed to load shared files', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSharedFiles();
  }, [signer, account]);

  const handleSearchByOwner = async (e) => {
    if (e) e.preventDefault();
    if (!searchOwnerAddress.trim() || !signer || !account) return;

    setIsSearching(true);
    setSearchResults(null);

    try {
      const contract = getFileRegistryContract(signer);
      const targetOwner = searchOwnerAddress.trim();
      const accessibleIds = await contract.getAccessibleFilesFromOwner(targetOwner, account);
      const cached = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      const results = [];

      for (const id of accessibleIds) {
        const idLower = id.toLowerCase();
        let meta = cached[idLower] || cached[id] || null;
        try {
          const record = await contract.getFileRecord(id);
          if (!meta) {
            meta = {
              fileId: id,
              name: `Shared_Document_${id.substring(2, 8)}.enc`,
              size: 240000,
              ipfsCid: record.ipfsCid,
              owner: record.ownerAddress,
              createdAt: Number(record.createdAt) * 1000,
            };
          } else {
            meta.fileId = id;
            meta.owner = record.ownerAddress;
            meta.ipfsCid = record.ipfsCid;
          }
        } catch (e) {
          console.warn(e);
        }
        results.push(meta || {
          fileId: id,
          name: `Document_${id.substring(2, 8)}.enc`,
          size: 150000,
          owner: targetOwner,
          createdAt: Date.now(),
        });
      }

      setSearchResults(results);
    } catch (err) {
      console.error('Error searching files by owner:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDecryptFile = async (fileId) => {
    if (!signer) return;
    setDecryptingFileId(fileId);
    setDecryptStatus(prev => ({ ...prev, [fileId]: 'Verifying on-chain authorization...' }));

    try {
      const contract = getFileRegistryContract(signer);
      const isAuth = await contract.isAuthorized(account, fileId);
      if (!isAuth) {
        throw new Error("Access denied: You are not on the authorized recipient list.");
      }

      const record = await contract.getFileRecord(fileId);
      const ipfsCid = record.ipfsCid;
      const callerWrappedKeyHex = record.callerWrappedKey;

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Retrieving encrypted binary from IPFS...' }));
      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Unwrapping AES-256 key with your ECDH private key...' }));
      let aesKey = null;

      if (callerWrappedKeyHex && callerWrappedKeyHex !== '0x') {
        try {
          const wrappedKeyBytes = ethers.getBytes(callerWrappedKeyHex);
          if (userKeys?.privateKeyJWK) {
            aesKey = await unwrapKeyForRecipient(wrappedKeyBytes, userKeys.privateKeyJWK);
          }
        } catch (unwrapErr) {
          console.warn('ECDH private key unwrap attempt failed, trying keystore fallback:', unwrapErr);
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
        throw new Error("Unable to decrypt: Recipient decryption key not available in active session.");
      }

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Decrypting file client-side (AES-256-GCM)...' }));
      const iv = new Uint8Array(encryptedPayload.slice(0, 12));
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, iv, aesKey);
      
      const cached = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      const meta = cached[fileId.toLowerCase()] || fileMetadataMap[fileId] || {};
      const blob = new Blob([decryptedBuffer], { type: meta.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      setDownloadUrls(prev => ({ ...prev, [fileId]: url }));
      setDecryptStatus(prev => ({ ...prev, [fileId]: '✓ Decrypted successfully. Ready to download.' }));
    } catch (err) {
      console.error('Decryption failed for file', fileId, err);
      setDecryptStatus(prev => ({ ...prev, [fileId]: `Error: ${err.message || 'Access denied'}` }));
    } finally {
      setDecryptingFileId(null);
    }
  };

  const renderFileCard = (fileId, meta) => {
    const fileName = meta.name || `Shared_Document_${fileId.substring(2, 8)}.enc`;
    const fileSize = meta.size ? formatBytes(meta.size) : 'Encrypted Blob';
    const owner = meta.owner || 'Unknown';
    const uploadDate = meta.createdAt ? new Date(meta.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) : 'Shared recently';

    const statusMsg = decryptStatus[fileId];
    const dlUrl = downloadUrls[fileId];
    const isDecrypting = decryptingFileId === fileId;

    return (
      <div
        key={fileId}
        className="p-4 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 rounded-lg space-y-3 text-black"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-black truncate" title={fileName}>
                {fileName}
              </h4>
              <span className="px-1.5 py-0.5 bg-gray-100 text-black border border-gray-200 text-[10px] font-medium rounded">
                Authorized
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-black mt-1">
              <span className="font-medium text-black">
                {fileSize}
              </span>
              <span>•</span>
              <span>
                {uploadDate}
              </span>
              <span>•</span>
              <span className="text-black">
                Owner: <code className="font-mono text-black text-[11px] bg-white border border-gray-200 px-1.5 py-0.5 rounded select-all">{owner.substring(0, 6)}...{owner.substring(owner.length - 4)}</code>
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

          {/* Action Buttons */}
          <div className="shrink-0 flex items-center gap-2 self-end md:self-center">
            {dlUrl ? (
              <a
                href={dlUrl}
                download={fileName}
                className="px-3.5 py-1.5 bg-black hover:bg-gray-900 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                Save File
              </a>
            ) : (
              <button
                onClick={() => handleDecryptFile(fileId)}
                disabled={isDecrypting}
                className="px-3.5 py-1.5 bg-black hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                <span>{isDecrypting ? 'Decrypting...' : 'Decrypt & Download'}</span>
              </button>
            )}
          </div>
        </div>

        {statusMsg && (
          <div className="text-xs font-mono text-black bg-white p-2.5 rounded-md border border-gray-200">
            {statusMsg}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 text-black">
      {/* 1. Explore Files by Owner Address */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black">
        <div className="border-b border-gray-100 pb-3 mb-3.5">
          <h3 className="text-sm font-semibold text-black">Query Accessible Documents by Owner</h3>
          <p className="text-xs text-black mt-0.5 font-normal">
            Query the smart contract for files authorized to your wallet by a specific healthcare data owner.
          </p>
        </div>

        <form onSubmit={handleSearchByOwner} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Owner wallet address (0x...)"
            value={searchOwnerAddress}
            onChange={(e) => setSearchOwnerAddress(e.target.value)}
            className="flex-1 bg-white border border-gray-300 focus:border-black rounded-md px-3 py-2 text-xs font-mono text-black outline-none"
          />
          <button
            type="submit"
            disabled={isSearching || !searchOwnerAddress.trim() || !signer}
            className="px-3.5 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-200 disabled:text-black text-white rounded-md text-xs font-medium cursor-pointer"
          >
            <span>{isSearching ? 'Querying...' : 'Search Files'}</span>
          </button>
        </form>

        {searchResults !== null && (
          <div className="mt-4 pt-3.5 border-t border-gray-100">
            <h4 className="text-xs font-medium text-black uppercase tracking-wider mb-2.5">
              Accessible Records ({searchResults.length}):
            </h4>
            {searchResults.length === 0 ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-black font-normal">
                <span>No accessible documents registered under this address for your wallet.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {searchResults.map((meta) => renderFileCard(meta.fileId, meta))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Files Shared With Connected Wallet */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3.5">
          <div>
            <h3 className="text-sm font-semibold text-black">Incoming Shared Documents</h3>
            <p className="text-xs text-black mt-0.5 font-normal">
              Documents that doctors or hospital staff have authorized your wallet to decrypt.
            </p>
          </div>
          <button
            onClick={loadSharedFiles}
            disabled={loading}
            className="text-xs px-2.5 py-1.5 bg-white hover:bg-gray-50 text-black rounded-md border border-gray-200 font-medium cursor-pointer"
          >
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {sharedFileIds.length === 0 ? (
          <div className="py-8 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200 p-5">
            <h4 className="text-sm font-semibold text-black">No Incoming Shared Files</h4>
            <p className="text-xs text-black mt-1 max-w-sm mx-auto font-normal">
              When a practitioner grants your address access to their encrypted document, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sharedFileIds.map((fileId) => {
              const meta = fileMetadataMap[fileId] || {};
              return renderFileCard(fileId, meta);
            })}
          </div>
        )}
      </div>
    </div>
  );
}

