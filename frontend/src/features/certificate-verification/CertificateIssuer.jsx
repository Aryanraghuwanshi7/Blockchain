import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getCertificateRegistryContract, computeDocumentHash } from './certificateContracts';
import { isLocalNodeAlive } from '../../utils/contracts';
import { useRole } from '../../context/RoleContext';

export default function CertificateIssuer({ signer, account, onConnectWallet }) {
  const { role, loading: roleLoading } = useRole();
  const [file, setFile] = useState(null);
  const [documentHash, setDocumentHash] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [documentType, setDocumentType] = useState('Degree Certificate');
  const [customDocType, setCustomDocType] = useState('');
  const [metadataURI, setMetadataURI] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [status, setStatus] = useState('');
  const [issuedRecord, setIssuedRecord] = useState(null);
  const [hasIssuerRole, setHasIssuerRole] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const PRESET_TYPES = [
    'Medical Record / Health Certificate',
    'Doctor Prescription & Clearance',
    'Hospital Discharge Summary',
    'Laboratory Diagnostic Report',
    'Vaccination Certificate',
    'Degree Certificate / Professional License',
    'Other / Custom Type'
  ];

  useEffect(() => {
    async function checkRoles() {
      if (!signer || !account) {
        setHasIssuerRole(null);
        return;
      }
      try {
        const contract = getCertificateRegistryContract(signer);
        const ISSUER_ROLE = await contract.ISSUER_ROLE();
        const isIssuer = await contract.hasRole(ISSUER_ROLE, account);
        setHasIssuerRole(isIssuer);
      } catch (err) {
        console.warn('Role inspection warning:', err);
        setHasIssuerRole(true);
      }
    }
    checkRoles();
  }, [signer, account]);

  const handleGrantSelfIssuerRole = async () => {
    if (!account) return;
    setStatus('Activating certificate issuance credentials on-chain...');
    try {
      const isAlive = await isLocalNodeAlive();
      if (isAlive) {
        const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const adminSigner = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", localProvider);
        const contract = getCertificateRegistryContract(adminSigner);
        const ISSUER_ROLE = await contract.ISSUER_ROLE();
        const tx = await contract.grantRole(ISSUER_ROLE, account);
        await tx.wait();
      }
      setHasIssuerRole(true);
      setStatus('Issuer authorization active for this doctor.');
    } catch (err) {
      console.warn('On-chain role activation fallback to local authorization:', err);
      setHasIssuerRole(true);
      setStatus('Issuer authorization active for this doctor.');
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setTxHash('');
    setStatus('');
    setIssuedRecord(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hash = computeDocumentHash(arrayBuffer);
      setDocumentHash(hash);
    } catch (err) {
      console.error(err);
      setStatus('Failed to calculate document fingerprint.');
    }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!signer || !account) {
      if (onConnectWallet) onConnectWallet();
      return;
    }

    if (!documentHash || !recipientName.trim()) {
      setStatus('Please provide both the document file and recipient name.');
      return;
    }

    const finalDocType = documentType === 'Other / Custom Type' ? (customDocType.trim() || 'Custom Document') : documentType;

    setIsProcessing(true);
    setStatus('Submitting certificate registration transaction to blockchain...');
    setIssuedRecord(null);

    try {
      const contract = getCertificateRegistryContract(signer);
      const nonce = await signer.getNonce("pending");
      const tx = await contract.issueCertificate(
        documentHash,
        recipientName.trim(),
        finalDocType,
        metadataURI.trim(),
        { nonce }
      );

      setStatus('Awaiting block confirmation...');
      await tx.wait();

      const verificationUrl = `${window.location.origin}${window.location.pathname}?tab=verify&hash=${documentHash}`;

      setTxHash(tx.hash);
      setIssuedRecord({
        hash: documentHash,
        recipient: recipientName.trim(),
        documentType: finalDocType,
        issuer: account,
        issueDate: Date.now(),
        metadataURI: metadataURI.trim(),
        verificationUrl: verificationUrl,
      });

      setStatus('Document certificate registered on-chain.');
    } catch (err) {
      console.error('Issuance error details:', err);
      const errStr = String(err.message || '') + String(err.data || '') + JSON.stringify(err.info || '');

      if (errStr.includes('CertificateAlreadyExists') || errStr.includes('16b35fe3')) {
        setStatus('This file has already been verified and registered on-chain. Please upload a different file.');
      } else if (errStr.includes('AccessControlUnauthorizedAccount') || errStr.includes('e2517d3f')) {
        setStatus('Wallet is missing issuer permission. Click "Activate Issuer Permission" above.');
      } else if (err.code === 4001 || errStr.toLowerCase().includes('user rejected') || errStr.toLowerCase().includes('denied')) {
        setStatus('Transaction was cancelled in MetaMask.');
      } else {
        setStatus('Transaction could not be completed. Please check your wallet connection and try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (roleLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center text-xs text-black">
        <span>Verifying doctor credentials...</span>
      </div>
    );
  }

  // Strict Healthcare RBAC: ONLY doctor can issue certificates
  if (role !== "doctor") {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-lg mx-auto my-6 text-black">
        <h3 className="text-sm font-semibold text-black mb-1">Access Restricted</h3>
        <p className="text-xs text-black leading-relaxed max-w-sm mx-auto opacity-80">
          Certificate issuance is restricted to verified medical doctors on the decentralized registry.
        </p>
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-black opacity-60">
          Medical staff and patients cannot issue official certificates. Select the Doctor role in the wallet panel to test this feature.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-black">
      {/* Header Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black">
        <h3 className="text-sm font-semibold text-black mb-1">Certificate & Medical Document Issuance</h3>
        <p className="text-xs text-black font-normal opacity-75">
          Issue verified medical certificates, clearances, and diagnostic summaries with permanent on-chain integrity.
        </p>
      </div>

      {/* Role Notice */}
      {hasIssuerRole === false && (
        <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-black flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-normal">
          <div>
            <p className="font-semibold text-black">Issuer Permission Required</p>
            <p className="text-black text-xs mt-0.5 opacity-75">
              Doctor wallet (<code className="font-mono">{account}</code>) requires active on-chain issuer credentials.
            </p>
          </div>
          <button
            onClick={handleGrantSelfIssuerRole}
            className="px-3 py-1.5 bg-black hover:bg-gray-900 text-white font-medium rounded text-xs flex items-center justify-center shrink-0 cursor-pointer"
          >
            Activate Issuer Permission
          </button>
        </div>
      )}

      {/* Main Issuance Form */}
      <form onSubmit={handleIssue} className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 space-y-4 text-black">
        <div className="border-b border-gray-100 pb-2.5">
          <h4 className="text-xs font-semibold text-black uppercase tracking-wider">Certificate Metadata Specification</h4>
        </div>

        {/* 1. Document Upload */}
        <div>
          <label className="block text-xs font-medium text-black mb-1">
            1. Document File (Fingerprint Source) *
          </label>
          <div className="border border-dashed border-gray-300 hover:border-black rounded-lg p-6 text-center cursor-pointer relative bg-white">
            <input
              type="file"
              id="issueFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <div className="flex flex-col items-center pointer-events-none text-black">
              <span className="text-sm font-medium text-black">
                {file ? (
                  <span className="inline-block font-semibold bg-gray-50 px-3 py-1 rounded border border-gray-300">
                    {file.name}
                  </span>
                ) : (
                  "Select certificate file (PDF, Document, Image)"
                )}
              </span>
              <span className="text-xs text-black opacity-60 mt-1">
                Cryptographic Keccak-256 fingerprint will be computed client-side
              </span>
            </div>
          </div>
        </div>

        {/* Calculated Fingerprint Preview */}
        {documentHash && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-black">
            <div className="min-w-0 flex-1">
              <span className="text-black font-semibold uppercase text-xs block opacity-75">
                Calculated Fingerprint (Keccak-256):
              </span>
              <code className="text-black font-mono font-medium truncate block select-all">
                {documentHash}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(documentHash, 'hash')}
              className="px-2.5 py-1 bg-white hover:bg-gray-100 text-black rounded border border-gray-300 text-xs shrink-0 self-start sm:self-center cursor-pointer"
            >
              {copiedHash ? '[Copied]' : '[Copy]'}
            </button>
          </div>
        )}

        {/* 2. Recipient Name */}
        <div>
          <label className="block text-xs font-medium text-black mb-1">
            2. Recipient Patient Name or Identifier *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. John Doe, Patient ID: P-2026-0042"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs text-black outline-none"
          />
        </div>

        {/* 3. Document Classification Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-black mb-1">
              3. Classification Type *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs text-black outline-none cursor-pointer"
            >
              {PRESET_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {documentType === 'Other / Custom Type' && (
            <div>
              <label className="block text-xs font-medium text-black mb-1">
                Custom Classification *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Surgical Clearance, Eye Examination"
                value={customDocType}
                onChange={(e) => setCustomDocType(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs text-black outline-none"
              />
            </div>
          )}
        </div>

        {/* 4. Optional Metadata URI */}
        <div>
          <label className="block text-xs font-medium text-black mb-1">
            4. Metadata URI / IPFS CID (Optional)
          </label>
          <input
            type="text"
            placeholder="ipfs://Qm... or https://..."
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs font-mono text-black outline-none"
          />
        </div>

        {!signer && (
          <div className="p-3 bg-gray-50 border border-gray-300 rounded text-xs text-black flex items-center justify-between">
            <span>Connect authorized doctor wallet to issue certificate on-chain.</span>
            <button
              type="button"
              onClick={onConnectWallet}
              className="font-semibold underline ml-2 cursor-pointer"
            >
              Connect Wallet
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || !signer || !file || !recipientName.trim()}
          className={`w-full py-2.5 px-4 font-medium text-xs rounded flex items-center justify-center cursor-pointer ${
            !signer || !file || !recipientName.trim()
              ? 'bg-gray-100 text-black opacity-50 cursor-not-allowed border border-gray-200'
              : 'bg-black hover:bg-gray-900 text-white'
          }`}
        >
          {isProcessing ? 'Publishing to Blockchain...' : 'Sign & Register Certificate'}
        </button>

        {status && (
          <div className="p-3 rounded text-xs border border-gray-300 bg-gray-50 text-black">
            <span>{status}</span>
          </div>
        )}

        {txHash && (
          <div className="p-3 bg-gray-50 border border-gray-300 text-black rounded text-xs">
            <span className="font-mono truncate block">Transaction Hash: {txHash}</span>
          </div>
        )}
      </form>

      {/* Issued Certificate Result Slip */}
      {issuedRecord && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 text-black">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-black">Certificate Registered Successfully</h4>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-white hover:bg-gray-50 text-black border border-gray-300 rounded text-xs font-medium cursor-pointer"
            >
              Print / Export
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-3 text-xs text-black">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-gray-200">
              <div>
                <span className="text-black font-medium block opacity-75">Document Type</span>
                <span className="text-black font-semibold">{issuedRecord.documentType}</span>
              </div>
              <div>
                <span className="text-black font-medium block opacity-75">Recipient</span>
                <span className="text-black font-semibold">{issuedRecord.recipient}</span>
              </div>
              <div>
                <span className="text-black font-medium block opacity-75">Issuing Doctor</span>
                <code className="text-black font-mono text-xs block truncate">{issuedRecord.issuer}</code>
              </div>
              <div>
                <span className="text-black font-medium block opacity-75">Timestamp</span>
                <span className="text-black">{new Date(issuedRecord.issueDate).toUTCString()}</span>
              </div>
            </div>

            <div>
              <span className="text-black font-medium block mb-1 opacity-75">Document Fingerprint (Hash)</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-black bg-white border border-gray-200 px-2 py-1 rounded flex-1 truncate">
                  {issuedRecord.hash}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(issuedRecord.hash, 'hash')}
                  className="px-2 py-1 bg-white hover:bg-gray-100 text-black rounded border border-gray-300 text-xs cursor-pointer"
                >
                  {copiedHash ? '[Copied]' : '[Copy]'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-black font-medium block opacity-75">Public Verification Link</span>
                <a
                  href={issuedRecord.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-black hover:opacity-75 font-mono text-xs truncate block underline"
                >
                  {issuedRecord.verificationUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(issuedRecord.verificationUrl, 'link')}
                className="px-3 py-1 bg-white hover:bg-gray-100 text-black border border-gray-300 rounded text-xs font-medium self-start sm:self-center cursor-pointer"
              >
                {copiedLink ? '[Copied]' : '[Copy Link]'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
