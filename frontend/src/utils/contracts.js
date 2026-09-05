import { ethers } from "ethers";

export const FILE_REGISTRY_ABI = [
  "function registerFile(bytes32 fileId, string calldata ipfsCid, bytes calldata ownerWrappedKey) external",
  "function getFileRecord(bytes32 fileId) external view returns (string memory ipfsCid, address ownerAddress, uint256 createdAt, bytes memory callerWrappedKey)",
  "function addAuthorizedRecipient(bytes32 fileId, address recipient, bytes calldata wrappedKey) external",
  "function isAuthorized(address user, bytes32 fileId) external view returns (bool)",
  "function getFilesByOwner(address owner) external view returns (bytes32[] memory)",
  "event FileRegistered(bytes32 indexed fileId, address indexed owner, string ipfsCid, uint256 createdAt)",
  "event RecipientAuthorized(bytes32 indexed fileId, address indexed recipient, address indexed authorizedBy)"
];

export const ACCESS_CONTROL_ABI = [
  "function DATA_OWNER_ROLE() external view returns (bytes32)",
  "function DATA_CONSUMER_ROLE() external view returns (bytes32)",
  "function getUserAttributes(address user) external view returns (uint256)",
  "function hasRequiredAttributes(address user, uint256 requiredAttributes) external view returns (bool)"
];

import deployedConfig from "./deployedAddresses.json";

export const FILE_REGISTRY_ADDRESS = import.meta.env.VITE_FILE_REGISTRY_ADDRESS || deployedConfig.fileRegistryAddress || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export const ACCESS_CONTROL_ADDRESS = import.meta.env.VITE_ACCESS_CONTROL_ADDRESS || deployedConfig.accessControlAddress || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export function getFileRegistryContract(signerOrProvider) {
  return new ethers.Contract(FILE_REGISTRY_ADDRESS, FILE_REGISTRY_ABI, signerOrProvider);
}

export function getAccessControlContract(signerOrProvider) {
  return new ethers.Contract(ACCESS_CONTROL_ADDRESS, ACCESS_CONTROL_ABI, signerOrProvider);
}
