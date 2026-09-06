# BlockDrive Architecture & Phased Implementation

## On-Chain vs. Off-Chain Split

### On-Chain Components (Ethereum / Solidity ^0.8.20)
- **`BlockDriveAccessControl.sol`**: Manages administrative roles and multi-attribute bitmasks for identity classification.
- **`FileRegistry.sol`**: Maintains file metadata records (`fileId`, `ipfsCid`, `ownerAddress`, `createdAt`) and mapping of per-recipient wrapped encryption keys (`_wrappedKeys[fileId][recipient]`).
- **Authorization Verifications**: On-chain validation of file existence and recipient authorization states.

### Off-Chain Components (Client & IPFS)
- **Client Cryptographic Engine**: AES-256-GCM symmetric file encryption and ECIES-style ECDH (P-256) key encapsulation via the Web Crypto API.
- **Decentralized Storage**: Encrypted payloads stored on IPFS, addressed by immutable Content Identifiers (CIDs).
- **Key Decapsulation**: Client-side execution of ECDH key derivation and AES-GCM file decryption.

---

## Phased Feature Status Matrix

| Component | Status | Description / Notes |
|---|---|---|
| **Symmetric File Encryption (AES-GCM)** | **Implemented** | 256-bit AES-GCM client-side encryption with 96-bit random IVs. |
| **ECIES Key Encapsulation** | **Implemented** | Ephemeral ECDH key derivation with wrapped keys stored in `FileRegistry`. |
| **Attribute Role Registry** | **Implemented** | Bitmask attribute checking via OpenZeppelin AccessControl. |
| **Full CP-ABE (Ciphertext-Policy ABE)** | *Designed (Phased M3)* | Pairing-based CP-ABE algorithms (e.g. BSW07) designed for future WASM integration. |
| **zk-SNARK Policy Verification** | *Designed (Phased M4)* | Zero-knowledge proof verification of attribute satisfaction without revealing attribute sets. |
| **Encrypted Keyword Search** | *Designed (Phased M3)* | Searchable symmetric encryption (SSE) inverted index over encrypted CIDs. |
| **Instant Dynamic Revocation** | *Stubbed / Phased M3* | Stubbed in `FileRegistry.revokeRecipient` with `AdvancedRevocationNotImplemented`; requires proxy re-encryption. |
| **Anomaly Detection Watcher** | *Designed (Phased M4)* | Off-chain heuristic/oracle monitoring anomalous download frequencies. |
| **Document / Certificate Verification** | **Implemented** | Independent on-chain fingerprint registry (`CertificateRegistry.sol`) with role-gated issuance and public gas-free verification. |

---

## Independent Module: Document & Certificate Verification
- **`CertificateRegistry.sol`**: A standalone on-chain registry allowing designated authorities (`ISSUER_ROLE`) to publish document fingerprints (Keccak-256) with recipient metadata and revocation controls.
- **Gas-Free Public Verification**: Anyone can verify any document's authenticity and tamper-proof state without a crypto wallet using client-side cryptographic hashing.
