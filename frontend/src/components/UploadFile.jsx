import React, { useState } from 'react';
import { ethers } from 'ethers';
import { UploadCloud, CheckCircle2, Loader2, KeyRound } from 'lucide-react';
import { generateAESKey, encryptFile, wrapKeyForRecipient } from '../utils/crypto';
import { uploadToIPFS } from '../utils/ipfs';
import { getFileRegistryContract } from '../utils/contracts';

export default function UploadFile({ signer, userKeys, onFileUploaded, onConnectWallet }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setTxHash('');
      setStatus('');
    }
  };

  const handleUpload = async () => {
    if (!signer) {
      if (onConnectWallet) onConnectWallet();
      return;
    }
    if (!file || !userKeys) return;
    setIsProcessing(true);
    setStatus('Reading and encrypting file client-side (AES-256-GCM)...');

    try {
      // 1. Read file buffer
      const fileBuffer = await file.arrayBuffer();

      // 2. Generate AES key and encrypt file
      const aesKey = await generateAESKey();
      const { ciphertext, iv } = await encryptFile(fileBuffer, aesKey);

      // Pack IV (12 bytes) + Ciphertext into single payload for storage
      const packedBuffer = new Uint8Array(iv.byteLength + ciphertext.byteLength);
      packedBuffer.set(iv, 0);
      packedBuffer.set(new Uint8Array(ciphertext), iv.byteLength);

      // 3. Upload ciphertext to IPFS
      setStatus('Uploading encrypted binary to IPFS (Pinata Cloud)...');
      const ipfsCid = await uploadToIPFS(packedBuffer, file.name);

      // 4. Wrap AES Key for Owner using client ECDH key
      setStatus('Wrapping AES key with owner public key...');
      const wrappedKeyBytes = await wrapKeyForRecipient(aesKey, userKeys.publicKeyJWK);

      // 5. Generate FileId (SHA-256 of file name + timestamp)
      const fileId = ethers.keccak256(
        ethers.toUtf8Bytes(`${file.name}-${Date.now()}-${file.size}`)
      );

      // 6. Submit registration transaction to FileRegistry.sol
      setStatus('Submitting registerFile transaction on-chain...');
      const contract = getFileRegistryContract(signer);
      const tx = await contract.registerFile(
        fileId,
        ipfsCid,
        ethers.hexlify(wrappedKeyBytes)
      );

      setStatus('Awaiting block confirmation...');
      await tx.wait();

      // Store local file metadata (name, size, type, timestamp) for rich UI display
      try {
        const metadata = {
          fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          ipfsCid,
          createdAt: Date.now(),
        };
        const existing = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
        existing[fileId.toLowerCase()] = metadata;
        localStorage.setItem('blockdrive_files_metadata', JSON.stringify(existing));

        // Save raw AES key in local keystore for quick re-wrapping and fast decryption
        const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const rawHex = ethers.hexlify(new Uint8Array(rawKey));
        const fileKeys = JSON.parse(localStorage.getItem('blockdrive_file_aes_keys') || '{}');
        fileKeys[fileId.toLowerCase()] = rawHex;
        localStorage.setItem('blockdrive_file_aes_keys', JSON.stringify(fileKeys));
      } catch (metaErr) {
        console.warn('Failed to cache file metadata or key locally', metaErr);
      }

      setTxHash(tx.hash);
      setStatus('File successfully encrypted, pinned, and registered on-chain!');
      if (onFileUploaded) onFileUploaded();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Operation failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <UploadCloud className="w-5 h-5 text-indigo-600" />
        <h3 className="text-lg font-bold text-slate-900">Client-Side Encrypted Upload</h3>
      </div>

      <div className="space-y-4">
        <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl p-8 text-center transition-colors">
          <input
            type="file"
            id="fileInput"
            className="hidden"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
          <label htmlFor="fileInput" className="cursor-pointer flex flex-col items-center">
            <div className="p-3 bg-white rounded-full shadow-sm border border-slate-200 mb-3 text-indigo-600">
              <KeyRound className="w-6 h-6" />
            </div>
            <span className="text-sm font-semibold text-slate-800">
              {file ? file.name : "Select a file to encrypt & upload"}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              AES-256-GCM client encryption occurs before transmission
            </span>
          </label>
        </div>

        {!signer && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
            <span>⚠️ Ethereum Web3 Wallet is not connected.</span>
            <button
              onClick={onConnectWallet}
              className="font-bold underline hover:text-amber-900 ml-2"
            >
              Connect Wallet Now
            </button>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={isProcessing || (!signer && !onConnectWallet)}
          className={`w-full py-3 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 ${
            !signer
              ? 'bg-amber-600 hover:bg-amber-700'
              : !file
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !signer ? (
            <UploadCloud className="w-4 h-4" />
          ) : (
            <UploadCloud className="w-4 h-4" />
          )}
          {isProcessing
            ? 'Processing...'
            : !signer
            ? 'Connect Wallet to Encrypt & Register'
            : !file
            ? 'Select a File to Upload'
            : 'Encrypt & Register on BlockDrive'}
        </button>

        {status && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700">
            {status}
          </div>
        )}

        {txHash && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate font-mono">Tx: {txHash}</span>
          </div>
        )}
      </div>
    </div>
  );
}
