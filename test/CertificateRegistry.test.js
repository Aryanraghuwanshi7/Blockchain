const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", function () {
  let certificateRegistry;
  let admin, issuer1, issuer2, recipientUser, publicVerifier;

  // Sample document hashes
  const sampleDocBytes1 = ethers.toUtf8Bytes("Degree Certificate: John Doe, B.Tech CS 2026");
  const sampleHash1 = ethers.keccak256(sampleDocBytes1);

  const sampleDocBytes2 = ethers.toUtf8Bytes("Land Title Deed: Plot 402, Neo City");
  const sampleHash2 = ethers.keccak256(sampleDocBytes2);

  const nonExistentHash = ethers.keccak256(ethers.toUtf8Bytes("Non-existent Document"));

  beforeEach(async function () {
    [admin, issuer1, issuer2, recipientUser, publicVerifier] = await ethers.getSigners();

    const CertificateRegistryFactory = await ethers.getContractFactory("CertificateRegistry");
    certificateRegistry = await CertificateRegistryFactory.deploy(admin.address);
    await certificateRegistry.waitForDeployment();

    // Grant ISSUER_ROLE to issuer1
    const ISSUER_ROLE = await certificateRegistry.ISSUER_ROLE();
    await certificateRegistry.connect(admin).grantRole(ISSUER_ROLE, issuer1.address);
  });

  describe("Deployment & Roles", function () {
    it("should assign DEFAULT_ADMIN_ROLE and ISSUER_ROLE to deployer/admin", async function () {
      const DEFAULT_ADMIN_ROLE = await certificateRegistry.DEFAULT_ADMIN_ROLE();
      const ISSUER_ROLE = await certificateRegistry.ISSUER_ROLE();

      expect(await certificateRegistry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await certificateRegistry.hasRole(ISSUER_ROLE, admin.address)).to.be.true;
    });

    it("should allow admin to grant and revoke ISSUER_ROLE", async function () {
      const ISSUER_ROLE = await certificateRegistry.ISSUER_ROLE();
      
      expect(await certificateRegistry.hasRole(ISSUER_ROLE, issuer2.address)).to.be.false;
      await certificateRegistry.connect(admin).grantRole(ISSUER_ROLE, issuer2.address);
      expect(await certificateRegistry.hasRole(ISSUER_ROLE, issuer2.address)).to.be.true;

      await certificateRegistry.connect(admin).revokeRole(ISSUER_ROLE, issuer2.address);
      expect(await certificateRegistry.hasRole(ISSUER_ROLE, issuer2.address)).to.be.false;
    });

    it("should reject non-admin trying to grant ISSUER_ROLE", async function () {
      const ISSUER_ROLE = await certificateRegistry.ISSUER_ROLE();
      await expect(
        certificateRegistry.connect(publicVerifier).grantRole(ISSUER_ROLE, publicVerifier.address)
      ).to.be.revertedWithCustomError(certificateRegistry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Certificate Issuance", function () {
    it("should allow authorized issuer to issue certificate and emit CertificateIssued event", async function () {
      const tx = await certificateRegistry
        .connect(issuer1)
        .issueCertificate(
          sampleHash1,
          "John Doe",
          "Degree Certificate",
          "ipfs://QmSampleMetadataCID1"
        );

      await expect(tx)
        .to.emit(certificateRegistry, "CertificateIssued")
        .withArgs(
          sampleHash1,
          issuer1.address,
          "John Doe",
          "Degree Certificate",
          (await ethers.provider.getBlock("latest")).timestamp,
          "ipfs://QmSampleMetadataCID1"
        );

      expect(await certificateRegistry.getTotalCertificates()).to.equal(1);
    });

    it("should reject duplicate certificate hash registration", async function () {
      await certificateRegistry
        .connect(issuer1)
        .issueCertificate(
          sampleHash1,
          "John Doe",
          "Degree Certificate",
          "ipfs://QmSampleMetadataCID1"
        );

      await expect(
        certificateRegistry
          .connect(issuer1)
          .issueCertificate(
            sampleHash1,
            "John Doe Clone",
            "Degree Certificate",
            "ipfs://QmSampleMetadataCID1"
          )
      ).to.be.revertedWithCustomError(certificateRegistry, "CertificateAlreadyExists");
    });

    it("should reject certificate issuance with empty hash, recipient, or documentType", async function () {
      await expect(
        certificateRegistry
          .connect(issuer1)
          .issueCertificate(ethers.ZeroHash, "John Doe", "Degree", "")
      ).to.be.revertedWithCustomError(certificateRegistry, "EmptyHash");

      await expect(
        certificateRegistry
          .connect(issuer1)
          .issueCertificate(sampleHash1, "", "Degree", "")
      ).to.be.revertedWithCustomError(certificateRegistry, "EmptyRecipient");

      await expect(
        certificateRegistry
          .connect(issuer1)
          .issueCertificate(sampleHash1, "John Doe", "", "")
      ).to.be.revertedWithCustomError(certificateRegistry, "EmptyDocumentType");
    });

    it("should reject non-issuer attempting to issue certificate", async function () {
      await expect(
        certificateRegistry
          .connect(publicVerifier)
          .issueCertificate(sampleHash1, "Impostor", "Degree", "")
      ).to.be.revertedWithCustomError(certificateRegistry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Certificate Verification (Public & Read-Only)", function () {
    beforeEach(async function () {
      await certificateRegistry
        .connect(issuer1)
        .issueCertificate(
          sampleHash1,
          "John Doe",
          "Degree Certificate",
          "ipfs://QmMetadataCID"
        );
    });

    it("should return valid verification details for an existing certificate", async function () {
      const result = await certificateRegistry.connect(publicVerifier).verifyCertificate(sampleHash1);

      expect(result.exists).to.be.true;
      expect(result.revoked).to.be.false;
      expect(result.issuer).to.equal(issuer1.address);
      expect(result.recipient).to.equal("John Doe");
      expect(result.documentType).to.equal("Degree Certificate");
      expect(result.issueDate).to.be.gt(0);
      expect(result.metadataURI).to.equal("ipfs://QmMetadataCID");
    });

    it("should return exists=false for non-existent document hash", async function () {
      const result = await certificateRegistry.connect(publicVerifier).verifyCertificate(nonExistentHash);

      expect(result.exists).to.be.false;
      expect(result.revoked).to.be.false;
      expect(result.issuer).to.equal(ethers.ZeroAddress);
      expect(result.recipient).to.equal("");
    });

    it("should allow querying full certificate record via getCertificate", async function () {
      const record = await certificateRegistry.getCertificate(sampleHash1);
      expect(record.certificateHash).to.equal(sampleHash1);
      expect(record.recipientName).to.equal("John Doe");
      expect(record.exists).to.be.true;
    });

    it("should revert getCertificate for non-existent hash", async function () {
      await expect(
        certificateRegistry.getCertificate(nonExistentHash)
      ).to.be.revertedWithCustomError(certificateRegistry, "CertificateNotFound");
    });
  });

  describe("Certificate Revocation", function () {
    beforeEach(async function () {
      await certificateRegistry
        .connect(issuer1)
        .issueCertificate(
          sampleHash1,
          "John Doe",
          "Degree Certificate",
          "ipfs://QmMetadataCID"
        );
    });

    it("should allow the original issuer to revoke their certificate", async function () {
      const tx = await certificateRegistry.connect(issuer1).revokeCertificate(sampleHash1);

      await expect(tx)
        .to.emit(certificateRegistry, "CertificateRevoked")
        .withArgs(sampleHash1, issuer1.address, (await ethers.provider.getBlock("latest")).timestamp);

      const result = await certificateRegistry.verifyCertificate(sampleHash1);
      expect(result.exists).to.be.true;
      expect(result.revoked).to.be.true;
    });

    it("should allow DEFAULT_ADMIN_ROLE to revoke any certificate", async function () {
      await expect(certificateRegistry.connect(admin).revokeCertificate(sampleHash1))
        .to.emit(certificateRegistry, "CertificateRevoked");

      const result = await certificateRegistry.verifyCertificate(sampleHash1);
      expect(result.revoked).to.be.true;
    });

    it("should reject revocation by an issuer who is not the original issuer nor admin", async function () {
      // Grant ISSUER_ROLE to issuer2
      const ISSUER_ROLE = await certificateRegistry.ISSUER_ROLE();
      await certificateRegistry.connect(admin).grantRole(ISSUER_ROLE, issuer2.address);

      await expect(
        certificateRegistry.connect(issuer2).revokeCertificate(sampleHash1)
      ).to.be.revertedWithCustomError(certificateRegistry, "NotOriginalIssuerOrAdmin");
    });

    it("should reject revocation by non-issuer account", async function () {
      await expect(
        certificateRegistry.connect(publicVerifier).revokeCertificate(sampleHash1)
      ).to.be.revertedWithCustomError(certificateRegistry, "AccessControlUnauthorizedAccount");
    });

    it("should reject revocation on already revoked certificate", async function () {
      await certificateRegistry.connect(issuer1).revokeCertificate(sampleHash1);

      await expect(
        certificateRegistry.connect(issuer1).revokeCertificate(sampleHash1)
      ).to.be.revertedWithCustomError(certificateRegistry, "CertificateAlreadyRevoked");
    });

    it("should reject revocation of non-existent certificate", async function () {
      await expect(
        certificateRegistry.connect(issuer1).revokeCertificate(nonExistentHash)
      ).to.be.revertedWithCustomError(certificateRegistry, "CertificateNotFound");
    });
  });
});
