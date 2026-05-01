import React, { useState, useCallback } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useBalance,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import { parseEther, formatEther, createSiweMessage, generateSiweNonce } from 'viem';
import { ABI, CONTRACT_ADDRESS, STATE_LABELS } from './contract.js';
import { toBytes32 } from './crypto.js';
import { signRecovery } from './eip712.js';

// ─── tiny UI helpers ────────────────────────────────────────────────────────

const Panel = ({ title, children, accent }) => (
  <div style={{
    background: 'var(--surface)',
    border: `1px solid ${accent ? 'var(--orange)' : 'var(--border)'}`,
    borderLeft: `3px solid ${accent ? 'var(--orange)' : 'var(--border)'}`,
    borderRadius: 2,
    padding: '20px 22px',
    boxShadow: accent ? '0 0 24px var(--orange-glow)' : 'none',
  }}>
    {title && (
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22,
        letterSpacing: 2,
        color: 'var(--orange)',
        marginBottom: 16,
        textTransform: 'uppercase',
      }}>{title}</div>
    )}
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', small }) => {
  const base = {
    padding: small ? '7px 16px' : '11px 22px',
    fontSize: small ? 12 : 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderRadius: 2,
    fontWeight: 600,
    transition: 'all 0.15s',
  };
  const styles = {
    primary: { ...base, background: 'var(--orange)', color: '#000' },
    ghost: { ...base, background: 'transparent', color: 'var(--orange)', border: '1px solid var(--orange)' },
    danger: { ...base, background: '#300', color: 'var(--red)', border: '1px solid var(--red)' },
    dim: { ...base, background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles[variant], opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 5, letterSpacing: 1 }}>
      {label}
    </div>
    {children}
  </div>
);

const Mono = ({ children, small }) => (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: small ? 11 : 13, wordBreak: 'break-all' }}>
    {children}
  </span>
);

const Badge = ({ state }) => {
  const colors = {
    0: '#555', // INIT
    1: '#ffd700', // FUNDED
    2: '#ff6200', // LOCKED
    3: '#ff9900', // EXECUTION_PENDING
    4: '#39ff14', // EXECUTED
    5: '#ff2244', // REFUNDED
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 12px',
      background: colors[state] + '22',
      border: `1px solid ${colors[state]}`,
      color: colors[state],
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      letterSpacing: 2,
      borderRadius: 2,
    }}>
      {STATE_LABELS[state] ?? '???'}
    </span>
  );
};

const TxResult = ({ hash, error }) => {
  if (!hash && !error) return null;
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      background: error ? '#300' : '#002200',
      border: `1px solid ${error ? 'var(--red)' : 'var(--green)'}`,
      borderRadius: 2,
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
      color: error ? 'var(--red)' : 'var(--green)',
      wordBreak: 'break-all',
    }}>
      {error ? `✗ ${String(error).slice(0, 200)}` : `✓ TX: ${hash}`}
    </div>
  );
};

// ─── Sections ────────────────────────────────────────────────────────────────

function ConnectSection({ address, connectors, connect, disconnect, status }) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  return (
    <Panel title="Wallet" accent={!!address}>
      {address ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>CONNECTED</div>
            <Mono>{address}</Mono>
          </div>
          <Btn variant="ghost" small onClick={() => disconnect()}>Disconnect</Btn>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {connectors.map((c) => (
            <Btn key={c.uid} onClick={() => connect({ connector: c })} disabled={status === 'pending'}>
              {status === 'pending' ? 'Connecting…' : `Connect ${c.name}`}
            </Btn>
          ))}
        </div>
      )}
    </Panel>
  );
}

