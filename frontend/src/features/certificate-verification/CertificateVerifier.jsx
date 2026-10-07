import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
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

  useEffect(() => {
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
      await handleVerifyHash(hash);
    } catch (err) {
      console.error('Failed to calculate document hash', err);
      setErrorMsg('Failed to process file for cryptographic hashing.');
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
    <div className="space-y-5">
      {/* Formal Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs">
        <div className="flex items-center gap-2 mb-0.5">
          <ShieldCheck className="w-4.5 h-4.5 text-slate-700" />
          <h3 className="text-sm font-semibold text-slate-900">Document Verification Portal</h3>
        </div>
        <p className="text-xs text-slate-500 font-normal">
          Public, trustless verification of document integrity against on-chain records. No wallet required.
        </p>
      </div>

      {/* Main Verification Input Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Upload File Section */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 uppercase tracking-wider mb-1">
            1. Document File Verification
          </label>
          <div className="group border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50/90 rounded-lg p-6 text-center cursor-pointer relative interactive-lift-subtle">
            <input
              type="file"
              id="verifyFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileChange}
              disabled={isVerifying}
            />
            <div className="flex flex-col items-center pointer-events-none">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 mb-2 text-slate-500 shadow-2xs transition-all duration-200 group-hover:scale-110 group-hover:text-slate-900 group-hover:border-slate-300">
                <UploadCloud className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
              </div>
              <span className="text-sm font-medium text-slate-800 transition-colors group-hover:text-slate-900">
                {file ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-900 font-semibold bg-white px-3 py-1 rounded-md border border-slate-200 shadow-2xs">
                    <Fingerprint className="w-4 h-4 text-slate-600" />
                    {file.name}
                  </span>
                ) : (
                  'Select or drop document to verify'
                )}
              </span>
              <span className="text-xs text-slate-400 mt-1 transition-colors group-hover:text-slate-500">
                The file remains in your browser; only its cryptographic hash is verified against the ledger
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase">OR</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Manual Hash Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
            2. Direct Keccak-256 Hash
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="0x... (66-character Keccak-256 hex string)"
                value={documentHash}
                onChange={(e) => {
                  setDocumentHash(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full bg-white border border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 rounded-md px-3 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 transition-all duration-150"
              />
              {documentHash && (
                <button
                  type="button"
                  onClick={copyHash}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer active:scale-90"
                  title="Copy Hash"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <button
              onClick={() => handleVerifyHash(documentHash)}
              disabled={isVerifying || !documentHash.trim()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-md text-xs font-medium transition-all duration-150 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-95 shadow-xs"
            >
              {isVerifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              {isVerifying ? 'Checking Ledger...' : 'Verify Hash'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Verification Result Display */}
      {verificationResult && (
        <div>
          {verificationResult.exists ? (
            verificationResult.revoked ? (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-5 space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="font-semibold text-amber-900 text-sm">Certificate Status: Revoked</span>
                </div>
                <p className="text-amber-800">
                  This document hash exists on-chain, but was officially revoked by the issuing authority.
                </p>
                <div className="bg-white border border-amber-200 rounded p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                  <div><strong>Document Type:</strong> {verificationResult.documentType}</div>
                  <div><strong>Recipient:</strong> {verificationResult.recipient}</div>
                  <div><strong>Issuer:</strong> <code className="font-mono text-[11px]">{verificationResult.issuer}</code></div>
                  <div><strong>Issue Date:</strong> {new Date(verificationResult.issueDate).toLocaleDateString()}</div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-b from-emerald-50/80 via-white to-white border-2 border-emerald-500 rounded-xl p-6 shadow-lg shadow-emerald-600/10 space-y-5 transition-all">
                {/* Header with Prominent Verified Seal */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-200 gap-3">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/25 ring-4 ring-emerald-500/20 shrink-0">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-xs">
                          <CheckCheck className="w-3 h-3" />
                          Verified Authentic
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                          On-Chain Valid
                        </span>
                      </div>
                      <h4 className="text-lg font-bold text-emerald-950 mt-1">
                        Document Verified Authentic
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Cryptographic fingerprint matches on-chain record on CertificateRegistry smart contract.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={resetVerifier}
                    className="self-start sm:self-center px-3.5 py-1.5 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Structured High-Contrast Credential Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3.5 bg-white border border-emerald-200 rounded-lg shadow-2xs hover:border-emerald-300 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Document Type</span>
                    </div>
                    <span className="text-slate-900 font-bold text-sm block">
                      {verificationResult.documentType || "Degree Certificate"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-white border border-emerald-200 rounded-lg shadow-2xs hover:border-emerald-300 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">
                      <User className="w-3.5 h-3.5" />
                      <span>Recipient</span>
                    </div>
                    <span className="text-slate-900 font-bold text-sm block">
                      {verificationResult.recipient || "N/A"}
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3.5 bg-white border border-emerald-200 rounded-lg shadow-2xs hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold uppercase tracking-wider">
                        <Fingerprint className="w-3.5 h-3.5" />
                        <span>Cryptographic Fingerprint</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Keccak-256 Ledger Hash
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="font-mono text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md block flex-1 break-all select-all">
                        {verificationResult.hash}
                      </code>
                      <button
                        onClick={copyHash}
                        className="p-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all shrink-0 cursor-pointer active:scale-95"
                        title="Copy Fingerprint"
                      >
                        {copied ? (
                          <CheckCheck className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-white border border-emerald-200 rounded-lg shadow-2xs hover:border-emerald-300 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Date Issued</span>
                    </div>
                    <span className="text-slate-900 font-semibold text-xs block">
                      {new Date(verificationResult.issueDate).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-white border border-emerald-200 rounded-lg shadow-2xs hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold uppercase tracking-wider">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Issuing Authority</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        ISSUER_ROLE
                      </span>
                    </div>
                    <code className="font-mono text-xs font-semibold text-slate-900 truncate block mt-1">
                      {verificationResult.issuer}
                    </code>
                  </div>
                </div>

                {/* Proof Guarantee Notice */}
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    Verified Authentic: Immutable cryptographic proof stored on-chain. Zero gas fees required for public verification.
                  </span>
                </div>
              </div>
            )
          ) : (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-5 space-y-2 text-xs text-rose-900">
              <div className="flex items-center gap-2">
                <FileQuestion className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="font-semibold text-sm">No Record Found on Blockchain</span>
              </div>
              <p className="text-rose-800">
                This document fingerprint does not exist in the Certificate Registry. The document may not have been registered, or its contents may have been altered.
              </p>
              <code className="block bg-white border border-rose-200 p-2 rounded font-mono text-[11px] text-rose-800 break-all">
                {verificationResult.hash}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
