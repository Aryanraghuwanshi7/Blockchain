/**
 * @fileoverview Pure cryptographic utility module using Web Crypto API.
 * Provides AES-256-GCM symmetric encryption for files and ECIES-style key encapsulation.
 */

/**
 * Generate an AES-GCM 256-bit symmetric encryption key.
 * @returns {Promise<CryptoKey>}
 */
export async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a binary file buffer using AES-256-GCM.
 * @param {ArrayBuffer} fileBuffer Plaintext file data.
 * @param {CryptoKey} aesKey 256-bit AES-GCM CryptoKey.
 * @returns {Promise<{ ciphertext: ArrayBuffer, iv: Uint8Array }>}
 */
export async function encryptFile(fileBuffer, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV recommended for AES-GCM
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    fileBuffer
  );

  return { ciphertext, iv };
}

/**
 * Decrypt a ciphertext buffer using AES-256-GCM.
 * @param {ArrayBuffer} ciphertext Encrypted data buffer.
 * @param {Uint8Array} iv Initialization vector (12 bytes).
 * @param {CryptoKey} aesKey 256-bit AES-GCM CryptoKey.
 * @returns {Promise<ArrayBuffer>} Decrypted file buffer.
 */
export async function decryptFile(ciphertext, iv, aesKey) {
  return await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    ciphertext
  );
}

/**
 * Export a raw AES key to binary Uint8Array.
 * @param {CryptoKey} aesKey 
 * @returns {Promise<Uint8Array>}
 */
export async function exportRawKey(aesKey) {
  const raw = await window.crypto.subtle.exportKey("raw", aesKey);
  return new Uint8Array(raw);
}

/**
 * Import raw binary key bytes back into an AES-GCM CryptoKey.
 * @param {ArrayBuffer|Uint8Array} keyBytes 
 * @returns {Promise<CryptoKey>}
 */
export async function importRawKey(keyBytes) {
  return await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Wrap an AES key for a recipient using ECDH + AES Key Wrap (ECIES style).
 * Standard choice: generates ephemeral ECDH P-256 key pair to derive wrapping key.
 * @param {CryptoKey} aesKey Symmetric key to wrap.
 * @param {JsonWebKey} recipientPublicJWK Recipient's ECDH P-256 public key.
 * @returns {Promise<Uint8Array>} JSON-encoded payload containing ephemeral public key, IV, and wrapped AES key.
 */
export async function wrapKeyForRecipient(aesKey, recipientPublicJWK) {
  const recipientKey = await window.crypto.subtle.importKey(
    "jwk",
    recipientPublicJWK,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const ephemeralKeyPair = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const wrappingKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientKey },
    ephemeralKeyPair.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const wrapIv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedKeyBytes = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv },
    wrappingKey,
    rawAesKey
  );

  const ephemeralPubJWK = await window.crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey);
  
  const payload = {
    ephemPub: ephemeralPubJWK,
    iv: Array.from(wrapIv),
    data: Array.from(new Uint8Array(encryptedKeyBytes))
  };

  return new TextEncoder().encode(JSON.stringify(payload));
}

/**
 * Unwrap an AES key using the recipient's private ECDH key.
 * @param {Uint8Array} wrappedPayload JSON-encoded payload.
 * @param {JsonWebKey} recipientPrivateJWK Recipient's ECDH P-256 private key.
 * @returns {Promise<CryptoKey>} Unwrapped AES-GCM CryptoKey.
 */
export async function unwrapKeyForRecipient(wrappedPayload, recipientPrivateJWK) {
  const payloadStr = new TextDecoder().decode(wrappedPayload);
  const payload = JSON.parse(payloadStr);

  const recipientPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    recipientPrivateJWK,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );

  const ephemPubKey = await window.crypto.subtle.importKey(
    "jwk",
    payload.ephemPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const unwrappingKey = await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemPubKey },
    recipientPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decryptedRawKey = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
    unwrappingKey,
    new Uint8Array(payload.data)
  );

  return await importRawKey(decryptedRawKey);
}
