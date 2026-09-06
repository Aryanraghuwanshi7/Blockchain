import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  FileCheck2, 
  UploadCloud, 
  Search, 
  Loader2, 
  Calendar, 
  User, 
  Tag, 
  ExternalLink, 
  Copy, 
  CheckCheck, 
  AlertTriangle,
  RefreshCw,
  FileQuestion,
  Fingerprint
} from 'lucide-react';
import { getReadOnlyCertificateContract, computeDocumentHash } from './certificateContracts';

export default function CertificateVerifier({ initialHash = '' }) {
  const [file, setFile] = useState(null);
  const [documentHash, setDocumentHash] = useState(initialHash);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-verify if an initial hash is supplied in URL query/hash params
  useEffect(() => {
    // Check URL parameters for ?hash=0x... or #hash=0x...
    const urlParams = new URLSearchParams(window.location.search);
    const queryHash = urlParams.get('hash') || (window.location.hash.startsWith('#hash=') ? window.location.hash.replace('#hash=', '') : '');
    
    const targetHash = initialHash || queryHash;
    if (targetHash && targetHash.startsWith('0x') && targetHash.length === 66) {
      setDocumentHash(targetHash);
      handleVerifyHash(targetHash);
    }
  }, [initialHash]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrorMsg('');
    setVerificationResult(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hash = computeDocumentHash(arrayBuffer);
      setDocumentHash(hash);
      // Auto-trigger verification on file upload for seamless UX
      await handleVerifyHash(hash);
    } catch (err) {
      console.error('Failed to calculate document hash', err);
      setErrorMsg('Failed to process file buffer for cryptographic hashing.');
    }
  };

  const handleVerifyHash = async (hashToVerify) => {
    const targetHash = (hashToVerify || documentHash).trim();
    if (!targetHash) {
      setErrorMsg('Please upload a document or enter a valid 32-byte hexadecimal hash.');
      return;
    }

    if (!targetHash.startsWith('0x') || targetHash.length !== 66) {
      setErrorMsg('Invalid hash format. Must be a 32-byte hex string starting with 0x (66 characters).');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');
    setVerificationResult(null);

    try {
      const contract = getReadOnlyCertificateContract();
      const result = await contract.verifyCertificate(targetHash);

      const exists = result[0] ?? result.exists;
      const revoked = result[1] ?? result.revoked;
      const issuer = result[2] ?? result.issuer;
      const recipient = result[3] ?? result.recipient;
      const documentType = result[4] ?? result.documentType;
      const issueDate = result[5] ?? result.issueDate;
      const metadataURI = result[6] ?? result.metadataURI;

      setVerificationResult({
        hash: targetHash,
        exists,
        revoked,
        issuer,
        recipient,
        documentType,
        issueDate: Number(issueDate) * 1000,
        metadataURI,
      });
    } catch (err) {
      console.error('Verification error:', err);
      setErrorMsg(err.message || 'Failed to communicate with the Certificate Registry smart contract.');
    } finally {
      setIsVerifying(false);
    }
  };

  const copyHash = () => {
    if (!documentHash) return;
    navigator.clipboard.writeText(documentHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetVerifier = () => {
    setFile(null);
    setDocumentHash('');
    setVerificationResult(null);
    setErrorMsg('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-xs font-semibold text-indigo-300 mb-3">
            <ShieldCheck className="w-3.5 h-3.5" /> Public & Trustless Verification
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Verify Document & Certificate Authenticity
          </h2>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
            Upload any issued document (Degree, ID, Title Deed, Certificate) to instantaneously verify its tamper-proof cryptographic fingerprint on the Ethereum blockchain.
            <span className="block text-indigo-300 font-medium mt-1">
              ✨ 100% Free & Gasless — No crypto wallet or connection required.
            </span>
          </p>
        </div>
      </div>

      {/* Main Verification Input Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Drag & Drop File Zone */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Option 1: Upload Document to Verify
          </label>
          <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-slate-50/70 hover:bg-indigo-50/30 rounded-2xl p-8 text-center transition-all cursor-pointer relative group">
            <input
              type="file"
              id="verifyFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={isVerifying}
            />
            <div className="flex flex-col items-center">
              <div className="p-3.5 bg-white text-indigo-600 rounded-2xl shadow-sm border border-slate-200 group-hover:scale-105 transition-transform mb-3">
                <UploadCloud className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-slate-800">
                {file ? file.name : 'Click to select or drag & drop document'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                PDF, JPG, PNG, DOCX, or any digital asset. The file never leaves your browser — only its Keccak-256 hash is checked.
              </span>
            </div>
          </div>
        </div>

        {/* OR Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs font-semibold text-slate-400 uppercase">OR Enter Hash</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Manual Hash Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Option 2: Direct Document Fingerprint (Keccak-256 Hash)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="0x... (66-character Keccak-256 hex)"
                value={documentHash}
                onChange={(e) => {
                  setDocumentHash(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-600 rounded-xl px-4 py-3 text-xs font-mono text-slate-900 outline-none shadow-sm transition-colors placeholder:text-slate-400"
              />
              {documentHash && (
                <button
                  type="button"
                  onClick={copyHash}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Copy Hash"
                >
                  {copied ? <CheckCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>

            <button
              onClick={() => handleVerifyHash(documentHash)}
              disabled={isVerifying || !documentHash.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2 shrink-0"
            >
              {isVerifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {isVerifying ? 'Checking Ledger...' : 'Verify Authenticity'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Verification Result Display */}
      {verificationResult && (
        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
          {verificationResult.exists ? (
            verificationResult.revoked ? (
              /* Case 1: Exists but Revoked */
              <div className="bg-amber-50/90 border-2 border-amber-300 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl border border-amber-200 shrink-0">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <span className="px-3 py-1 bg-amber-200 text-amber-900 font-bold text-xs rounded-full uppercase tracking-wider">
                      ⚠️ Status: Revoked Certificate
                    </span>
                    <h3 className="text-xl font-bold text-amber-950 mt-1">
                      This Certificate Has Been Officially Revoked
                    </h3>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      The document fingerprint exists in the blockchain registry, but has been flagged as <strong>revoked / invalidated</strong> by the issuing authority.
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="bg-white/80 border border-amber-200 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block">Document Type</span>
                    <span className="text-slate-900 font-bold text-sm">{verificationResult.documentType}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">Recipient Identity</span>
                    <span className="text-slate-900 font-bold text-sm">{verificationResult.recipient}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">Issued By (Authority)</span>
                    <code className="text-indigo-700 font-mono font-bold bg-indigo-50 px-2 py-0.5 rounded">
                      {verificationResult.issuer}
                    </code>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium block">Original Issue Date</span>
                    <span className="text-slate-900 font-medium">
                      {new Date(verificationResult.issueDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Case 2: 100% Authentic & Untampered */
              <div className="bg-gradient-to-br from-emerald-50/90 to-teal-50/70 border-2 border-emerald-400 rounded-3xl p-6 sm:p-8 shadow-lg space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-200">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shrink-0">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full uppercase tracking-wider mb-1">
                        <CheckCheck className="w-3.5 h-3.5" /> Verified On-Chain
                      </div>
                      <h3 className="text-xl sm:text-2xl font-extrabold text-emerald-950">
                        100% Authentic & Untampered Document
                      </h3>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        This document's cryptographic fingerprint matches an authentic record on the Ethereum ledger.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={resetVerifier}
                    className="self-start sm:self-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-emerald-200 rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Verify Another
                  </button>
                </div>

                {/* Verified Metadata Card */}
                <div className="bg-white border border-emerald-200/80 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-sm text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" /> Document Classification
                    </span>
                    <p className="text-slate-900 font-bold text-sm sm:text-base">
                      {verificationResult.documentType}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-600" /> Issued To (Recipient)
                    </span>
                    <p className="text-slate-900 font-bold text-sm sm:text-base">
                      {verificationResult.recipient}
                    </p>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-1">
                      <Fingerprint className="w-3.5 h-3.5 text-emerald-600" /> Document Keccak-256 Fingerprint
                    </span>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] font-mono text-indigo-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg block truncate flex-1">
                        {verificationResult.hash}
                      </code>
                      <button
                        onClick={copyHash}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs"
                        title="Copy Fingerprint"
                      >
                        {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" /> Date of On-Chain Issuance
                    </span>
                    <p className="text-slate-800 font-medium">
                      {new Date(verificationResult.issueDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[11px] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Authenticated Issuing Authority
                    </span>
                    <code className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 block truncate">
                      {verificationResult.issuer}
                    </code>
                  </div>

                  {verificationResult.metadataURI && (
                    <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-100">
                      <span className="text-slate-400 font-semibold uppercase text-[11px]">
                        Public Metadata / Reference URI
                      </span>
                      <a
                        href={verificationResult.metadataURI.startsWith('ipfs://') 
                          ? `https://gateway.pinata.cloud/ipfs/${verificationResult.metadataURI.replace('ipfs://', '')}`
                          : verificationResult.metadataURI}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center gap-1"
                      >
                        {verificationResult.metadataURI} <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* Case 3: Not Found on Ledger */
            <div className="bg-rose-50/90 border-2 border-rose-300 rounded-3xl p-6 sm:p-8 shadow-md space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl border border-rose-200 shrink-0">
                  <FileQuestion className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <span className="px-3 py-1 bg-rose-200 text-rose-900 font-bold text-xs rounded-full uppercase tracking-wider">
                    ❌ Unverified / Not Found
                  </span>
                  <h3 className="text-xl font-bold text-rose-950 mt-1">
                    No Matching Certificate Found on the Blockchain
                  </h3>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    This document's cryptographic hash does not exist in the official Certificate Registry. Either this document was never issued by an authorized authority, or the document file has been modified/tampered with.
                  </p>
                </div>
              </div>

              <div className="bg-white/80 border border-rose-200 rounded-2xl p-4 text-xs font-mono text-slate-700">
                <span className="text-slate-400 block font-sans font-medium text-[11px] mb-1">
                  Calculated Fingerprint Checked:
                </span>
                <code className="text-rose-700 break-all">{verificationResult.hash}</code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