function VaultInfoSection({ address }) {
  const ro = (fn) => ({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: fn,
    query: { enabled: !!address },
  });

  const { data: state } = useReadContract(ro('currentState'));
  const { data: counterparty } = useReadContract(ro('counterparty'));
  const { data: guardian } = useReadContract(ro('guardian'));
  const { data: commitmentHash } = useReadContract(ro('commitmentHash'));
  const { data: lockDuration } = useReadContract(ro('lockDuration'));
  const { data: lockTimestamp } = useReadContract(ro('lockTimestamp'));
  const { data: refundDelay } = useReadContract(ro('refundDelay'));
  const { data: nonce } = useReadContract(ro('nonce'));
  const { data: quarantineEndTime } = useReadContract(ro('quarantineEndTime'));
  const { data: quarantineInitiator } = useReadContract(ro('quarantineInitiator'));
  const { data: balData } = useBalance({ address: CONTRACT_ADDRESS, query: { enabled: !!address } });

  const fmt = (ts) => ts ? new Date(Number(ts) * 1000).toLocaleString() : '—';
  const fmtDur = (s) => {
    if (!s) return '—';
    const h = Number(s) / 3600;
    return h >= 1 ? `${h}h` : `${Number(s)}s`;
  };

  return (
    <Panel title="Vault Status">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {[
          ['State', state !== undefined ? <Badge state={Number(state)} /> : '—'],
          ['Balance', balData ? `${formatEther(balData.value)} ETH` : '—'],
          ['Nonce', nonce?.toString() ?? '—'],
          ['Lock Duration', fmtDur(lockDuration)],
          ['Lock Timestamp', fmt(lockTimestamp)],
          ['Refund Delay', fmtDur(refundDelay)],
          ['Quarantine End', quarantineEndTime ? fmt(quarantineEndTime) : '—'],
        ].map(([label, val]) => (
          <div key={label} style={{ background: 'var(--surface2)', padding: '12px 14px', borderRadius: 2, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 5, letterSpacing: 1 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['Counterparty', counterparty],
          ['Guardian', guardian],
          ['Commitment Hash', commitmentHash],
          ['Quarantine Initiator', quarantineInitiator],
        ].map(([label, val]) => (
          <div key={label} style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: 2, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, letterSpacing: 1 }}>{label}</div>
            <Mono small>{val ?? '—'}</Mono>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function useWrite(fn, buildArgs) {
  const { writeContractAsync } = useWriteContract();
  const [hash, setHash] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const exec = useCallback(async (extraArgs) => {
    setHash(null); setError(null); setPending(true);
    try {
      const args = buildArgs ? buildArgs(extraArgs) : extraArgs;
      const h = await writeContractAsync({ address: CONTRACT_ADDRESS, abi: ABI, functionName: fn, ...args });
      setHash(h);
    } catch (e) {
      setError(e.shortMessage || e.message);
    } finally {
      setPending(false);
    }
  }, [fn, buildArgs, writeContractAsync]);

  return { exec, hash, error, pending };
}

function DepositSection({ address }) {
  const [amount, setAmount] = useState('');
  const { exec, hash, error, pending } = useWrite('deposit');

  return (
    <Panel title="Deposit">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Fund the vault with ETH. Only callable in INIT state.
      </p>
      <Field label="Amount (ETH)">
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
      </Field>
      <Btn onClick={() => exec({ value: parseEther(amount || '0') })} disabled={!address || pending || !amount}>
        {pending ? 'Broadcasting…' : 'Deposit ETH'}
      </Btn>
      <TxResult hash={hash} error={error} />
    </Panel>
  );
}

function LockSection({ address }) {
  const { exec, hash, error, pending } = useWrite('lock');
  return (
    <Panel title="Lock Vault">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Owner-only. Starts the lock timer. Vault must be in FUNDED state.
      </p>
      <Btn onClick={() => exec({})} disabled={!address || pending}>
        {pending ? 'Broadcasting…' : 'Lock Vault'}
      </Btn>
      <TxResult hash={hash} error={error} />
    </Panel>
  );
}

function InitiateExecutionSection({ address }) {
  const [secret, setSecret] = useState('');
  const { exec, hash, error, pending } = useWrite('initiateExecution');

  return (
    <Panel title="Initiate Execution" accent>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Reveal the secret to unlock execution. Must match the commitment hash. Vault must be LOCKED and past lock duration.
      </p>
      <Field label="Secret">
        <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="your secret string" />
      </Field>
      <Btn onClick={() => exec({ args: [toBytes32(secret)] })} disabled={!address || pending || !secret}>
        {pending ? 'Broadcasting…' : 'Reveal Secret'}
      </Btn>
      <TxResult hash={hash} error={error} />
    </Panel>
  );
}

function ExecuteSection({ address }) {
  const { exec, hash, error, pending } = useWrite('execute');
  return (
    <Panel title="Execute Transfer">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Sends vault balance to counterparty. Callable by owner or counterparty in EXECUTION_PENDING state.
      </p>
      <Btn variant="primary" onClick={() => exec({})} disabled={!address || pending}>
        {pending ? 'Broadcasting…' : 'Execute'}
      </Btn>
      <TxResult hash={hash} error={error} />
    </Panel>
  );
}

function RefundSection({ address }) {
  const { exec, hash, error, pending } = useWrite('refund');
  return (
    <Panel title="Refund">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Owner-only. Returns ETH to owner. Available from FUNDED state, or from LOCKED after lock + refundDelay.
      </p>
      <Btn variant="danger" onClick={() => exec({})} disabled={!address || pending}>
        {pending ? 'Broadcasting…' : 'Request Refund'}
      </Btn>
      <TxResult hash={hash} error={error} />
    </Panel>
  );
}

function SignInSection({ address }) {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!address || !walletClient || !publicClient) return;
    setStatus('signing…'); setError('');
    try {
      const nonce = generateSiweNonce();
      const message = createSiweMessage({
        address,
        chainId: 8453,
        domain: window.location.host || 'securevault.base.app',
        nonce,
        uri: window.location.origin || 'https://securevault.base.app',
        version: '1',
      });
      const signature = await walletClient.signMessage({ message });
      const valid = await publicClient.verifySiweMessage({ message, signature });
      if (!valid) throw new Error('SIWE verification failed');
      setStatus('✓ Authenticated via SIWE');
    } catch (e) {
      setError(e.message);
      setStatus('');
    }
  };

  return (
    <Panel title="Sign-In with Ethereum">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Authenticate your wallet using EIP-4361 (SIWE). No Farcaster SDK required.
      </p>
      <Btn variant="ghost" onClick={handleSignIn} disabled={!address}>Sign In with Ethereum</Btn>
      {status && <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>{status}</div>}
      {error && <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)' }}>✗ {error}</div>}
    </Panel>
  );
}

function RecoverySection({ address }) {
  const { data: walletClient } = useWalletClient();
  const [newOwner, setNewOwner] = useState('');
  const [nonce, setNonce] = useState('');
  const [deadline, setDeadline] = useState('');
  const [sig, setSig] = useState('');
  const [error, setError] = useState('');

  const handleSign = async () => {
    if (!walletClient) return;
    setError(''); setSig('');
    try {
      const s = await signRecovery({ walletClient, newOwner, nonce, deadline, chainId: 8453 });
      setSig(s);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Panel title="Recovery (EIP-712)">
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
        Sign a guardian recovery message to transfer ownership. Requires guardian co-signature on-chain.
      </p>
      <Field label="New Owner Address"><input value={newOwner} onChange={e => setNewOwner(e.target.value)} placeholder="0x…" /></Field>
      <Field label="Nonce"><input value={nonce} onChange={e => setNonce(e.target.value)} placeholder="0" /></Field>
      <Field label="Deadline (unix timestamp)"><input value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="1999999999" /></Field>
      <Btn variant="ghost" onClick={handleSign} disabled={!address || !newOwner || !nonce || !deadline}>
        Sign Recovery Message
      </Btn>
      {sig && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>SIGNATURE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', wordBreak: 'break-all', background: 'var(--surface2)', padding: 10, border: '1px solid var(--border)' }}>{sig}</div>
        </div>
      )}
      {error && <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)' }}>✗ {error}</div>}
    </Panel>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  const { address } = useAccount();
  const { connectors, connect, status } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '0 28px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32,
            background: 'var(--orange)',
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 3, color: 'var(--orange)' }}>
            SECURE VAULT
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 2 }}>
            BASE MAINNET
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
          {CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESS.slice(0, 10) + '…' : 'CONTRACT NOT SET'}
        </div>
      </header>

      {/* State flow diagram */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}>
        <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>FLOW:</span>
        {STATE_LABELS.map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ color: 'var(--orange)', letterSpacing: 1 }}>{s}</span>
            {i < STATE_LABELS.length - 1 && <span style={{ color: 'var(--text-muted)' }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ConnectSection address={address} connectors={connectors} connect={connect} disconnect={disconnect} status={status} />

        {address && (
          <>
            <VaultInfoSection address={address} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              <DepositSection address={address} />
              <LockSection address={address} />
              <InitiateExecutionSection address={address} />
              <ExecuteSection address={address} />
              <RefundSection address={address} />
              <SignInSection address={address} />
            </div>
            <RecoverySection address={address} />
          </>
        )}

        {!address && (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            fontSize: 13,
            letterSpacing: 2,
          }}>
            CONNECT WALLET TO ACCESS VAULT
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '16px 28px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <span>SECURE VAULT · BASE MAINNET · EIP-712 · UUPS UPGRADEABLE</span>
        <a href="https://base.dev" style={{ color: 'var(--orange)', textDecoration: 'none' }}>base.dev ↗</a>
      </footer>
    </div>
  );
}
