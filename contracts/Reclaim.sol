// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./Claims.sol";
import "./Random.sol";
import "./StringUtils.sol";
import "./BytesUtils.sol";
import "./ProofStorage.sol";

// import "hardhat/console.sol";

/**
 * @title IProofStorage
 * @dev Interface for the ProofStorage contract that allows storing and retrieving proofs.
 *      A proof is represented by a claim identifier and the corresponding proof data.
 */
// interface IProofStorage {

//     /**
//      * @dev Structure to store proof details.
//      * @param claimIdentifier A unique identifier for the claim.
//      * @param data The proof data associated with the claim.
//      */
//     struct Proof {
//         bytes32 claimIdentifier;  // Unique identifier for the claim
//         bytes data;               // Data representing the proof for the claim
//     }

//     /**
//      * @dev Stores a proof in the contract.
//      * @param claimIdentifier The unique identifier for the claim.
//      * @param data The proof data to be stored.
//      * @notice This function is intended to be called by external contracts or addresses
//      *         to store proofs in the implementing contract.
//      */
//     function storeProof(bytes32 claimIdentifier, bytes memory data) external;

//     /**
//      * @dev Retrieves a stored proof by its claim identifier.
//      * @param claimIdentifier The unique identifier for the claim.
//      * @return The proof associated with the given claim identifier.
//      * @notice This function allows anyone to retrieve the proof data associated with a claim identifier.
//      */
//     function getProof(bytes32 claimIdentifier) external view returns (Proof memory);
// }

/**
 * Reclaim Beacon contract
 */
