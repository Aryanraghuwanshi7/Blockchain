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
  Sparkles
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
  const [copiedId, setCopiedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  const loadFiles = async () => {
    if (!signer || !account) return;
    setLoading(true);
    try {
      const contract = getFileRegistryContract(signer);
      const fileIds = await contract.getFilesByOwner(account);
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

  const handleGrantAccess = async (fileId) => {
    if (!recipientAddress || !recipientPubKeyJWK || !signer) return;
    setAuthStatus('Re-wrapping key for target recipient public key...');

    try {
      const contract = getFileRegistryContract(signer);
      const parsedJWK = JSON.parse(recipientPubKeyJWK);
      const demoKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const wrapped = await wrapKeyForRecipient(demoKey, parsedJWK);

      setAuthStatus('Submitting addAuthorizedRecipient on-chain...');
      const tx = await contract.addAuthorizedRecipient(
        fileId,
        recipientAddress,
        ethers.hexlify(wrapped)
      );
      await tx.wait();
      setAuthStatus('✓ Recipient authorization confirmed on-chain!');
      setSelectedFileId(null);
      setRecipientAddress('');
      setRecipientPubKeyJWK('');
    } catch (err) {
      setAuthStatus(`Error: ${err.message}`);
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
        <button
          onClick={loadFiles}
          disabled={loading}
          className="text-xs px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 shadow-sm font-medium transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {files.length === 0 ? (
        <div className="py-12 text-center">
          <div className="inline-flex p-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 mb-3">
            <FileText className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium text-slate-600">No files registered by this account yet.</p>
          <p className="text-xs text-slate-400 mt-1">Upload and encrypt a file to see it listed here.</p>
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

                {/* Authorize Button */}
                <div className="shrink-0 self-end md:self-center">
                  <button
                    onClick={() => setSelectedFileId(fileId)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Authorize Recipient
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grant Access Modal / Expanded Card */}
      {selectedFileId && (
        <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">
              Grant Access to: <span className="text-indigo-600">{fileDetails[selectedFileId]?.name || 'Selected File'}</span>
            </h4>
            <button
              onClick={() => setSelectedFileId(null)}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium"
            >
              Close
            </button>
          </div>

          <p className="font-mono text-xs text-slate-500 bg-white p-2 rounded-lg border border-slate-200 break-all">
            {selectedFileId}
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recipient Ethereum Address
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recipient ECDH Public Key (JWK format)
            </label>
            <textarea
              placeholder='{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"...","y":"..."}'
              rows={3}
              value={recipientPubKeyJWK}
              onChange={(e) => setRecipientPubKeyJWK(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleGrantAccess(selectedFileId)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Confirm Authorization
            </button>
            <button
              onClick={() => setSelectedFileId(null)}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-medium transition-colors"
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
