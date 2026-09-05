// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BlockDriveAccessControl
 * @notice Role and attribute bookkeeping for the BlockDrive decentralized access control scheme.
 */
contract BlockDriveAccessControl is AccessControl {
    bytes32 public constant DATA_OWNER_ROLE = keccak256("DATA_OWNER_ROLE");
    bytes32 public constant DATA_CONSUMER_ROLE = keccak256("DATA_CONSUMER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // Mapping of user address to attribute bitmask/tag for phased attribute-based access control
    mapping(address => uint256) private _userAttributes;

    event UserAttributesUpdated(address indexed user, uint256 attributes, address indexed updatedBy);

    constructor(address defaultAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(DATA_OWNER_ROLE, defaultAdmin);
    }

    /**
     * @notice Set user attribute flags (e.g. Department, Clearance Level).
     * @param user Target account.
     * @param attributes Bitmask representing user attributes.
     */
    function setUserAttributes(address user, uint256 attributes) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _userAttributes[user] = attributes;
        emit UserAttributesUpdated(user, attributes, msg.sender);
    }

    /**
     * @notice Get user attribute flags.
     * @param user Target account.
     */
    function getUserAttributes(address user) external view returns (uint256) {
        return _userAttributes[user];
    }

    /**
     * @notice Check if a user possesses required attribute bits.
     * @param user Target account.
     * @param requiredAttributes Bitmask of required attributes.
     */
    function hasRequiredAttributes(address user, uint256 requiredAttributes) external view returns (bool) {
        return (_userAttributes[user] & requiredAttributes) == requiredAttributes;
    }
}
