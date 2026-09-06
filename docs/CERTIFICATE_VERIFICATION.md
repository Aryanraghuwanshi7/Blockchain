# Document & Certificate Verification Module

## Overview
The **Document / Certificate Verification** module is a self-contained, trustless feature within BlockDrive that allows authorized authorities (e.g. universities, government offices, medical boards, or enterprises) to register digital document fingerprints on the Ethereum blockchain. Any third party can verify the authenticity and integrity of a document without needing a crypto wallet, paying gas fees, or registering an account.

---

## Architecture & Design Principles

```
+--------------------------------------------------------------------------------+
|                             CertificateRegistry.sol                            |
|  - OpenZeppelin AccessControl (DEFAULT_ADMIN_ROLE, ISSUER_ROLE)                |
|  - Cryptographic Fingerprints (Keccak-256)                                     |
|  - Independent Lifecycle: Issue, Verify (Read-Only), Revoke                    |
+--------------------------------------------------------------------------------+
             ▲                                              ▲
             │                                              │
(1) Issue Certificate (Wallet + ISSUER_ROLE)   (2) Verify Document (Public / Free)
             │                                              │
+------------------------------------+         +---------------------------------+
|       CertificateIssuer.jsx        |         |      CertificateVerifier.jsx    |
| - Drag & drop file upload          |         | - Drag & drop file or paste hash|
| - Real-time Keccak-256 computation |         | - Client-side Keccak-256        |
| - On-chain registration            |         | - Free public verification      |
| - Shareable verification URL & slip|         | - Instant Authenticity Report   |
+------------------------------------+         +---------------------------------+
```

### 1. Smart Contract: `CertificateRegistry.sol`
* **Location:** [`contracts/CertificateRegistry.sol`](file:///Users/aryanraghuwanshi/Block_chain/contracts/CertificateRegistry.sol)
* **Access Control:** Employs OpenZeppelin `AccessControl` with `ISSUER_ROLE`. Only designated issuers can register documents; only the original issuing address or `DEFAULT_ADMIN_ROLE` can revoke an issued credential.
* **Storage Schema (`CertificateRecord`):**
  * `bytes32 certificateHash`: Unique Keccak-256 cryptographic digest of document bytes.
  * `address issuerAddress`: Ethereum address of the certified issuing authority.
  * `string recipientName`: Recipient identity or credential holder name/ID.
  * `uint256 issueDate`: Block timestamp when registered on-chain.
  * `string documentType`: Category (e.g., "Degree Certificate", "Government Identity", "Land Title").
  * `string metadataURI`: Optional IPFS CID / URI for public verifiable metadata.
  * `bool revoked`: Revocation status flag.
  * `bool exists`: Registration existence check.
* **Decoupled Architecture:** If `CertificateRegistry.sol` is removed, the core BlockDrive access-controlled file sharing system continues to operate completely untouched.

---

## Contract Addresses

| Network | Contract Address |
|---|---|
| **Hardhat Localhost (31337)** | `0x59b670e9fA9D0A427751Af201D676719a970857b` |
| **Sepolia Testnet (11155111)** | *(Configure in `.env` or `deployedAddresses.json`)* |

---

## How to Run & Test

### 1. Run Automated Unit Tests
Run the standalone test suite covering certificate issuance, duplicate prevention, verification, revocation, and role-based permissions:

```bash
npx hardhat test test/CertificateRegistry.test.js
```

To run the entire test suite across all project contracts:
```bash
npx hardhat test
```

### 2. Deploy Contract to Localhost
Start the local Hardhat node (if not already running):
```bash
npx hardhat node
```

Deploy the `CertificateRegistry` contract:
```bash
npx hardhat run scripts/deployCertificateRegistry.js --network localhost
```

### 3. Launch Frontend
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173/` in your browser.

---

## User Workflows

### 1. Verifying a Document (Public & Gasless)
1. Navigate to the **"Verify Document"** tab (or direct URL `http://localhost:5173/?tab=verify`).
2. Drag and drop any document (PDF, PNG, JPG, DOCX) or paste its 32-byte Keccak-256 hash.
3. The client computes the file fingerprint locally and queries `verifyCertificate(hash)` via a read-only RPC provider.
4. An immediate status card is rendered:
   * **✅ Verified & Authentic**: Displays issuing authority address, recipient name, classification, and timestamp.
   * **⚠️ Revoked**: Alerts that the document was invalidated by the issuing authority.
   * **❌ Not Found On-Chain**: Indicates the document was either modified or never registered.

### 2. Issuing a Certificate (Authorized Issuers Only)
1. Connect an authorized wallet on the **"Issue Certificate"** tab (or direct URL `http://localhost:5173/?tab=issue`).
2. Upload the official document file, enter the recipient name/ID, and select the document classification.
3. Click **"Sign & Issue Certificate on Ethereum"** to execute `issueCertificate(...)`.
4. Upon block confirmation, a formal verification slip is generated with a permanent shareable verification URL and printable summary.
