import { useEffect, useState } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x44CFfa3A01eEA95B6475e139CCEc122b06c82318";

const ABI = [
  "function deposit() payable",
  "function lock()",
  "function initiateExecution(bytes32 secret)",
  "function execute()",
  "function refund()",
  "function initiateQuarantine() payable",
  "function depositTokens(address token, uint256 amount)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function currentState() view returns(uint8)",
  "function balance() view returns(uint256)"
];

export default function App() {
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [state, setState] = useState(null);
  const [balance, setBalance] = useState("0");

  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");

  // ===== CONNECT =====
  async function connect() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const addr = await signer.getAddress();

    const ctr = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    setContract(ctr);
    setAccount(addr);
  }

  // ===== LOAD STATE =====
  async function load() {
    if (!contract) return;
    const s = await contract.currentState();
    const b = await contract.balance();

    setState(Number(s));
    setBalance(ethers.formatEther(b));
  }

  useEffect(() => {
    load();
  }, [contract]);

  // ===== ACTIONS =====
  const tx = async (fn) => {
    const t = await fn();
    await t.wait();
    load();
  };

  const deposit = () =>
    tx(() => contract.deposit({ value: ethers.parseEther("0.01") }));

  const lock = () => tx(() => contract.lock());

  const reveal = () => tx(() => contract.initiateExecution(secret));

  const execute = () => tx(() => contract.execute());

  const refund = () => tx(() => contract.refund());

  const quarantine = () =>
    tx(() =>
      contract.initiateQuarantine({
        value: ethers.parseEther("0.01")
      })
    );

  const depositToken = () =>
    tx(() => contract.depositTokens(token, amount));

  // ===== ROLE CHECK =====
  async function checkRole(roleName) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(roleName));
    const res = await contract.hasRole(hash, account);
    alert(res ? "YES" : "NO");
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2>Secure Vault (Base)</h2>

        <button onClick={connect} style={styles.btn}>
          {account ? "Connected" : "Connect Wallet"}
        </button>

        <p style={{ opacity: 0.7 }}>{account}</p>
      </div>

      <div style={styles.grid}>

        {/* STATUS */}
        <div style={styles.card}>
          <h3>Vault Status</h3>
          <p>State: {state ?? "—"}</p>
          <p>Balance: {balance} ETH</p>
        </div>

        {/* CORE */}
        <div style={styles.card}>
          <h3>Core Actions</h3>

          <button onClick={deposit} style={styles.btn}>Deposit</button>
          <button onClick={lock} style={styles.btn}>Lock</button>

          <input
            placeholder="secret (bytes32)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={styles.input}
          />

          <button onClick={reveal} style={styles.btn}>Reveal</button>
          <button onClick={execute} style={styles.btn}>Execute</button>
          <button onClick={refund} style={styles.btn}>Refund</button>
        </div>

        {/* QUARANTINE */}
        <div style={styles.card}>
          <h3>Quarantine</h3>
          <button onClick={quarantine} style={styles.btn}>
            Trigger (0.01 ETH)
          </button>
        </div>

        {/* ERC20 */}
        <div style={styles.card}>
          <h3>ERC20</h3>

          <input
            placeholder="token address"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={styles.input}
          />

          <input
            placeholder="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
          />

          <button onClick={depositToken} style={styles.btn}>
            Deposit Tokens
          </button>
        </div>

        {/* ROLES */}
        <div style={styles.card}>
          <h3>Role Check</h3>

          <button onClick={() => checkRole("GUARDIAN_ROLE")} style={styles.btn}>
            Check Guardian
          </button>

          <button
            onClick={() => checkRole("COUNTERPARTY_ROLE")}
            style={styles.btn}
          >
            Check Counterparty
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== STYLE =====
const styles = {
  page: {
    fontFamily: "Arial",
    background: "#0f0f12",
    color: "white",
    minHeight: "100vh",
    padding: 20
  },

  header: {
    marginBottom: 20
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 20
  },

  card: {
    background: "#1a1a1f",
    padding: 15,
    borderRadius: 12,
    border: "1px solid #2a2a33"
  },

  btn: {
    display: "block",
    marginTop: 8,
    padding: 10,
    background: "#2d6cff",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  },

  input: {
    width: "100%",
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    border: "1px solid #333",
    background: "#111",
    color: "white"
  }
};
