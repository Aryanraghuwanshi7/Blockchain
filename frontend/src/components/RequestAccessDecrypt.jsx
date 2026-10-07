import React, { useState } from 'react';
import { Download, Lock, Unlock, Loader2 } from 'lucide-react';
import { getFileRegistryContract } from '../utils/contracts';
import { downloadFromIPFS } from '../utils/ipfs';
import { unwrapKeyForRecipient, decryptFile, importRawKey } from '../utils/crypto';
import { ethers } from 'ethers';

export default function RequestAccessDecrypt({ signer, userKeys }) {
  const [fileIdInput, setFileIdInput] = useState('');
  const [status, setStatus] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadFileName, setDownloadFileName] = useState('decrypted-document');

  const handleDecryptAndDownload = async () => {
    if (!fileIdInput || !signer) return;
    setIsDecrypting(true);
    setStatus('Querying FileRegistry smart contract for record & CID...');
    setDownloadUrl(null);

    try {
      const targetId = fileIdInput.trim();
      const contract = getFileRegistryContract(signer);
      const record = await contract.getFileRecord(targetId);

      const ipfsCid = record.ipfsCid;
      const callerWrappedKeyHex = record.callerWrappedKey;

      setStatus(`Located record on IPFS (${ipfsCid}). Fetching ciphertext...`);
      const encryptedPayload = await downloadFromIPFS(ipfsCid);

      setStatus('Unwrapping AES key with recipient private key...');
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
        const rawHex = fileKeys[targetId.toLowerCase()];
        if (rawHex) {
          const rawBytes = ethers.getBytes(rawHex);
          aesKey = await importRawKey(rawBytes);
        }
      }

      if (!aesKey) {
        throw new Error('Could not unwrap encryption key. You may not be authorized.');
      }

      setStatus('Decrypting payload (AES-256-GCM)...');
      const iv = new Uint8Array(encryptedPayload.slice(0, 12));
      const ciphertext = encryptedPayload.slice(12);

      const decryptedBuffer = await decryptFile(ciphertext, iv, aesKey);

      const cached = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
      const meta = cached[targetId.toLowerCase()] || {};
      
      let finalName = meta.name;
      let mimeType = meta.type || 'application/octet-stream';

      if (!finalName) {
        const u8 = new Uint8Array(decryptedBuffer);
        const headerStr = String.fromCharCode(...u8.slice(0, 8));
        if (headerStr.startsWith('%PDF')) {
          finalName = `Decrypted_Document_${targetId.substring(2, 8)}.pdf`;
          mimeType = 'application/pdf';
        } else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
          finalName = `Decrypted_Image_${targetId.substring(2, 8)}.png`;
          mimeType = 'image/png';
        } else if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
          finalName = `Decrypted_Image_${targetId.substring(2, 8)}.jpg`;
          mimeType = 'image/jpeg';
        } else {
          finalName = `Decrypted_File_${targetId.substring(2, 8)}.bin`;
        }
      }

      setDownloadFileName(finalName);
      const blob = new Blob([decryptedBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(`✓ Decrypted successfully: "${finalName}".`);
    } catch (err) {
      console.error(err);
      setStatus(`Decryption failed: ${err.message || 'Access denied or invalid key'}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs">
      <div className="border-b border-slate-100 pb-3 mb-3.5">
        <h3 className="text-sm font-semibold text-slate-900">Direct Document Decryption</h3>
        <p className="text-xs text-slate-500 mt-0.5 font-normal">
          Enter a known File Identifier (bytes32 hex) to verify permissions, unwrap the symmetric key, and decrypt client-side.
        </p>
      </div>

      <div className="space-y-3.5">
        <div>
          <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
            File Identifier (bytes32 Hex) *
          </label>
          <input
            type="text"
            placeholder="0x... (66-character bytes32 file ID)"
            value={fileIdInput}
            onChange={(e) => setFileIdInput(e.target.value)}
            className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 transition-all duration-150"
          />
        </div>

        <button
          onClick={handleDecryptAndDownload}
          disabled={!fileIdInput || isDecrypting || !signer}
          className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-md text-xs transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] shadow-2xs"
        >
          {isDecrypting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Decrypting Payload...</span>
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5" />
              <span>Fetch, Unwrap Key & Decrypt</span>
            </>
          )}
        </button>

        {status && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-700 font-normal">
            {status}
          </div>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadFileName}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-medium rounded-md text-xs flex items-center justify-center gap-1.5 transition-all duration-150 shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Decrypted File ({downloadFileName})</span>
          </a>
        )}
      </div>
    </div>
  );
}
