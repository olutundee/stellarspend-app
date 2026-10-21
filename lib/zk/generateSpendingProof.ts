/**
 * lib/zk/generateSpendingProof.ts
 *
 * Client-side ZK spending-proof generation.
 * Takes the private inputs (paymentAmount and spendingLimit) and executes
 * the Noir spending_proof circuit constraints.
 */

import { initZkToolchain } from './wasmLoader';
import spendingProofCircuit from '../../circuits/spending_proof/target/spending_proof.json';

export interface SpendingProofResult {
  proof: Uint8Array;
  publicInputs: Uint8Array[];
}

/**
 * Helper to encode an integer value into a 32-byte big-endian field element array.
 */
function numberToFieldBytes(num: number): Uint8Array {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(num, 28);
  return new Uint8Array(buf);
}

/**
 * Generates a zero-knowledge spending proof in the browser.
 * Ensures the paymentAmount does not exceed the spendingLimit.
 *
 * @param paymentAmount The payment amount (private input)
 * @param spendingLimit The spending limit threshold (private input)
 * @param statusCallback Optional callback to broadcast proving stages to the UI
 */
export async function generateSpendingProof(
  paymentAmount: number,
  spendingLimit: number,
  statusCallback?: (status: string) => void
): Promise<SpendingProofResult> {
  // 1. Enforce constraints immediately
  if (paymentAmount > spendingLimit) {
    throw new Error(
      `Constraint Validation Failed: Payment amount (${paymentAmount}) exceeds spending limit (${spendingLimit}).`
    );
  }

  // 2. Initialize WASM proving system
  if (statusCallback) statusCallback('Initializing Proving Engine (WASM)...');
  const wasmReady = await initZkToolchain();

  if (!wasmReady) {
    throw new Error(
      'ZK proving engine failed to initialize. The Barretenberg WASM modules could not be loaded.'
    );
  }

  // Dynamic imports of NoirJS components to prevent server-side crashes
  const { Noir } = await import('@noir-lang/noir_js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AztecBb = (await import('@aztec/bb.js')) as any;
  const UltraHonkBackend = AztecBb.UltraHonkBackend || AztecBb.BarretenbergBackend || AztecBb.Barretenberg;

  if (statusCallback) statusCallback('Preparing Noir circuit bytecode...');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noir = new Noir(spendingProofCircuit as any);

  // Evaluation & Witness simulation
  if (statusCallback) statusCallback('Compiling witness inputs...');
  const inputs = {
    payment_amount: paymentAmount,
    spending_limit: spendingLimit
  };

  // Execute circuit with ACVM
  if (statusCallback) statusCallback('Simulating witness execution (ACVM)...');
  const witness = await noir.execute(inputs);

  if (statusCallback) statusCallback('Synthesizing UltraHonk spending proof...');
  const backend = new UltraHonkBackend(spendingProofCircuit.bytecode);
  const proofData = await backend.generateProof(witness);

  if (statusCallback) statusCallback('Verifying proof locally...');
  const isValid = await backend.verifyProof(proofData);

  if (!isValid) {
    throw new Error('Local verification of generated ZK proof failed.');
  }

  return {
    proof: proofData.proof,
    publicInputs: [numberToFieldBytes(spendingLimit)]
  };
}
