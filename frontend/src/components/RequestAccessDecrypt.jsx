import React, { useState } from 'react';
import { Download, Key, Lock, Unlock, Loader2, FileCheck } from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { downloadFromIPFS } from '../utils/ipfs';
import { unwrapKeyForRecipient, decryptFile, importRawKey } from '../utils/crypto';
import { ethers } from 'ethers';

export default function RequestAccessDecrypt({ signer, userKeys }) {
  const [fileIdInput, setFileIdInput] = useState('');
  const [status, setStatus] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleDecryptAndDownload = async () => {
    if (!fileIdInput || !signer) return;
    setIsDecrypting(true);
    setStatus('Querying FileRegistry smart contract for wrapped key & CID...');
    setDownloadUrl(null);

    try {
      const contract = getFileRegistryContract(signer);
      const record = await contract.getFileRecord(fileIdInput.trim());

      const ipfsCid = record.ipfsCid;
      const callerWrappedKeyHex = record.callerWrappedKey;

      setStatus(`Found record on IPFS (${ipfsCid}). Fetching ciphertext...`);
      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      setStatus('Unwrapping symmetric AES key with recipient private key...');
      let aesKey = null;

      if (callerWrappedKeyHex && callerWrappedKeyHex !== '0x') {
        try {
          const wrappedKeyBytes = ethers.getBytes(callerWrappedKeyHex);
          if (userKeys?.privateKeyJWK) {
            aesKey = await unwrapKeyForRecipient(wrappedKeyBytes, userKeys.privateKeyJWK);
          }
        } catch (unwrapErr) {
          console.warn('Unwrap error:', unwrapErr);
        }
      }

      if (!aesKey) {
        const fileKeys = JSON.parse(localStorage.getItem('blockdrive_file_aes_keys') || '{}');
        const rawHex = fileKeys[fileIdInput.trim().toLowerCase()];
        if (rawHex) {
          const rawBytes = ethers.getBytes(rawHex);
          aesKey = await importRawKey(rawBytes);
        }
      }

      if (!aesKey) {
        throw new Error('Could not unwrap encryption key. You may not be authorized.');
      }

      setStatus('Decrypting file with AES-256-GCM...');
      // Extract 12-byte IV from head of payload
      const iv = new Uint8Array(encryptedPayload.slice(0, 12));
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, iv, aesKey);

      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('✓ Decryption successful! Click button below to save.');
    } catch (err) {
      console.error(err);
      setStatus(`Decryption failed: ${err.message || 'Access denied or invalid key'}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Unlock className="w-5 h-5 text-indigo-600" />
        <h3 className="text-lg font-bold text-slate-900">Retrieve & Decrypt File</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            File Identifier (bytes32 hex)
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={fileIdInput}
            onChange={(e) => setFileIdInput(e.target.value)}
            className="w-full bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-900 outline-none shadow-sm transition-colors placeholder:text-slate-400"
          />
        </div>

        <button
          onClick={handleDecryptAndDownload}
          disabled={!fileIdInput || isDecrypting || !signer}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-sm"
        >
          {isDecrypting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {isDecrypting ? 'Processing Decryption...' : 'Fetch, Unwrap Key & Decrypt'}
        </button>

        {status && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700">
            {status}
          </div>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download="decrypted-blockdrive-file"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <Download className="w-4 h-4" /> Download Decrypted File
          </a>
        )}
      </div>
    </div>
  );
}
