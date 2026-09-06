// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CertificateRegistry
 * @notice Self-contained, immutable registry for issuing and verifying document fingerprints on-chain.
 * @dev Implements role-based access control where ISSUER_ROLE accounts can register document hashes,
 *      and any public party can verify document authenticity without gas or wallet authentication.
 */
contract CertificateRegistry is AccessControl {
    /// @notice Role identifier for authorized certificate/document issuers.
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    /// @notice Record representing an on-chain issued certificate or document.
    struct CertificateRecord {
        bytes32 certificateHash;  // Cryptographic hash (e.g., Keccak-256) of document payload
        address issuerAddress;    // Address of the authorized issuing authority
        string recipientName;     // Recipient identity or identifier
        uint256 issueDate;        // Timestamp when the certificate was issued on-chain
        string documentType;      // Classification (e.g., "Degree", "Birth Certificate", "Land Record")
        string metadataURI;       // Optional IPFS CID / URI pointing to non-sensitive public metadata
        bool revoked;             // True if the certificate was invalidated by issuer or admin
        bool exists;              // True if record exists
    }

    /// @dev Mapping from certificate hash to on-chain certificate record
    mapping(bytes32 => CertificateRecord) private _certificates;

    /// @dev Array of all registered certificate hashes for optional enumeration
    bytes32[] private _allCertificateHashes;

    /// @notice Emitted when a new certificate is registered on-chain
    event CertificateIssued(
        bytes32 indexed certificateHash,
        address indexed issuer,
        string recipientName,
        string documentType,
        uint256 issueDate,
        string metadataURI
    );

    /// @notice Emitted when an existing certificate is revoked
    event CertificateRevoked(
        bytes32 indexed certificateHash,
        address indexed revokedBy,
        uint256 revokedAt
    );

    /// @notice Custom errors for gas efficiency and clear reverts
    error CertificateAlreadyExists(bytes32 certificateHash);
    error CertificateNotFound(bytes32 certificateHash);
    error CertificateAlreadyRevoked(bytes32 certificateHash);
    error NotOriginalIssuerOrAdmin(bytes32 certificateHash, address caller);
    error EmptyHash();
    error EmptyRecipient();
    error EmptyDocumentType();

    /**
     * @notice Initializes the CertificateRegistry with default admin and issuer privileges.
     * @param defaultAdmin Address to grant DEFAULT_ADMIN_ROLE and initial ISSUER_ROLE.
     */
    constructor(address defaultAdmin) {
        if (defaultAdmin == address(0)) {
            defaultAdmin = msg.sender;
        }
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ISSUER_ROLE, defaultAdmin);
    }

    /**
     * @notice Register and issue a new document/certificate fingerprint on-chain.
     * @param certificateHash Cryptographic hash (Keccak-256) of the document content.
     * @param recipientName Name or unique identifier of the recipient.
     * @param documentType Type of document (e.g., "Degree", "Transcript", "License").
     * @param metadataURI Optional IPFS CID / metadata URI for public details.
     */
    function issueCertificate(
        bytes32 certificateHash,
        string calldata recipientName,
        string calldata documentType,
        string calldata metadataURI
    ) external onlyRole(ISSUER_ROLE) {
        if (certificateHash == bytes32(0)) revert EmptyHash();
        if (bytes(recipientName).length == 0) revert EmptyRecipient();
        if (bytes(documentType).length == 0) revert EmptyDocumentType();
        if (_certificates[certificateHash].exists) {
            revert CertificateAlreadyExists(certificateHash);
        }

        _certificates[certificateHash] = CertificateRecord({
            certificateHash: certificateHash,
            issuerAddress: msg.sender,
            recipientName: recipientName,
            issueDate: block.timestamp,
            documentType: documentType,
            metadataURI: metadataURI,
            revoked: false,
            exists: true
        });

        _allCertificateHashes.push(certificateHash);

        emit CertificateIssued(
            certificateHash,
            msg.sender,
            recipientName,
            documentType,
            block.timestamp,
            metadataURI
        );
    }

    /**
     * @notice Revoke an existing certificate. Can only be performed by the original issuer or a contract admin.
     * @param certificateHash The cryptographic hash of the certificate to revoke.
     */
    function revokeCertificate(bytes32 certificateHash) external onlyRole(ISSUER_ROLE) {
        if (certificateHash == bytes32(0)) revert EmptyHash();
        CertificateRecord storage record = _certificates[certificateHash];
        if (!record.exists) revert CertificateNotFound(certificateHash);
        if (record.revoked) revert CertificateAlreadyRevoked(certificateHash);

        // Only original issuer or DEFAULT_ADMIN_ROLE can revoke
        if (msg.sender != record.issuerAddress && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotOriginalIssuerOrAdmin(certificateHash, msg.sender);
        }

        record.revoked = true;

        emit CertificateRevoked(certificateHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Public, gas-free view method to verify document authenticity.
     * @param certificateHash Cryptographic hash of the document to inspect.
     * @return exists True if the certificate was ever issued on-chain.
     * @return revoked True if the certificate is currently revoked.
     * @return issuer Address of the issuing authority.
     * @return recipient Name or ID of the recipient.
     * @return documentType Classification of the document.
     * @return issueDate Unix timestamp when issued.
     * @return metadataURI Optional IPFS URI for extended metadata.
     */
    function verifyCertificate(bytes32 certificateHash)
        external
        view
        returns (
            bool exists,
            bool revoked,
            address issuer,
            string memory recipient,
            string memory documentType,
            uint256 issueDate,
            string memory metadataURI
        )
    {
        CertificateRecord storage record = _certificates[certificateHash];
        return (
            record.exists,
            record.revoked,
            record.issuerAddress,
            record.recipientName,
            record.documentType,
            record.issueDate,
            record.metadataURI
        );
    }

    /**
     * @notice Get full certificate record by hash.
     * @param certificateHash Cryptographic hash of the document.
     */
    function getCertificate(bytes32 certificateHash)
        external
        view
        returns (CertificateRecord memory)
    {
        CertificateRecord storage record = _certificates[certificateHash];
        if (!record.exists) revert CertificateNotFound(certificateHash);
        return record;
    }

    /**
     * @notice Get total count of certificates issued on-chain.
     */
    function getTotalCertificates() external view returns (uint256) {
        return _allCertificateHashes.length;
    }

    /**
     * @notice Get all certificate hashes issued on-chain.
     */
    function getAllCertificateHashes() external view returns (bytes32[] memory) {
        return _allCertificateHashes;
    }
}
