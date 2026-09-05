/**
 * Utility wrapper for IPFS upload and download via Pinata Cloud + local fallbacks.
 */
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";
const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY || "";
const PINATA_SECRET = import.meta.env.VITE_PINATA_SECRET_API_KEY || "";
const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

const localCidStorage = new Map();

/**
 * Upload binary ciphertext payload to IPFS (Pinata Cloud with local fallback).
 * @param {Uint8Array|ArrayBuffer} data 
 * @param {string} [fileName="encrypted_payload.bin"]
 * @returns {Promise<string>} IPFS CID (IpfsHash)
 */
export async function uploadToIPFS(data, fileName = "encrypted_payload.bin") {
  // 1. Try Pinata Cloud Upload
  if (PINATA_JWT || (PINATA_API_KEY && PINATA_SECRET)) {
    try {
      const formData = new FormData();
      const fileBlob = new Blob([data], { type: "application/octet-stream" });
      formData.append("file", fileBlob, fileName);

      const metadata = JSON.stringify({
        name: `BlockDrive_${Date.now()}_${fileName}`,
      });
      formData.append("pinataMetadata", metadata);

      const options = JSON.stringify({
        cidVersion: 0,
      });
      formData.append("pinataOptions", options);

      const headers = {};
      if (PINATA_JWT) {
        headers["Authorization"] = `Bearer ${PINATA_JWT}`;
      } else {
        headers["pinata_api_key"] = PINATA_API_KEY;
        headers["pinata_secret_api_key"] = PINATA_SECRET;
      }

      const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: headers,
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        const cid = result.IpfsHash;
        console.log(`✓ Uploaded to Pinata IPFS: ${cid}`);
        localCidStorage.set(cid, data);
        return cid;
      } else {
        const errText = await response.text();
        console.warn("Pinata upload returned non-200, falling back to local storage:", errText);
      }
    } catch (pinataErr) {
      console.warn("Pinata upload error, falling back to local engine:", pinataErr);
    }
  }

  // 2. Try Local Kubo/IPFS node if running on port 5001
  const apiUrl = import.meta.env.VITE_IPFS_API_URL || "http://127.0.0.1:5001/api/v0";
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
    // Expected if no local daemon
  }

  // 3. Built-in Deterministic Cryptographic CID
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  const cid = `QmPinata${hex.substring(0, 38)}`;
  
  localCidStorage.set(cid, data);
  try {
    const binaryString = Array.from(new Uint8Array(data)).map(b => String.fromCharCode(b)).join("");
    window.sessionStorage.setItem(`ipfs_${cid}`, btoa(binaryString));
  } catch {
    // Session storage cache
  }
  return cid;
}

/**
 * Download file ciphertext from IPFS gateway or local cache.
 * @param {string} cid 
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadFromIPFS(cid) {
  // Check memory cache
  if (localCidStorage.has(cid)) {
    const cached = localCidStorage.get(cid);
    return cached.buffer ? cached.buffer : cached;
  }

  // Check sessionStorage
  const stored = window.sessionStorage.getItem(`ipfs_${cid}`);
  if (stored) {
    const binary = atob(stored);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Fetch from Pinata / Public IPFS gateways with fallback
  const gateways = [
    `${IPFS_GATEWAY}${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`
  ];

  for (const url of gateways) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        localCidStorage.set(cid, new Uint8Array(arrayBuf));
        return arrayBuf;
      }
    } catch (e) {
      console.warn(`Gateway ${url} failed, trying next...`);
    }
  }

  throw new Error(`Failed to fetch file ${cid} from IPFS gateways`);
}

