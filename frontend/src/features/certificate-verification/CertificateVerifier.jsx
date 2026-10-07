import React, { useState, useEffect } from 'react';
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
    <div className="space-y-5 text-black">
      {/* Header Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black">
        <h3 className="text-sm font-semibold text-black mb-1">Document Verification Portal</h3>
        <p className="text-xs text-black font-normal opacity-75">
          Public, trustless verification of document integrity against on-chain records. No wallet required.
        </p>
      </div>

      {/* Main Verification Input Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 space-y-4 text-black">
        {/* Upload File Section */}
        <div>
          <label className="block text-xs font-semibold text-black uppercase tracking-wider mb-1">
            1. Document File Verification
          </label>
          <div className="border border-dashed border-gray-300 hover:border-black rounded-lg p-6 text-center cursor-pointer relative bg-white">
            <input
              type="file"
              id="verifyFileInput"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileChange}
              disabled={isVerifying}
            />
            <div className="flex flex-col items-center pointer-events-none text-black">
              <span className="text-sm font-medium text-black">
                {file ? (
                  <span className="inline-block font-semibold bg-gray-50 px-3 py-1 rounded border border-gray-300">
                    {file.name}
                  </span>
                ) : (
                  'Select or drop document to verify'
                )}
              </span>
              <span className="text-xs text-black opacity-60 mt-1">
                The file remains in your browser; only its cryptographic hash is verified against the ledger
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-semibold text-black uppercase opacity-50">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Manual Hash Input */}
        <div>
          <label className="block text-xs font-semibold text-black uppercase tracking-wide mb-1.5">
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
                className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs font-mono text-black outline-none"
              />
              {documentHash && (
                <button
                  type="button"
                  onClick={copyHash}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-xs text-black hover:opacity-60 cursor-pointer"
                  title="Copy Hash"
                >
                  {copied ? '[Copied]' : '[Copy]'}
                </button>
              )}
            </div>

            <button
              onClick={() => handleVerifyHash(documentHash)}
              disabled={isVerifying || !documentHash.trim()}
              className="px-4 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-200 disabled:text-black text-white rounded text-xs font-medium flex items-center justify-center cursor-pointer"
            >
              {isVerifying ? 'Checking Ledger...' : 'Verify Hash'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-gray-50 border border-gray-300 text-black rounded text-xs">
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Verification Result Display */}
      {verificationResult && (
        <div className="text-black">
          {verificationResult.exists ? (
            verificationResult.revoked ? (
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5 space-y-3 text-xs text-black">
                <span className="font-semibold text-black text-sm block">Certificate Status: Revoked</span>
                <p className="text-black opacity-80">
                  This document hash exists on-chain, but was officially revoked by the issuing authority.
                </p>
                <div className="bg-white border border-gray-200 rounded p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-black">
                  <div><strong>Document Type:</strong> {verificationResult.documentType}</div>
                  <div><strong>Recipient:</strong> {verificationResult.recipient}</div>
                  <div><strong>Issuer:</strong> <code className="font-mono text-xs">{verificationResult.issuer}</code></div>
                  <div><strong>Issue Date:</strong> {new Date(verificationResult.issueDate).toLocaleDateString()}</div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-5 text-black">
                {/* Header with Verified Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-200 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider bg-black text-white px-2 py-0.5 rounded">
                        Verified Authentic
                      </span>
                      <span className="text-xs font-semibold text-black bg-gray-100 border border-gray-300 px-2 py-0.5 rounded">
                        On-Chain Valid
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-black mt-1">
                      Document Verified Authentic
                    </h4>
                    <p className="text-xs text-black opacity-75 mt-0.5">
                      Cryptographic fingerprint matches on-chain record on CertificateRegistry smart contract.
                    </p>
                  </div>

                  <button
                    onClick={resetVerifier}
                    className="self-start sm:self-center px-3.5 py-1.5 bg-white hover:bg-gray-50 text-black border border-gray-300 rounded text-xs font-semibold cursor-pointer"
                  >
                    Reset
                  </button>
                </div>

                {/* Structured Credential Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-black">
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded">
                    <div className="text-xs text-black font-semibold uppercase tracking-wider mb-1 opacity-75">
                      Document Type
                    </div>
                    <span className="text-black font-bold text-sm block">
                      {verificationResult.documentType || "Degree Certificate"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded">
                    <div className="text-xs text-black font-semibold uppercase tracking-wider mb-1 opacity-75">
                      Recipient
                    </div>
                    <span className="text-black font-bold text-sm block">
                      {verificationResult.recipient || "N/A"}
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3.5 bg-gray-50 border border-gray-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-black font-semibold uppercase tracking-wider opacity-75">
                        Cryptographic Fingerprint
                      </div>
                      <span className="text-xs font-mono text-black bg-white px-1.5 py-0.5 rounded border border-gray-200">
                        Keccak-256 Ledger Hash
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="font-mono text-xs font-semibold text-black bg-white border border-gray-200 px-2.5 py-1.5 rounded block flex-1 break-all select-all">
                        {verificationResult.hash}
                      </code>
                      <button
                        onClick={copyHash}
                        className="px-2 py-1.5 rounded bg-white hover:bg-gray-100 text-black border border-gray-300 text-xs shrink-0 cursor-pointer"
                        title="Copy Fingerprint"
                      >
                        {copied ? '[Copied]' : '[Copy]'}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded">
                    <div className="text-xs text-black font-semibold uppercase tracking-wider mb-1 opacity-75">
                      Date Issued
                    </div>
                    <span className="text-black font-semibold text-xs block">
                      {new Date(verificationResult.issueDate).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-black font-semibold uppercase tracking-wider opacity-75">
                        Issuing Authority
                      </div>
                      <span className="text-xs text-black bg-white px-1.5 py-0.5 rounded border border-gray-200">
                        ISSUER_ROLE
                      </span>
                    </div>
                    <code className="font-mono text-xs font-semibold text-black truncate block mt-1">
                      {verificationResult.issuer}
                    </code>
                  </div>
                </div>

                {/* Proof Guarantee Notice */}
                <div className="bg-gray-50 border border-gray-300 rounded p-3 text-xs text-black">
                  <span className="font-medium">
                    Verified Authentic: Immutable cryptographic proof stored on-chain. Zero gas fees required for public verification.
                  </span>
                </div>
              </div>
            )
          ) : (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-5 space-y-2 text-xs text-black">
              <span className="font-semibold text-sm block">No Record Found on Blockchain</span>
              <p className="text-black opacity-80">
                This document fingerprint does not exist in the Certificate Registry. The document may not have been registered, or its contents may have been altered.
              </p>
              <code className="block bg-white border border-gray-200 p-2 rounded font-mono text-xs text-black break-all">
                {verificationResult.hash}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
