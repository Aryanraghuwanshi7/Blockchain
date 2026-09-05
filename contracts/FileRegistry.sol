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

    // fileId => array of authorized recipient addresses
    mapping(bytes32 => address[]) private _fileRecipients;

    // ownerAddress => array of fileIds
    mapping(address => bytes32[]) private _ownerFiles;

    // recipientAddress => array of fileIds shared with this recipient
    mapping(address => bytes32[]) private _sharedFiles;

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
        _fileRecipients[fileId].push(msg.sender);
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

        if (!_authorizations[fileId][recipient]) {
            _authorizations[fileId][recipient] = true;
            _fileRecipients[fileId].push(recipient);
            _sharedFiles[recipient].push(fileId);
        }
        _wrappedKeys[fileId][recipient] = wrappedKey;

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
     */
    function revokeRecipient(bytes32 fileId, address recipient) external onlyFileOwner(fileId) {
        if (recipient == address(0)) revert InvalidAddress();
        if (recipient == msg.sender) revert UnauthorizedCaller(recipient); // Owner cannot revoke self

        _authorizations[fileId][recipient] = false;
        delete _wrappedKeys[fileId][recipient];

        emit RecipientRevoked(fileId, recipient, msg.sender);
    }

    /**
     * @notice Helper to list all recipients that have ever been granted access to a file.
     */
    function getFileRecipients(bytes32 fileId) external view onlyFileOwner(fileId) returns (address[] memory) {
        return _fileRecipients[fileId];
    }

    /**
     * @notice Helper to list files owned by a specific account.
     * @param owner Target owner address.
     */
    function getFilesByOwner(address owner) external view returns (bytes32[] memory) {
        return _ownerFiles[owner];
    }

    /**
     * @notice Helper to list all files shared with a specific user.
     * @param user Target recipient address.
     */
    function getFilesSharedWithUser(address user) external view returns (bytes32[] memory) {
        return _sharedFiles[user];
    }

    /**
     * @notice Similar to Dgdrive: display accessible files of a specific owner for a caller.
     * @param owner Address of the file owner.
     * @param viewer Address of the caller/viewer wanting to inspect files.
     */
    function getAccessibleFilesFromOwner(address owner, address viewer) external view returns (bytes32[] memory) {
        bytes32[] storage allOwnerFiles = _ownerFiles[owner];
        uint256 count = 0;
        for (uint256 i = 0; i < allOwnerFiles.length; i++) {
            if (_authorizations[allOwnerFiles[i]][viewer]) {
                count++;
            }
        }

        bytes32[] memory accessible = new bytes32[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allOwnerFiles.length; i++) {
            if (_authorizations[allOwnerFiles[i]][viewer]) {
                accessible[idx] = allOwnerFiles[i];
                idx++;
            }
        }
        return accessible;
    }
}
