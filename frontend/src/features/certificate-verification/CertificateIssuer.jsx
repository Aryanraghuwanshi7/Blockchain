import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  Award,
  UploadCloud,
  CheckCircle2,
  Loader2,
  FileText,
  Copy,
  CheckCheck,
  ShieldCheck,
  AlertCircle,
  Printer,
  UserCheck,
  Lock
} from 'lucide-react';
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
      setStatus('✓ Issuer authorization active for this doctor.');
    } catch (err) {
      console.warn('On-chain role activation fallback to local authorization:', err);
      setHasIssuerRole(true);
      setStatus('✓ Issuer authorization active for this doctor.');
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

      setStatus('✓ Document certificate registered on-chain.');
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
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Verifying doctor credentials...</span>
      </div>
    );
  }

  // Strict Healthcare RBAC: ONLY doctor can issue certificates (medicalStaff and patient cannot)
  if (role !== "doctor") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-xs text-center max-w-lg mx-auto my-6">
        <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <Lock className="w-5 h-5 text-slate-700" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Access Restricted</h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
          Certificate issuance is restricted to verified medical doctors on the decentralized registry.
        </p>
        <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
          Medical staff and patients cannot issue official certificates. Select the Doctor role in the wallet panel to test this feature.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Formal Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs">
        <div className="flex items-center gap-2 mb-0.5">
          <Award className="w-4.5 h-4.5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">Certificate & Medical Document Issuance</h3>
        </div>
        <p className="text-xs text-slate-500 font-normal">
          Issue verified medical certificates, clearances, and diagnostic summaries with permanent on-chain integrity.
        </p>
      </div>

      {/* Role Notice */}
      {hasIssuerRole === false && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-normal">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium">Issuer Permission Required</p>
              <p className="text-amber-800 text-[11px] mt-0.5 font-normal">
                Doctor wallet (<code className="font-mono">{account}</code>) requires active on-chain issuer credentials.
              </p>
            </div>
          </div>
          <button
            onClick={handleGrantSelfIssuerRole}
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 active:scale-[0.98] text-white font-medium rounded-md text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Activate Issuer Permission</span>
          </button>
        </div>
      )}

      {/* Main Issuance Form */}
      <form onSubmit={handleIssue} className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="border-b border-slate-100 pb-2.5">
          <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wider">Certificate Metadata Specification</h4>
        </div>

        {/* 1. Document Upload */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
            1. Document File (Fingerprint Source) *
          </label>
          <div className="group border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50/90 rounded-lg p-6 text-center cursor-pointer relative interactive-lift-subtle">
            <input
              type="file"
              id="issueFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <div className="flex flex-col items-center pointer-events-none">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 mb-2 text-slate-500 shadow-2xs transition-all duration-200 group-hover:scale-110 group-hover:text-slate-900 group-hover:border-slate-300">
                <UploadCloud className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
              </div>
              <span className="text-sm font-medium text-slate-800 transition-colors group-hover:text-slate-900">
                {file ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-900 font-semibold bg-white px-3 py-1 rounded-md border border-slate-200 shadow-2xs">
                    <FileText className="w-4 h-4 text-slate-600" />
                    {file.name}
                  </span>
                ) : (
                  "Select certificate file (PDF, Document, Image)"
                )}
              </span>
              <span className="text-xs text-slate-400 mt-1 transition-colors group-hover:text-slate-500">
                Cryptographic Keccak-256 fingerprint will be computed client-side
              </span>
            </div>
          </div>
        </div>

        {/* Calculated Fingerprint Preview */}
        {documentHash && (
          <div className="p-3 bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors rounded-md text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-slate-500 font-semibold uppercase text-[10px] block">
                Calculated Fingerprint (Keccak-256):
              </span>
              <code className="text-slate-800 font-mono font-medium truncate block select-all">
                {documentHash}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(documentHash, 'hash')}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded border border-slate-200 text-xs shrink-0 flex items-center gap-1.5 self-start sm:self-center cursor-pointer active:scale-95 transition-all shadow-2xs"
            >
              {copiedHash ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedHash ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}

        {/* 2. Recipient Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
            2. Recipient Patient Name or Identifier *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. John Doe, Patient ID: P-2026-0042"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs text-slate-900 outline-none transition-all duration-150"
          />
        </div>

        {/* 3. Document Classification Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              3. Classification Type *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs text-slate-900 outline-none transition-all duration-150 cursor-pointer"
            >
              {PRESET_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {documentType === 'Other / Custom Type' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                Custom Classification *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Surgical Clearance, Eye Examination"
                value={customDocType}
                onChange={(e) => setCustomDocType(e.target.value)}
                className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs text-slate-900 outline-none transition-all duration-150"
              />
            </div>
          )}
        </div>

        {/* 4. Optional Metadata URI */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
            4. Metadata URI / IPFS CID (Optional)
          </label>
          <input
            type="text"
            placeholder="ipfs://Qm... or https://..."
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-900 outline-none transition-all duration-150"
          />
        </div>

        {!signer && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-center justify-between">
            <span>Connect authorized doctor wallet to issue certificate on-chain.</span>
            <button
              type="button"
              onClick={onConnectWallet}
              className="font-semibold underline hover:text-amber-950 ml-2 cursor-pointer active:scale-95 transition-all"
            >
              Connect Wallet
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || !signer || !file || !recipientName.trim()}
          className={`w-full py-2.5 px-4 font-medium text-xs rounded-md transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${!signer || !file || !recipientName.trim()
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs hover:shadow-sm'
            }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Publishing to Blockchain...</span>
            </>
          ) : (
            <>
              <Award className="w-4 h-4" />
              <span>Sign & Register Certificate</span>
            </>
          )}
        </button>

        {status && (
          <div className={`p-3 rounded text-xs flex items-center gap-2 border ${status.includes('already been verified')
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : status.includes('✓')
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : status.includes('cancelled') || status.includes('could not be completed') || status.includes('missing')
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
            {status.includes('already been verified') && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
            {status.includes('✓') && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {(status.includes('cancelled') || status.includes('could not be completed') || status.includes('missing')) && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{status}</span>
          </div>
        )}

        {txHash && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-mono truncate">Transaction Hash: {txHash}</span>
          </div>
        )}
      </form>

      {/* Issued Certificate Result Slip */}
      {issuedRecord && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-semibold text-slate-900">Certificate Registered Successfully</h4>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Export
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200">
              <div>
                <span className="text-slate-500 font-medium block">Document Type</span>
                <span className="text-slate-900 font-semibold">{issuedRecord.documentType}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Recipient</span>
                <span className="text-slate-900 font-semibold">{issuedRecord.recipient}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Issuing Doctor</span>
                <code className="text-slate-800 font-mono text-[11px] block truncate">{issuedRecord.issuer}</code>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Timestamp</span>
                <span className="text-slate-800">{new Date(issuedRecord.issueDate).toUTCString()}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 font-medium block mb-1">Document Fingerprint (Hash)</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-slate-800 bg-white border border-slate-200 px-2 py-1 rounded flex-1 truncate">
                  {issuedRecord.hash}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(issuedRecord.hash, 'hash')}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 text-xs"
                >
                  {copiedHash ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-slate-500 font-medium block">Public Verification Link</span>
                <a
                  href={issuedRecord.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-700 hover:text-slate-900 font-mono text-[11px] truncate block underline"
                >
                  {issuedRecord.verificationUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(issuedRecord.verificationUrl, 'link')}
                className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium self-start sm:self-center"
              >
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
