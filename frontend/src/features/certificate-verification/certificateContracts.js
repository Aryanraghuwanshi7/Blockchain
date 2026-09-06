import { ethers } from "ethers";
import deployedConfig from "../../utils/deployedAddresses.json";

export const CERTIFICATE_REGISTRY_ABI = [
  "function ISSUER_ROLE() external view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function grantRole(bytes32 role, address account) external",
  "function revokeRole(bytes32 role, address account) external",
  "function issueCertificate(bytes32 certificateHash, string calldata recipientName, string calldata documentType, string calldata metadataURI) external",
  "function revokeCertificate(bytes32 certificateHash) external",
  "function verifyCertificate(bytes32 certificateHash) external view returns (bool exists, bool revoked, address issuer, string memory recipient, string memory documentType, uint256 issueDate, string memory metadataURI)",
  "function getCertificate(bytes32 certificateHash) external view returns (tuple(bytes32 certificateHash, address issuerAddress, string recipientName, uint256 issueDate, string documentType, string metadataURI, bool revoked, bool exists))",
  "function getTotalCertificates() external view returns (uint256)",
  "function getAllCertificateHashes() external view returns (bytes32[] memory)",
  "event CertificateIssued(bytes32 indexed certificateHash, address indexed issuer, string recipientName, string documentType, uint256 issueDate, string metadataURI)",
  "event CertificateRevoked(bytes32 indexed certificateHash, address indexed revokedBy, uint256 revokedAt)"
];

export const CERTIFICATE_REGISTRY_ADDRESS =
  import.meta.env.VITE_CERTIFICATE_REGISTRY_ADDRESS ||
  deployedConfig.certificateRegistryAddress ||
  "0x59b670e9fA9D0A427751Af201D676719a970857b";

export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";

/**
 * Get instance of CertificateRegistry connected to a signer or provider.
 */
export function getCertificateRegistryContract(signerOrProvider) {
  return new ethers.Contract(
    CERTIFICATE_REGISTRY_ADDRESS,
    CERTIFICATE_REGISTRY_ABI,
    signerOrProvider
  );
}

/**
 * Public, read-only contract instance requiring zero wallet authentication.
 */
export function getReadOnlyCertificateContract() {
  let provider;
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
  } else {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return new ethers.Contract(
    CERTIFICATE_REGISTRY_ADDRESS,
    CERTIFICATE_REGISTRY_ABI,
    provider
  );
}

/**
 * Compute the Keccak-256 cryptographic fingerprint of a document / file buffer.
 * Matches Solidity's keccak256(bytes) exactly.
 * @param {ArrayBuffer|Uint8Array} fileBuffer
 * @returns {string} Hex-encoded keccak256 hash (0x...)
 */
export function computeDocumentHash(fileBuffer) {
  const bytes = new Uint8Array(fileBuffer);
  return ethers.keccak256(bytes);
}
