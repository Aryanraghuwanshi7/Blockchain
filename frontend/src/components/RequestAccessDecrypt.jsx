import React, { useState } from 'react';
import { Download, Key, Lock, Unlock, Loader2, FileCheck } from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { downloadFromIPFS } from '../utils/ipfs';
import { unwrapKeyForRecipient, decryptFile } from '../utils/crypto';

export default function RequestAccessDecrypt({ signer, userKeys }) {
  const [fileIdInput, setFileIdInput] = useState('');
  const [status, setStatus] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const handleDecryptAndDownload = async () => {
    if (!fileIdInput || !signer || !userKeys) return;
    setIsDecrypting(true);
    setStatus('Querying FileRegistry smart contract for wrapped key & CID...');
    setDownloadUrl(null);

    try {
      const contract = getFileRegistryContract(signer);
      const record = await contract.getFileRecord(fileIdInput);

      const ipfsCid = record.ipfsCid;
      const callerWrappedKeyHex = record.callerWrappedKey;

      setStatus(`Found record on IPFS (${ipfsCid}). Fetching ciphertext...`);
      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      setStatus('Unwrapping symmetric AES key with recipient private key...');
      const wrappedKeyBytes = new Uint8Array(
        callerWrappedKeyHex.replace('0x', '').match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
      );

      const aesKey = await unwrapKeyForRecipient(wrappedKeyBytes, userKeys.privateKeyJWK);

      setStatus('Decrypting file with AES-256-GCM...');
      // Extract 12-byte IV from head of payload
      const iv = new Uint8Array(encryptedPayload.slice(0, 12));
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, iv, aesKey);

      const blob = new Blob([decryptedBuffer]);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('Decryption successful! File ready for download.');
    } catch (err) {
      console.error(err);
      setStatus(`Decryption failed: ${err.message || 'Access denied or invalid key'}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-xl shadow-indigo-950/20 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Unlock className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-semibold text-white">Retrieve & Decrypt File</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">
            File Identifier (bytes32 hex)
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={fileIdInput}
            onChange={(e) => setFileIdInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
          />
        </div>

        <button
          onClick={handleDecryptAndDownload}
          disabled={!fileIdInput || isDecrypting || !signer}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
        >
          {isDecrypting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {isDecrypting ? 'Processing Decryption...' : 'Fetch, Unwrap Key & Decrypt'}
        </button>

        {status && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
            {status}
          </div>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download="decrypted-blockdrive-file"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" /> Download Decrypted File
          </a>
        )}
      </div>
    </div>
  );
}
