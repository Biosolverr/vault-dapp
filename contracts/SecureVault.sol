// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract SecureVault is
    UUPSUpgradeable,
    OwnableUpgradeable,
    EIP712Upgradeable,
    IERC721Receiver
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum State { INIT, FUNDED, LOCKED, EXECUTION_PENDING, EXECUTED, REFUNDED }

    State public currentState;
    address public counterparty;
    address public guardian;
    bytes32 public commitmentHash;
    uint256 public lockDuration;
    uint256 public lockTimestamp;
    uint256 public refundDelay;

    uint256 public constant QUARANTINE_STAKE = 0.01 ether;
    uint256 public quarantineEndTime;
    address public quarantineInitiator;

    uint256 public nonce;

    bytes32 public constant RECOVERY_TYPEHASH =
        keccak256("Recovery(address newOwner,uint256 nonce,uint256 deadline)");

    event Deposited(address indexed sender, uint256 amount);
    event StateChanged(State indexed from, State indexed to);
    event SecretRevealed(bytes32 secret);
    event Quarantined(address indexed initiator, uint256 endTime);
    event Refunded(address indexed recipient, uint256 amount);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _guardian,
        address _counterparty,
        bytes32 _commitmentHash,
        uint256 _lockDuration
    ) public initializer {
        __Ownable_init();
        _transferOwnership(_owner);
       __EIP712_init("SecureVault");

        guardian = _guardian;
        counterparty = _counterparty;
        commitmentHash = _commitmentHash;
        lockDuration = _lockDuration;
        refundDelay = 24 hours;
        currentState = State.INIT;
    }

    modifier inState(State _state) {
        require(currentState == _state, "Invalid state");
        _;
    }

    modifier nonReentrant() {
        require(_status != 2, "Reentrancy");
        _status = 2;
        _;
        _status = 1;
    }

    uint256 private _status;

    function deposit() external payable inState(State.INIT) {
        require(msg.value > 0, "No ETH");
        _transition(State.INIT, State.FUNDED);
        emit Deposited(msg.sender, msg.value);
    }

    function lock() external onlyOwner inState(State.FUNDED) {
        lockTimestamp = block.timestamp;
        _transition(State.FUNDED, State.LOCKED);
    }

    function initiateExecution(bytes32 secret)
        external
        inState(State.LOCKED)
    {
        require(
            msg.sender == counterparty || msg.sender == owner(),
            "Not allowed"
        );

        require(
            keccak256(abi.encodePacked(secret)) == commitmentHash,
            "Bad secret"
        );

        require(
            block.timestamp >= lockTimestamp + lockDuration,
            "Locked"
        );

        emit SecretRevealed(secret);
        _transition(State.LOCKED, State.EXECUTION_PENDING);
    }

    function execute()
        external
        nonReentrant
        inState(State.EXECUTION_PENDING)
    {
        require(
            msg.sender == counterparty || msg.sender == owner(),
            "Not allowed"
        );

        _transition(State.EXECUTION_PENDING, State.EXECUTED);

        uint256 bal = address(this).balance;
        (bool ok,) = counterparty.call{value: bal}("");
        require(ok, "Transfer failed");
    }

    function refund()
        external
        nonReentrant
    {
        require(msg.sender == owner(), "Only owner");

        require(
            currentState == State.FUNDED ||
            (currentState == State.LOCKED &&
            block.timestamp >= lockTimestamp + lockDuration + refundDelay),
            "Refund blocked"
        );

        State prev = currentState;
        currentState = State.REFUNDED;

        uint256 bal = address(this).balance;
        (bool ok,) = owner().call{value: bal}("");
        require(ok, "Refund failed");

        emit StateChanged(prev, State.REFUNDED);
        emit Refunded(msg.sender, bal);
    }

    function _transition(State from, State to) internal {
        currentState = to;
        emit StateChanged(from, to);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}
}
