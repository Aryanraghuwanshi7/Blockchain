import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { 
  Award, 
  UploadCloud, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  QrCode, 
  ExternalLink, 
  Copy, 
  CheckCheck, 
  ShieldCheck, 
  AlertCircle,
  Sparkles,
  Printer,
  Ban,
  UserCheck
} from 'lucide-react';
import { getCertificateRegistryContract, computeDocumentHash } from './certificateContracts';

export default function CertificateIssuer({ signer, account, onConnectWallet }) {
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGrantingRole, setIsGrantingRole] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Common preset document types
  const PRESET_TYPES = [
    'Degree Certificate',
    'University Diploma',
    'Government Identity Document',
    'Land Title Deed',
    'Professional License',
    'Employment Verification Letter',
    'Medical Record / Health Certificate',
    'Other / Custom Type'
  ];

  // Check roles on connected wallet
  useEffect(() => {
    async function checkRoles() {
      if (!signer || !account) {
        setHasIssuerRole(null);
        setIsAdmin(false);
        return;
      }
      try {
        const contract = getCertificateRegistryContract(signer);
        const ISSUER_ROLE = await contract.ISSUER_ROLE();
        const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

        const [isIssuer, adminStatus] = await Promise.all([
          contract.hasRole(ISSUER_ROLE, account),
          contract.hasRole(DEFAULT_ADMIN_ROLE, account)
        ]);

        setHasIssuerRole(isIssuer);
        setIsAdmin(adminStatus);
      } catch (err) {
        console.warn('Role inspection warning:', err);
        setHasIssuerRole(true); // default to attempt
      }
    }
    checkRoles();
  }, [signer, account]);

  const handleGrantSelfIssuerRole = async () => {
    if (!signer || !account) return;
    setIsGrantingRole(true);
    setStatus('Granting ISSUER_ROLE to your connected address...');
    try {
      const contract = getCertificateRegistryContract(signer);
      const ISSUER_ROLE = await contract.ISSUER_ROLE();
      const tx = await contract.grantRole(ISSUER_ROLE, account);
      await tx.wait();
      setHasIssuerRole(true);
      setStatus('✓ Successfully granted ISSUER_ROLE to this account!');
    } catch (err) {
      console.error(err);
      setStatus(`Failed to grant role: ${err.message}`);
    } finally {
      setIsGrantingRole(false);
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
      setStatus('Failed to calculate document hash.');
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
    setStatus('Submitting certificate registration transaction to Ethereum ledger...');
    setIssuedRecord(null);

    try {
      const contract = getCertificateRegistryContract(signer);
      const tx = await contract.issueCertificate(
        documentHash,
        recipientName.trim(),
        finalDocType,
        metadataURI.trim()
      );

      setStatus('Awaiting on-chain block confirmation...');
      const receipt = await tx.wait();

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

      setStatus('✓ Certificate fingerprint permanently registered and verified on-chain!');
    } catch (err) {
      console.error('Issuance failed', err);
      if (err.message?.includes('CertificateAlreadyExists')) {
        setStatus('Error: This exact document hash has already been registered on-chain.');
      } else if (err.message?.includes('AccessControlUnauthorizedAccount')) {
        setStatus('Error: Connected wallet does not possess the ISSUER_ROLE permission.');
      } else {
        setStatus(`Issuance failed: ${err.message || 'Transaction reverted'}`);
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

  const finalDocTypeDisplay = documentType === 'Other / Custom Type' ? customDocType || 'Custom Document' : documentType;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-xs font-semibold text-indigo-300 mb-3">
            <Award className="w-3.5 h-3.5" /> Authority Issuer Portal
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Issue Tamper-Proof Document Fingerprint
          </h2>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
            Register academic credentials, identity certificates, land deeds, and official records on the Ethereum blockchain with cryptographic immutability.
          </p>
        </div>
      </div>

      {/* Role Notice */}
      {hasIssuerRole === false && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">Missing ISSUER_ROLE Permission</p>
              <p className="text-amber-700 mt-0.5">
                Your wallet (<code>{account}</code>) is not yet registered as an authorized certificate issuer.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={handleGrantSelfIssuerRole}
              disabled={isGrantingRole}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 shrink-0"
            >
              {isGrantingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              {isGrantingRole ? 'Granting Role...' : 'Self-Grant ISSUER_ROLE (Admin)'}
            </button>
          )}
        </div>
      )}

      {/* Main Issuance Form */}
      <form onSubmit={handleIssue} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" /> Certificate Specifications
        </h3>

        {/* 1. Document Upload */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            1. Select Document / Certificate File *
          </label>
          <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl p-6 text-center transition-colors cursor-pointer relative">
            <input
              type="file"
              id="issueFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white text-indigo-600 rounded-xl shadow-sm border border-slate-200 mb-2">
                <UploadCloud className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                {file ? file.name : "Select document file (PDF, Image, Doc)"}
              </span>
              <span className="text-xs text-slate-400 mt-0.5">
                The cryptographic Keccak-256 fingerprint will be calculated instantly
              </span>
            </div>
          </div>
        </div>

        {/* Calculated Fingerprint Preview */}
        {documentHash && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <span className="text-slate-500 font-semibold uppercase text-[10px] block">
                Calculated Document Fingerprint (Keccak-256):
              </span>
              <code className="text-indigo-700 font-mono font-bold truncate block">
                {documentHash}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(documentHash, 'hash')}
              className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 text-xs shrink-0 flex items-center gap-1 self-start sm:self-center"
            >
              {copiedHash ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedHash ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}

        {/* 2. Recipient Name / ID */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            2. Recipient Name or Identifier *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. John Doe, Student ID: CS-2026-089, or Gov ID #..."
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs text-slate-900 outline-none shadow-sm transition-colors"
          />
        </div>

        {/* 3. Document Classification Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              3. Document Classification Type *
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs text-slate-900 outline-none shadow-sm transition-colors"
            >
              {PRESET_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {documentType === 'Other / Custom Type' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Specify Custom Classification *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Patent Grant, ISO Certification"
                value={customDocType}
                onChange={(e) => setCustomDocType(e.target.value)}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs text-slate-900 outline-none shadow-sm transition-colors"
              />
            </div>
          )}
        </div>

        {/* 4. Optional Metadata CID */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            4. Public Metadata URI / IPFS CID (Optional)
          </label>
          <input
            type="text"
            placeholder="ipfs://Qm... or https://..."
            value={metadataURI}
            onChange={(e) => setMetadataURI(e.target.value)}
            className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-900 outline-none shadow-sm transition-colors"
          />
        </div>

        {/* Wallet Warning */}
        {!signer && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
            <span>⚠️ Connect your authorized Ethereum wallet to sign the on-chain issuance.</span>
            <button
              type="button"
              onClick={onConnectWallet}
              className="font-bold underline hover:text-amber-900 ml-2"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isProcessing || !signer || !file || !recipientName.trim()}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-sm"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Award className="w-4 h-4" />
          )}
          {isProcessing
            ? 'Publishing to Blockchain...'
            : !signer
            ? 'Connect Wallet to Issue Certificate'
            : !file
            ? 'Select a Document File'
            : 'Sign & Issue Certificate on Ethereum'}
        </button>

        {status && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700">
            {status}
          </div>
        )}

        {txHash && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate font-mono">Transaction Hash: {txHash}</span>
          </div>
        )}
      </form>

      {/* Issued Certificate Result & Printable Slip */}
      {issuedRecord && (
        <div className="bg-gradient-to-br from-indigo-50 to-white border-2 border-indigo-300 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-indigo-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase rounded-full tracking-wider">
                  Success
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                  Official Verification Slip Ready
                </h3>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 self-start sm:self-center"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save PDF
            </button>
          </div>

          {/* Certificate Badge Card */}
          <div className="bg-white border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="text-center pb-4 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">
                Blockchain Verified Credential
              </span>
              <h4 className="text-2xl font-black text-slate-900 mt-1">
                {issuedRecord.documentType}
              </h4>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                Issued to: <span className="text-indigo-700">{issuedRecord.recipient}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block text-[11px]">Issuing Authority Address</span>
                <code className="text-indigo-800 font-mono font-bold bg-indigo-50 px-2 py-0.5 rounded block truncate">
                  {issuedRecord.issuer}
                </code>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block text-[11px]">Timestamp of Record</span>
                <span className="text-slate-800 font-medium">
                  {new Date(issuedRecord.issueDate).toUTCString()}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <span className="text-slate-400 font-semibold block text-[11px] mb-1">
                Cryptographic Document Fingerprint
              </span>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl flex-1 truncate">
                  {issuedRecord.hash}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(issuedRecord.hash, 'hash')}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs"
                >
                  {copiedHash ? <CheckCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Public Verification Link */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-slate-400 font-semibold block text-[11px]">Public Verification Link</span>
                <a
                  href={issuedRecord.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 font-mono text-xs truncate block underline"
                >
                  {issuedRecord.verificationUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(issuedRecord.verificationUrl, 'link')}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0"
              >
                {copiedLink ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? 'Copied Link' : 'Copy Verification Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
