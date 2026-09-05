// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AccessControl.sol";

/**
 * @title FileRegistry
 * @notice Stores file metadata, IPFS CIDs, and per-recipient wrapped encryption keys.
 * @dev Implements the access control layer from Wang et al. (IEEE Access 2018).
 */
contract FileRegistry {
    struct FileRecord {
        bytes32 fileId;
        string ipfsCid;
        address ownerAddress;
        uint256 createdAt;
        bool exists;
    }

    BlockDriveAccessControl public immutable accessControlContract;

    // fileId => FileRecord
    mapping(bytes32 => FileRecord) private _files;

    // fileId => (recipientAddress => wrappedKey)
    mapping(bytes32 => mapping(address => bytes)) private _wrappedKeys;

    // fileId => (recipientAddress => isAuthorized)
    mapping(bytes32 => mapping(address => bool)) private _authorizations;

    // ownerAddress => array of fileIds
    mapping(address => bytes32[]) private _ownerFiles;

    event FileRegistered(
        bytes32 indexed fileId,
        address indexed owner,
        string ipfsCid,
        uint256 createdAt
    );

    event RecipientAuthorized(
        bytes32 indexed fileId,
        address indexed recipient,
        address indexed authorizedBy
    );

    event RecipientRevoked(
        bytes32 indexed fileId,
        address indexed recipient,
        address indexed revokedBy
    );

    error FileNotFound(bytes32 fileId);
    error FileAlreadyExists(bytes32 fileId);
    error NotFileOwner(bytes32 fileId, address caller);
    error UnauthorizedCaller(address caller);
    error InvalidAddress();
    error EmptyCID();
    error EmptyKey();
    error AdvancedRevocationNotImplemented();

    modifier onlyFileOwner(bytes32 fileId) {
        if (!_files[fileId].exists) revert FileNotFound(fileId);
        if (_files[fileId].ownerAddress != msg.sender) revert NotFileOwner(fileId, msg.sender);
        _;
    }

    constructor(address accessControlAddress) {
        if (accessControlAddress == address(0)) revert InvalidAddress();
        accessControlContract = BlockDriveAccessControl(accessControlAddress);
    }

    /**
     * @notice Register a newly encrypted file with its IPFS CID and owner's wrapped key.
     * @param fileId Unique identifier (e.g. SHA-256 of plaintext or UUID hash).
     * @param ipfsCid Content identifier of the ciphertext on IPFS.
     * @param ownerWrappedKey Key wrapped with the owner's public key.
     */
    function registerFile(
        bytes32 fileId,
        string calldata ipfsCid,
        bytes calldata ownerWrappedKey
    ) external {
        if (fileId == bytes32(0)) revert FileNotFound(fileId);
        if (_files[fileId].exists) revert FileAlreadyExists(fileId);
        if (bytes(ipfsCid).length == 0) revert EmptyCID();
        if (ownerWrappedKey.length == 0) revert EmptyKey();

        _files[fileId] = FileRecord({
            fileId: fileId,
            ipfsCid: ipfsCid,
            ownerAddress: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });

        _wrappedKeys[fileId][msg.sender] = ownerWrappedKey;
        _authorizations[fileId][msg.sender] = true;
        _ownerFiles[msg.sender].push(fileId);

        emit FileRegistered(fileId, msg.sender, ipfsCid, block.timestamp);
    }

    /**
     * @notice Retrieve file record and the caller's specific wrapped key.
     * @param fileId Target file identifier.
     * @return ipfsCid IPFS CID of encrypted payload.
     * @return ownerAddress Address of the file owner.
     * @return createdAt Block timestamp when registered.
     * @return callerWrappedKey Ciphertext key wrapped specifically for msg.sender.
     */
    function getFileRecord(bytes32 fileId)
        external
        view
        returns (
            string memory ipfsCid,
            address ownerAddress,
            uint256 createdAt,
            bytes memory callerWrappedKey
        )
    {
        FileRecord storage record = _files[fileId];
        if (!record.exists) revert FileNotFound(fileId);
        if (!_authorizations[fileId][msg.sender]) revert UnauthorizedCaller(msg.sender);

        return (
            record.ipfsCid,
            record.ownerAddress,
            record.createdAt,
            _wrappedKeys[fileId][msg.sender]
        );
    }

    /**
     * @notice Add a new authorized recipient by supplying their wrapped key.
     * @param fileId Target file identifier.
     * @param recipient Address of the recipient being granted access.
     * @param wrappedKey AES key encrypted with recipient's public key.
     */
    function addAuthorizedRecipient(
        bytes32 fileId,
        address recipient,
        bytes calldata wrappedKey
    ) external onlyFileOwner(fileId) {
        if (recipient == address(0)) revert InvalidAddress();
        if (wrappedKey.length == 0) revert EmptyKey();

        _wrappedKeys[fileId][recipient] = wrappedKey;
        _authorizations[fileId][recipient] = true;

        emit RecipientAuthorized(fileId, recipient, msg.sender);
    }

    /**
     * @notice Check authorization status of a user for a file.
     * @param user Address to inspect.
     * @param fileId File identifier.
     */
    function isAuthorized(address user, bytes32 fileId) external view returns (bool) {
        if (!_files[fileId].exists) return false;
        return _authorizations[fileId][user];
    }

    /**
     * @notice Revoke a recipient's authorization.
     * @dev Reverts with NotImplemented; full attribute revocation requires re-encryption proxy protocol.
     */
    function revokeRecipient(bytes32 fileId, address recipient) external onlyFileOwner(fileId) {
        // Standard choice: Stub advanced revocation with custom error as full CP-ABE re-encryption is phased for Milestone 3
        if (recipient == address(0)) revert InvalidAddress();
        revert AdvancedRevocationNotImplemented();
    }

    /**
     * @notice Helper to list files owned by a specific account.
     * @param owner Target owner address.
     */
    function getFilesByOwner(address owner) external view returns (bytes32[] memory) {
        return _ownerFiles[owner];
    }
}
