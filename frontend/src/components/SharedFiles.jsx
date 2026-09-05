import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  Users, 
  Search, 
  Download, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileText, 
  HardDrive, 
  Calendar, 
  ExternalLink,
  ShieldCheck,
  Copy,
  CheckCheck
} from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { downloadFromIPFS } from '../utils/ipfs';
import { unwrapKeyForRecipient, decryptFile } from '../utils/crypto';

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

  // Load all files shared directly with the connected wallet
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
        console.warn('getFilesSharedWithUser not supported yet on contract', err);
      }

      setSharedFileIds(fileIds);

      // Load cached metadata
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

  // Search files made accessible to caller by a specific owner address (Dgdrive 3.0 style)
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

  // 1-Click Decrypt & Download
  const handleDecryptFile = async (fileId) => {
    if (!signer || !userKeys) return;
    setDecryptingFileId(fileId);
    setDecryptStatus(prev => ({ ...prev, [fileId]: 'Querying on-chain permissions & key...' }));

    try {
      const contract = getFileRegistryContract(signer);
      const record = await contract.getFileRecord(fileId);

      const ipfsCid = record.ipfsCid;
      const callerWrappedKeyHex = record.callerWrappedKey;

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Downloading encrypted ciphertext from IPFS...' }));
      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Unwrapping AES-256 key with your ECDH private key...' }));
      const wrappedKeyBytes = new Uint8Array(
        callerWrappedKeyHex.replace('0x', '').match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
      );

      const aesKey = await unwrapKeyForRecipient(wrappedKeyBytes, userKeys.privateKeyJWK);

      setDecryptStatus(prev => ({ ...prev, [fileId]: 'Decrypting file client-side (AES-256-GCM)...' }));
      const iv = new Uint8Array(encryptedPayload.slice(0, 12));
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, iv, aesKey);
      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);

      setDownloadUrls(prev => ({ ...prev, [fileId]: url }));
      setDecryptStatus(prev => ({ ...prev, [fileId]: '✓ Decrypted successfully!' }));
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
        className="p-5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-sm transition-all space-y-3"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="p-3 bg-white text-indigo-600 rounded-xl border border-slate-200 shadow-sm shrink-0">
              <FileText className="w-5 h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 truncate" title={fileName}>
                  {fileName}
                </h4>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Authorized
                </span>
              </div>

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
                <span>•</span>
                <span className="text-slate-600">
                  Owner: <code className="text-indigo-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[11px]">{owner.substring(0, 6)}...{owner.substring(owner.length - 4)}</code>
                </span>
              </div>

              {/* File ID Badge */}
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

          {/* Action Buttons */}
          <div className="shrink-0 flex items-center gap-2 self-end md:self-center">
            {dlUrl ? (
              <a
                href={dlUrl}
                download={fileName}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Save File
              </a>
            ) : (
              <button
                onClick={() => handleDecryptFile(fileId)}
                disabled={isDecrypting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
              >
                {isDecrypting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
                {isDecrypting ? 'Decrypting...' : 'Decrypt & Download'}
              </button>
            )}
          </div>
        </div>

        {/* Real-time Status Message */}
        {statusMsg && (
          <div className="text-xs font-mono text-indigo-700 bg-white p-2.5 rounded-xl border border-slate-200">
            {statusMsg}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Explore / Search Files by Owner Address (Dgdrive 3.0 Feature) */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-slate-900">Explore Files by Uploader Address</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Enter an Ethereum address (e.g. from another user or colleague) to fetch and decrypt all files they have shared with you.
        </p>

        <form onSubmit={handleSearchByOwner} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter uploader Ethereum address (0x...)"
              value={searchOwnerAddress}
              onChange={(e) => setSearchOwnerAddress(e.target.value)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-900 outline-none shadow-sm transition-colors placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !searchOwnerAddress.trim() || !signer}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {isSearching ? 'Checking Access...' : 'Find Shared Files'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults !== null && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
              Search Results ({searchResults.length} {searchResults.length === 1 ? 'file found' : 'files found'}):
            </h4>
            {searchResults.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>No accessible files found for this address. The owner has not granted your wallet authorization yet.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((meta) => renderFileCard(meta.fileId, meta))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Files Shared With Connected Wallet */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">Files Shared With Me</h3>
            <span className="ml-2 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
              {sharedFileIds.length} {sharedFileIds.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <button
            onClick={loadSharedFiles}
            disabled={loading}
            className="text-xs px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-sm font-medium transition-colors flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {sharedFileIds.length === 0 ? (
          <div className="py-12 text-center">
            <div className="inline-flex p-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 mb-3">
              <Users className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium text-slate-600">No incoming shared files detected for this wallet.</p>
            <p className="text-xs text-slate-400 mt-1">
              When another user authorizes your address, files will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
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
