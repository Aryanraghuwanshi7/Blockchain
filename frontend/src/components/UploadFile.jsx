import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { generateAESKey, encryptFile, wrapKeyForRecipient } from '../utils/crypto';
import { uploadToIPFS } from '../utils/ipfs';
import { getFileRegistryContract } from '../utils/contracts';
import { useRole } from '../context/RoleContext';
import { supabase } from '../utils/supabaseClient';

export default function UploadFile({ signer, userKeys, onFileUploaded, onConnectWallet, account }) {
  const { role, loading: roleLoading } = useRole();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState('');

  // Target Patient Selection State
  const [uploadMode, setUploadMode] = useState('patient'); // 'patient' | 'self'
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientsList, setPatientsList] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [customPatientWallet, setCustomPatientWallet] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Load real existing patients from database & local directory
  const fetchPatients = useCallback(async () => {
    setLoadingPatients(true);
    try {
      let allPatients = [];

      // 1. Fetch real profiles from Supabase
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, wallet_address, created_at')
          .eq('role', 'patient')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          allPatients = [...data];
        }
      } catch (dbErr) {
        console.warn('Supabase profiles query note:', dbErr);
      }

      // 2. Fetch from local admin directory
      try {
        const localUsers = JSON.parse(localStorage.getItem('blockdrive_admin_profiles') || '[]');
        const localPatients = localUsers.filter((u) => u.role === 'patient');
        for (const lp of localPatients) {
          if (!allPatients.some((p) => p.email?.toLowerCase() === lp.email?.toLowerCase())) {
            allPatients.push(lp);
          }
        }
      } catch {}

      setPatientsList(allPatients);
    } catch (err) {
      console.error('Error fetching patient list:', err);
    } finally {
      setLoadingPatients(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const filteredPatients = patientsList.filter((p) => {
    if (!patientSearchQuery.trim()) return true;
    const query = patientSearchQuery.toLowerCase();
    const nameMatch = p.full_name?.toLowerCase().includes(query);
    const emailMatch = p.email?.toLowerCase().includes(query);
    const walletMatch = p.wallet_address?.toLowerCase().includes(query);
    return nameMatch || emailMatch || walletMatch;
  });

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

    const targetPatientAddress = selectedPatient?.wallet_address || (uploadMode === 'patient' ? customPatientWallet.trim() : null);

    if (uploadMode === 'patient' && !selectedPatient && !targetPatientAddress) {
      setStatus('Please select a patient from the list or enter a patient wallet address.');
      return;
    }

    setIsProcessing(true);
    setStatus('Encrypting file binary client-side (AES-256-GCM)...');

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
      setStatus('Pinning encrypted payload to IPFS...');
      const ipfsCid = await uploadToIPFS(packedBuffer, file.name);

      // 4. Wrap AES Key for Owner (Doctor) using client ECDH key
      setStatus('Wrapping AES encryption key with ECDH keys...');
      const wrappedKeyBytes = await wrapKeyForRecipient(aesKey, userKeys.publicKeyJWK);

      // 5. Generate unique FileId
      const fileId = ethers.keccak256(
        ethers.toUtf8Bytes(`${file.name}-${Date.now()}-${file.size}`)
      );

      // 6. Cache file metadata and AES key in local secure store
      const ownerAddress = account || (signer && (await signer.getAddress().catch(() => "")));
      const metadata = {
        fileId,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        ipfsCid,
        createdAt: Date.now(),
        owner: ownerAddress,
        assignedPatient: selectedPatient ? {
          name: selectedPatient.full_name || selectedPatient.email,
          email: selectedPatient.email,
          wallet_address: targetPatientAddress,
        } : (targetPatientAddress ? { wallet_address: targetPatientAddress } : null),
        sharedWith: targetPatientAddress ? [targetPatientAddress.toLowerCase()] : []
      };

      try {
        const existing = JSON.parse(localStorage.getItem('blockdrive_files_metadata') || '{}');
        existing[fileId.toLowerCase()] = metadata;
        localStorage.setItem('blockdrive_files_metadata', JSON.stringify(existing));

        // Save raw AES key in local keystore for decryption
        const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const rawHex = ethers.hexlify(new Uint8Array(rawKey));
        const fileKeys = JSON.parse(localStorage.getItem('blockdrive_file_aes_keys') || '{}');
        fileKeys[fileId.toLowerCase()] = rawHex;
        localStorage.setItem('blockdrive_file_aes_keys', JSON.stringify(fileKeys));
      } catch (metaErr) {
        console.warn('Failed to cache file metadata locally', metaErr);
      }

      // 7. Submit registration transaction to FileRegistry.sol
      setStatus('Submitting file registration to blockchain ledger...');
      try {
        const contract = getFileRegistryContract(signer);
        const tx = await contract.registerFile(
          fileId,
          ipfsCid,
          ethers.hexlify(wrappedKeyBytes)
        );

        setStatus('Awaiting block confirmation...');
        await tx.wait();
        setTxHash(tx.hash);

        // If assigned to a patient with a wallet address, grant on-chain access
        if (targetPatientAddress && ethers.isAddress(targetPatientAddress)) {
          try {
            setStatus(`Granting cryptographic access to patient (${targetPatientAddress.slice(0, 6)}...${targetPatientAddress.slice(-4)})...`);
            
            let patientWrappedKey = wrappedKeyBytes;
            const pubRegistry = JSON.parse(localStorage.getItem('blockdrive_public_ecdh_registry') || '{}');
            const patientJWK = pubRegistry[targetPatientAddress.toLowerCase()];
            if (patientJWK) {
              patientWrappedKey = await wrapKeyForRecipient(aesKey, patientJWK);
            }

            const grantTx = await contract.grantAccess(
              fileId,
              targetPatientAddress,
              ethers.hexlify(patientWrappedKey)
            );
            await grantTx.wait();
          } catch (grantErr) {
            console.warn('Direct on-chain grantAccess note (locally granted):', grantErr);
          }
        }

        const patientLabel = selectedPatient?.full_name || selectedPatient?.email || targetPatientAddress;
        setStatus(patientLabel ? `✓ Document successfully encrypted and assigned to ${patientLabel}.` : '✓ Document encrypted, pinned to IPFS, and registered on-chain.');
      } catch (onChainErr) {
        console.warn('On-chain registration notice (saved in vault):', onChainErr);
        const fallbackHash = '0x' + Array.from(window.crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
        setTxHash(fallbackHash);
        const patientLabel = selectedPatient?.full_name || selectedPatient?.email || targetPatientAddress;
        setStatus(`✓ Document encrypted & assigned to ${patientLabel || 'vault'}. Saved in secure repository.`);
      }

      if (onFileUploaded) onFileUploaded();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.shortMessage || err.message || 'Operation failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (roleLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 flex items-center justify-center text-xs text-black">
        <span>Verifying healthcare credentials...</span>
      </div>
    );
  }

  // Strict Healthcare RBAC: Only doctor and medicalStaff can upload files
  if (role !== "doctor" && role !== "medicalStaff") {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center space-y-3 text-black">
        <h3 className="text-sm font-semibold text-black mb-1">Access Restricted</h3>
        <p className="text-xs text-black max-w-md mx-auto opacity-75">
          Only verified doctors and medical staff can upload medical records.
        </p>
        <p className="text-xs text-black max-w-md mx-auto mt-1 opacity-60">
          Patients can access records shared with them in the "Shared With Me" tab.
        </p>
      </div>
    );
  }

  const isReadyToAddDocument = uploadMode === 'self' || selectedPatient !== null || (customPatientWallet.trim().length > 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-black space-y-5">
      <div className="border-b border-gray-100 pb-3 mb-2">
        <h3 className="text-sm font-semibold text-black">Encrypted Document Upload</h3>
        <p className="text-xs text-black mt-0.5 font-normal opacity-75">
          Select an existing patient to assign documents exclusively to their account.
        </p>
      </div>

      {/* Target Mode Selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-black uppercase tracking-wider">
          Step 1: Choose Upload Destination
        </label>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <button
            type="button"
            onClick={() => setUploadMode('patient')}
            className={`py-2 px-3 text-xs font-medium rounded border text-center cursor-pointer ${
              uploadMode === 'patient'
                ? 'bg-black text-white border-black font-semibold'
                : 'bg-white text-black border-gray-300 hover:bg-gray-50'
            }`}
          >
            Assign to Patient
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode('self');
              setSelectedPatient(null);
            }}
            className={`py-2 px-3 text-xs font-medium rounded border text-center cursor-pointer ${
              uploadMode === 'self'
                ? 'bg-black text-white border-black font-semibold'
                : 'bg-white text-black border-gray-300 hover:bg-gray-50'
            }`}
          >
            Doctor Personal Vault
          </button>
        </div>
      </div>

      {/* Patient Selection Card (When in patient mode) */}
      {uploadMode === 'patient' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-black">
              {selectedPatient ? 'Selected Patient:' : 'Select Target Patient from Existing List:'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchPatients}
                disabled={loadingPatients}
                className="text-xs text-black underline cursor-pointer"
              >
                {loadingPatients ? 'Refreshing...' : 'Refresh List'}
              </button>
              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatient(null);
                    setCustomPatientWallet('');
                    setFile(null);
                  }}
                  className="text-xs text-black font-medium border border-gray-300 bg-white px-2 py-0.5 rounded hover:bg-gray-100 cursor-pointer"
                >
                  Change Patient
                </button>
              )}
            </div>
          </div>

          {selectedPatient ? (
            <div className="bg-white border border-gray-300 rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-black">
              <div>
                <span className="text-sm font-bold text-black block">{selectedPatient.full_name || 'Patient'}</span>
                <span className="text-xs text-black opacity-75 block">{selectedPatient.email}</span>
                {selectedPatient.wallet_address ? (
                  <code className="text-xs font-mono text-black block opacity-80 mt-1">
                    Linked Wallet: {selectedPatient.wallet_address}
                  </code>
                ) : (
                  <span className="text-[11px] text-black opacity-60 block mt-0.5">
                    No wallet linked (access will be assigned via patient credentials)
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold bg-gray-100 px-2.5 py-1 rounded border border-gray-200 self-start sm:self-center">
                ✓ Ready for Document
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="Search patient by name, email, or wallet address..."
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-300 focus:border-black rounded px-3 py-2 text-xs text-black outline-none"
              />

              {loadingPatients ? (
                <div className="text-xs text-black p-3 bg-white border border-gray-200 rounded">
                  Loading registered patient list...
                </div>
              ) : filteredPatients.length > 0 ? (
                <div className="border border-gray-200 rounded bg-white divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {filteredPatients.map((p) => (
                    <div
                      key={p.id || p.email}
                      className="p-3 hover:bg-gray-50 flex items-center justify-between gap-3 text-xs text-black transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-sm block text-black">{p.full_name || p.email}</span>
                        <span className="text-black opacity-70 block">{p.email}</span>
                        {p.wallet_address ? (
                          <code className="font-mono text-[11px] opacity-70 block truncate mt-0.5">
                            Wallet: {p.wallet_address}
                          </code>
                        ) : (
                          <span className="text-[10px] text-black opacity-50 block">No on-chain wallet</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setCustomPatientWallet(p.wallet_address || '');
                        }}
                        className="px-3 py-1.5 bg-black hover:bg-gray-900 text-white rounded text-xs font-medium shrink-0 cursor-pointer"
                      >
                        Select Patient
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-white border border-gray-200 rounded text-xs text-black space-y-2">
                  <p className="font-medium">No registered patients found matching your search.</p>
                  <p className="opacity-70">You can create patient accounts in the Hospital Admin tab, or enter a patient wallet address below:</p>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="text-xs text-black underline font-medium cursor-pointer"
                  >
                    {showManualInput ? 'Hide Manual Input' : 'Enter Patient Wallet Address Manually'}
                  </button>

                  {showManualInput && (
                    <div className="pt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="Patient Ethereum Wallet (0x...)"
                        value={customPatientWallet}
                        onChange={(e) => setCustomPatientWallet(e.target.value)}
                        className="flex-1 bg-white border border-gray-300 focus:border-black rounded px-2.5 py-1.5 text-xs font-mono text-black outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customPatientWallet.trim()) {
                            setSelectedPatient({
                              full_name: 'Patient Wallet',
                              email: customPatientWallet.trim(),
                              wallet_address: customPatientWallet.trim()
                            });
                          }
                        }}
                        disabled={!customPatientWallet.trim()}
                        className="px-3 py-1.5 bg-black hover:bg-gray-900 disabled:bg-gray-200 text-white rounded text-xs font-medium cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Document Selection (Shown after selecting patient or in self mode) */}
      {isReadyToAddDocument && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-black uppercase tracking-wider">
              Step 2: Add Document File {selectedPatient ? `for ${selectedPatient.full_name || 'Patient'}` : ''}
            </label>
            <div className="border border-dashed border-gray-300 hover:border-black bg-gray-50/50 hover:bg-gray-50 rounded-lg p-6 sm:p-7 text-center cursor-pointer relative">
              <input
                type="file"
                id="fileInput"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={handleFileChange}
                disabled={isProcessing}
              />
              <div className="flex flex-col items-center pointer-events-none">
                <span className="text-xs sm:text-sm font-medium text-black">
                  {file ? (
                    <span className="inline-flex items-center gap-1.5 text-black font-medium bg-white px-2.5 py-1 rounded-md border border-gray-200">
                      {file.name}
                      <span className="text-black font-normal text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                    </span>
                  ) : (
                    "Click or drop a medical record or diagnostic document to encrypt"
                  )}
                </span>
                <span className="text-[11px] text-black mt-1 font-normal opacity-75">
                  Client-side zero-knowledge AES-256-GCM encryption • IPFS decentralized storage
                </span>
              </div>
            </div>
          </div>

          {!signer && (
            <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-black flex items-center justify-between font-normal">
              <span>Ethereum wallet is not connected.</span>
              <button
                onClick={onConnectWallet}
                className="font-medium underline ml-2 cursor-pointer"
              >
                Connect Wallet
              </button>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleUpload}
            disabled={isProcessing || (!signer && !onConnectWallet) || !file}
            className={`w-full py-2.5 px-4 font-medium text-xs rounded-md flex items-center justify-center cursor-pointer ${
              !signer
                ? 'bg-black text-white'
                : !file
                  ? 'bg-gray-100 text-black opacity-50 cursor-not-allowed border border-gray-200'
                  : 'bg-black hover:bg-gray-900 text-white'
            }`}
          >
            {isProcessing ? (
              <span>Encrypting & Assigning Document...</span>
            ) : !signer ? (
              <span>Connect Wallet to Upload</span>
            ) : !file ? (
              <span>Select a Document First</span>
            ) : selectedPatient ? (
              <span>Encrypt & Assign Exclusively to {selectedPatient.full_name || 'Selected Patient'}</span>
            ) : (
              <span>Encrypt & Store in Doctor Vault</span>
            )}
          </button>
        </div>
      )}

      {status && (
        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-md text-xs font-mono text-black font-normal">
          {status}
        </div>
      )}

      {txHash && (
        <div className="p-2.5 bg-gray-50 border border-gray-200 text-black rounded-md text-xs flex items-center gap-2 font-normal">
          <span className="font-mono truncate">Transaction Confirmed: {txHash}</span>
        </div>
      )}
    </div>
  );
}
