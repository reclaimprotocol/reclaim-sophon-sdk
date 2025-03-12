import {
    CompleteClaimData,
    createSignDataForClaim,
    fetchWitnessListForClaim,
    hashClaimInfo,
  } from "@reclaimprotocol/crypto-sdk";
  
  import { expect } from "chai";
  import { BigNumber, utils } from "ethers";
  import { Reclaim } from "../src/types";
  import {
    deployReclaimContract,
    generateMockWitnessesList,
    randomEthAddress,
    randomWallet,
    randomiseWitnessList,
    deployProofStorageContract,
  } from "./utils";
  import { ethers, run, upgrades } from "hardhat";
  
  import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
  import { randomBytes } from "crypto";
  
  import { deployFixture, proofsFixture } from "./fixtures";
  
  describe("Reclaim Tests", () => {
    const NUM_WITNESSES = 5;
    const MOCK_HOST_PREFIX = "localhost:555";
  
    it("should fail to execute admin functions if not owner", async () => {
      let { contract, witnesses } = await loadFixture(deployFixture);
      const NOT_OWNER_MSG = "Ownable: caller is not the owner";
      const user = await randomWallet(1, ethers.provider);
      contract = await contract.connect(user);
  
      const expectedRejections = [() => contract.addNewEpoch(witnesses, 5)];
      for (const reject of expectedRejections) {
        expect(reject()).to.be.revertedWith(NOT_OWNER_MSG);
      }
    });
  
    it("should insert some epochs", async () => {
      let { contract, witnesses, owner } = await loadFixture(deployFixture);
      const currentEpoch = await contract.currentEpoch();
      for (let i = 1; i < 5; i++) {
        const tx = await contract.addNewEpoch(witnesses, 5);
        await tx.wait();
        // current epoch
        const epoch = await contract.fetchEpoch(0);
        expect(epoch.id).to.be.eq(currentEpoch + i);
        expect(epoch.witnesses).to.have.length(NUM_WITNESSES);
        expect(epoch.timestampStart).to.be.gt(0);
  
        const epochById = await contract.fetchEpoch(epoch.id);
        expect(epochById.id).to.be.eq(epoch.id);
      }
    });
  
    describe("Proofs tests", async () => {
      it("should verify a claim", async () => {
        let { contract, user, superProofs } = await loadFixture(proofsFixture);
        await contract.connect(user).verifyProof(superProofs[1]);
      });
    });
  });
  
  describe("Reclaim Witness Fetch Tests", () => {
    const NUM_WITNESSES = 15;
    const MOCK_HOST_PREFIX = "localhost:555";
    let contract: Reclaim;
    let witnesses: Reclaim.WitnessStruct[] = [];
  
    beforeEach(async () => {
      contract = await deployReclaimContract(ethers);
      let proofContract: any = await deployProofStorageContract(ethers, contract.address);
  
      let { mockWitnesses } = await generateMockWitnessesList(
        NUM_WITNESSES,
        MOCK_HOST_PREFIX,
        ethers
      );
      witnesses = await randomiseWitnessList(mockWitnesses);
    });
  
    // check TS & solidity implementations match
    it("match fetchWitnessList implementation for claim", async () => {
      await contract.addNewEpoch(witnesses, 5);
      const currentEpoch = await contract.fetchEpoch(0);
  
      const identifier = hashClaimInfo({
        parameters: "1234",
        provider: "test",
        context: "test",
      });
  
      const timestampS = Math.floor(Date.now() / 1000);
  
      const witnessesTs = await fetchWitnessListForClaim(
        {
          epoch: currentEpoch.id,
          witnesses: currentEpoch.witnesses.map((w) => ({
            id: w.addr,
            url: w.host,
          })),
          witnessesRequiredForClaim:
            currentEpoch.minimumWitnessesForClaimCreation,
          nextEpochTimestampS: 0,
        },
        identifier,
        timestampS
      );
  
      const witnessesContract = await contract.fetchWitnessesForClaim(
        currentEpoch.id,
        identifier,
        timestampS
      );
  
      const witnessesContractHosts = witnessesContract.length;
      for (let i = 0; i < witnessesContractHosts; i++) {
        expect(witnessesContract[i].host.toLowerCase()).to.equal(
          witnessesTs[i].url.toLowerCase()
        );
      }
    });
  });
  
  describe("Reclaim VerifyProof Tests", () => {
    describe("Proof Verification", async () => {
      it("should verify a valid proof", async () => {
        const { contract, user, superProofs } = await loadFixture(proofsFixture);
        await contract.connect(user).verifyProof(superProofs[1]);
      });
  
      it("should fail with no signatures error", async () => {
        const { contract, superProofs } = await loadFixture(proofsFixture);
        const proof = {
          ...superProofs[1],
          signedClaim: { ...superProofs[1].signedClaim, signatures: [] },
        };
        await expect(contract.verifyProof(proof)).to.be.revertedWith(
          "No signatures"
        );
      });
  
      it("should fail with number of signatures not equal to number of witnesses error", async () => {
        const { contract, superProofs } = await loadFixture(proofsFixture);
        const proof = { ...superProofs[1] };
        proof.signedClaim.signatures.pop(); // Remove one signature to create the error
        await expect(contract.verifyProof(proof)).to.be.revertedWith(
          "Number of signatures not equal to number of witnesses"
        );
      });
  
      it("should fail with duplicated signatures error", async () => {
        const { contract, superProofs } = await loadFixture(proofsFixture);
        const proof = { ...superProofs[1] };
        proof.signedClaim.signatures.push(proof.signedClaim.signatures[0]); // Duplicate a signature
        await expect(contract.verifyProof(proof)).to.be.revertedWith(
          "Duplicated Signatures Found"
        );
      });
  
      it("should verify proof with appropriate signatures and witnesses", async () => {
        const { contract, owner } = await loadFixture(deployFixture);
        const witnesses = [
          {
            addr: "0x244897572368eadf65bfbc5aec98d8e5443a9072",
            host: "https://reclaim-node.questbook.app",
          },
        ];
        await contract.addNewEpoch(witnesses, 1);
        const epoch = await contract.fetchEpoch(1);
  
        const proof = {
          claimInfo: {
            context:
              "{\"contextAddress\":\"user's address\",\"contextMessage\":\"for acmecorp.com on 1st january\",\"extractedParameters\":{\"username\":\"hadi-saleh14\"},\"providerHash\":\"0x9d413beed5ff5982df9460e8f4c3d118febd36839f5c9558980856a07369cca5\"}",
            provider: "http",
            parameters:
             "{\"additionalClientOptions\":{},\"body\":\"\",\"geoLocation\":\"\",\"headers\":{\"Referer\":\"https://github.com/settings/profile\",\"Sec-Fetch-Mode\":\"same-origin\",\"User-Agent\":\"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.69 Mobile Safari/537.36\"},\"method\":\"GET\",\"paramValues\":{\"username\":\"hadi-saleh14\"},\"responseMatches\":[{\"invert\":false,\"type\":\"contains\",\"value\":\"<span class=\\\"color-fg-muted\\\">({{username}})</span>\"}],\"responseRedactions\":[{\"jsonPath\":\"\",\"regex\":\"<span class=\\\"color-fg-muted\\\">\\\\((.*)\\\\)</span>\",\"xPath\":\"\"}],\"url\":\"https://github.com/settings/profile\"}",
          },
          signedClaim: {
            claim: {
              epoch: epoch.id,
              identifier:
                "0x937c69accba0809e876033ab5394b6b905104881a8a00f7ae0a6f47bf0e24e1e",
              owner: "0x08b0292bef7ef2ef839d9f95b709401140ef0b7b",
              timestampS: 1736693048,
            },
            signatures: [
              "0x55bb3f5b4b48f5292fb7230f74d4cb5a67c2b0409f53997a1636942c36feed5a3311229e74b85a003515183c70f6b8350397fe290f09c7170dbca11eebfe74291c",
            ],
          },
        };
  
        await expect(contract.verifyProof(proof)).to.not.be.reverted;
      });
    });
  });
  
  describe("Get Proof Data", () => {
    it("should store and retrieve a proof correctly", async function () {
      let [owner] = await ethers.getSigners();
  
      let proofContract: any = await deployProofStorageContract(ethers, owner.address);
  
      const claimIdentifier =
        "0x937c69accba0809e876033ab5394b6b905104881a8a00f7ae0a6f47bf0e24e1e";
  
      const data = {
        claimInfo: {
          context:
            "{\"contextAddress\":\"user's address\",\"contextMessage\":\"for acmecorp.com on 1st january\",\"extractedParameters\":{\"username\":\"hadi-saleh14\"},\"providerHash\":\"0x9d413beed5ff5982df9460e8f4c3d118febd36839f5c9558980856a07369cca5\"}",
          provider: "http",
          parameters:
           "{\"additionalClientOptions\":{},\"body\":\"\",\"geoLocation\":\"\",\"headers\":{\"Referer\":\"https://github.com/settings/profile\",\"Sec-Fetch-Mode\":\"same-origin\",\"User-Agent\":\"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.69 Mobile Safari/537.36\"},\"method\":\"GET\",\"paramValues\":{\"username\":\"hadi-saleh14\"},\"responseMatches\":[{\"invert\":false,\"type\":\"contains\",\"value\":\"<span class=\\\"color-fg-muted\\\">({{username}})</span>\"}],\"responseRedactions\":[{\"jsonPath\":\"\",\"regex\":\"<span class=\\\"color-fg-muted\\\">\\\\((.*)\\\\)</span>\",\"xPath\":\"\"}],\"url\":\"https://github.com/settings/profile\"}",
        },
        signedClaim: {
          claim: {
            epoch: 1,
            identifier:
              "0x937c69accba0809e876033ab5394b6b905104881a8a00f7ae0a6f47bf0e24e1e",
            owner: "0x08b0292bef7ef2ef839d9f95b709401140ef0b7b",
            timestampS: 1736693048,
          },
          signatures: [
            "0x55bb3f5b4b48f5292fb7230f74d4cb5a67c2b0409f53997a1636942c36feed5a3311229e74b85a003515183c70f6b8350397fe290f09c7170dbca11eebfe74291c",
          ],
        },
      };
  
      // Encode the data to bytes
      const encodedData = ethers.utils.defaultAbiCoder.encode(
        [
          "tuple(tuple(string context, string provider, string parameters) claimInfo, tuple(tuple(uint256 epoch, bytes32 identifier, address owner, uint256 timestampS) claim, bytes[] signatures) signedClaim)",
        ],
        [data]
      );
  
      // Store the proof
      await proofContract.connect(owner).storeProof(claimIdentifier, encodedData);
  
      // Retrieve the proof
      const proof = await proofContract.getProof(claimIdentifier);
      // Decode the retrieved data
      const decodedData = ethers.utils.defaultAbiCoder.decode(
        [
          "tuple(tuple(string context, string provider, string parameters) claimInfo, tuple(tuple(uint256 epoch, bytes32 identifier, address owner, uint256 timestampS) claim, bytes[] signatures) signedClaim)",
        ],
        proof
      );
  
      // Check if the stored proof matches the retrieved proof
       expect(decodedData[0].signedClaim.claim.identifier).to.equal(claimIdentifier);
      expect(decodedData[0].claimInfo.context).to.equal(data.claimInfo.context);
      expect(decodedData[0].claimInfo.provider).to.equal(data.claimInfo.provider);
      expect(decodedData[0].claimInfo.parameters).to.equal(
        data.claimInfo.parameters
      );
      expect(decodedData[0].signedClaim.claim.epoch).to.equal(
        data.signedClaim.claim.epoch
      );
      expect(decodedData[0].signedClaim.claim.identifier).to.equal(
        data.signedClaim.claim.identifier
      );
      expect(decodedData[0].signedClaim.claim.owner.toLowerCase()).to.equal(
        data.signedClaim.claim.owner.toLowerCase()
      );
      expect(decodedData[0].signedClaim.claim.timestampS).to.equal(
        data.signedClaim.claim.timestampS
      );
      expect(decodedData[0].signedClaim.signatures[0]).to.equal(
        data.signedClaim.signatures[0]
      );
    });
  });
  