contract Reclaim {
    struct Witness {
        /** ETH address of the witness */
        address addr;
		/** Host to connect to the witness */
        string host;
    }

    struct Epoch {
		/** Epoch number */
        uint32 id;
		/** when the epoch changed */
        uint32 timestampStart;
		/** when the epoch will change */
        uint32 timestampEnd;
		/** Witnesses for this epoch */
        Witness[] witnesses;
        /**
		 * Minimum number of witnesses
		 * required to create a claim
		 * */
        uint8 minimumWitnessesForClaimCreation;
    }

    struct Proof {
        Claims.ClaimInfo claimInfo;
        Claims.SignedClaim signedClaim;
    }

	/** list of all epochs */
    Epoch[] public epochs;

    /** 
	 * duration of each epoch.
	 * is not a hard duration, but useful for
	 * caching purposes
	 * */
    uint32 public epochDurationS;

    /**
	 * current epoch.
	 * starts at 1, so that the first epoch is 1
	 * */
    uint32 public currentEpoch;


    /**
	 * Declaring an instance of the ProofStorage interface
	 * */
    ProofStorage public proofStorage;


    event EpochAdded(Epoch epoch);
    address public owner;

    /**
    * Constructor to initialize the Reclaim contract
	* @notice Calls initialize on the base contracts
    */
    constructor() {
        epochDurationS = 1 days;
        currentEpoch = 0;
        owner = msg.sender;
        proofStorage = new ProofStorage(address(this));
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "Only Owner");
        _;
    }



	// epoch functions ---

    /**
	 * Fetch an epoch
	 * @param epoch the epoch number to fetch;
	 * pass 0 to fetch the current epoch
	 */
    function fetchEpoch(uint32 epoch) public view returns (Epoch memory) {
        if (epoch == 0) {
            return epochs[epochs.length - 1];
        }
        return epochs[epoch - 1];
    }

	/**
	 * Get the witnesses that'll sign the claim
	 */
    function fetchWitnessesForClaim(uint32 epoch, bytes32 identifier, uint32 timestampS) public view returns (Witness[] memory) {
        Epoch memory epochData = fetchEpoch(epoch);
        bytes memory completeInput = abi.encodePacked(
            StringUtils.bytes2str(abi.encodePacked(identifier)),
            "\n",
            StringUtils.uint2str(epoch),
            "\n",
            StringUtils.uint2str(epochData.minimumWitnessesForClaimCreation),
            "\n",
            StringUtils.uint2str(timestampS)
        );
        bytes memory completeHash = abi.encodePacked(keccak256(completeInput));

        Witness[] memory witnessesLeftList = epochData.witnesses;
        Witness[] memory selectedWitnesses = new Witness[](epochData.minimumWitnessesForClaimCreation);
        uint witnessesLeft = witnessesLeftList.length;

        uint byteOffset = 0;
        for (uint32 i = 0; i < epochData.minimumWitnessesForClaimCreation; i++) {
            uint randomSeed = BytesUtils.bytesToUInt(completeHash, byteOffset);
            uint witnessIndex = randomSeed % witnessesLeft;
            selectedWitnesses[i] = witnessesLeftList[witnessIndex];
		    // remove the witness from the list of witnesses
			// we've utilised witness at index "idx"
			// we of course don't want to pick the same witness twice
			// so we remove it from the list of witnesses
			// and reduce the number of witnesses left to pick from
			// since solidity doesn't support "pop()" in memory arrays
			// we swap the last element with the element we want to remove
            witnessesLeftList[witnessIndex] = epochData.witnesses[witnessesLeft - 1];
            byteOffset = (byteOffset + 4) % completeHash.length;
            witnessesLeft -= 1;
        }

        return selectedWitnesses;
    }

	/**
	 * Call the function to assert
	 * the validity of several claims proofs
	 * and store them on ProofStorage contract
	 */
    function verifyProof(Proof memory proof) public {
		// create signed claim using claimData and signature.
        require(proof.signedClaim.signatures.length > 0, "No signatures");
        Claims.SignedClaim memory signed = Claims.SignedClaim(proof.signedClaim.claim, proof.signedClaim.signatures);

		// check if the hash from the claimInfo is equal to the infoHash in the claimData
        bytes32 hashed = Claims.hashClaimInfo(proof.claimInfo);
        require(proof.signedClaim.claim.identifier == hashed, "Claim identifier mismatch");

		// fetch witness list from fetchEpoch(_epoch).witnesses
        Witness[] memory expectedWitnesses = fetchWitnessesForClaim(proof.signedClaim.claim.epoch, proof.signedClaim.claim.identifier, proof.signedClaim.claim.timestampS);
        address[] memory signedWitnesses = Claims.recoverSignersOfSignedClaim(signed);

		// check if the number of signatures is equal to the number of witnesses
        require(signedWitnesses.length == expectedWitnesses.length, "Number of signatures not equal to number of witnesses");

        for (uint256 i = 0; i < signedWitnesses.length; i++) {
            for (uint256 j = 0; j < signedWitnesses.length; j++) {
                if (i == j) continue;
                require(signedWitnesses[i] != signedWitnesses[j], "Duplicated Signatures Found");
            }
        }

		// Update awaited: more checks on whose signatures can be considered.
        for (uint256 i = 0; i < signed.signatures.length; i++) {
            bool found = false;
            for (uint j = 0; j < expectedWitnesses.length; j++) {
                if (signedWitnesses[i] == expectedWitnesses[j].addr) {
                    found = true;
                    break;
                }
            }
            require(found, "Signature not appropriate");
        }

        // Storing the proof in the ProofStorage contract after verification
        proofStorage.storeProof(proof.signedClaim.claim.identifier, abi.encode(proof));
    }


	// admin functions ---

	/**
	 * @dev Add a new epoch
	 */
    function addNewEpoch(Witness[] calldata witnesses, uint8 requisiteWitnessesForClaimCreate) external onlyOwner {
        if (epochDurationS == 0) {
            epochDurationS = 1 days;
        }
        if (epochs.length > 0) {
            epochs[epochs.length - 1].timestampEnd = uint32(block.timestamp);
        }

        currentEpoch += 1;
        Epoch storage epoch = epochs.push();
        epoch.id = currentEpoch;
        epoch.timestampStart = uint32(block.timestamp);
        epoch.timestampEnd = uint32(block.timestamp + epochDurationS);
        epoch.minimumWitnessesForClaimCreation = requisiteWitnessesForClaimCreate;

        for (uint256 i = 0; i < witnesses.length; i++) {
            epoch.witnesses.push(witnesses[i]);
        }

        emit EpochAdded(epochs[epochs.length - 1]);
    }

	// internal code -----

    function uintDifference(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a > b) {
            return a - b;
        }
        return b - a;
    }
}
