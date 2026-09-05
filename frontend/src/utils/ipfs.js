/**
 * Utility wrapper for IPFS upload and download.
 */
const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "https://ipfs.io/ipfs/";
const localCidStorage = new Map();

/**
 * Upload binary payload to IPFS node / service with local development fallback.
 * @param {Uint8Array|ArrayBuffer} data 
 * @returns {Promise<string>} IPFS CID
 */
export async function uploadToIPFS(data) {
  const apiUrl = import.meta.env.VITE_IPFS_API_URL || "http://127.0.0.1:5001/api/v0";
  
  // Try real IPFS node with 1s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const formData = new FormData();
    formData.append("file", new Blob([data]));

    const response = await fetch(`${apiUrl}/add`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      const cid = result.Hash || result.cid;
      localCidStorage.set(cid, data);
      return cid;
    }
  } catch {
    // Expected in environments without local Kubo/IPFS node running
  }

  // Deterministic local CID based on SHA-256
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  const cid = `QmLocalMock${hex.substring(0, 38)}`;
  
  // Cache in memory for seamless local decryption & retrieval
  localCidStorage.set(cid, data);
  try {
    const binaryString = Array.from(new Uint8Array(data)).map(b => String.fromCharCode(b)).join("");
    window.sessionStorage.setItem(`ipfs_${cid}`, btoa(binaryString));
  } catch {
    // If payload is large for sessionStorage, memory Map suffices
  }
  return cid;
}

/**
 * Download file ciphertext from IPFS gateway or local storage.
 * @param {string} cid 
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadFromIPFS(cid) {
  if (localCidStorage.has(cid)) {
    const cached = localCidStorage.get(cid);
    return cached.buffer ? cached.buffer : cached;
  }

  const stored = window.sessionStorage.getItem(`ipfs_${cid}`);
  if (stored) {
    const binary = atob(stored);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const url = `${IPFS_GATEWAY}${cid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
  }
  return await response.arrayBuffer();
}
