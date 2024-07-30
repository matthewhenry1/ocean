require('dotenv').config();
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const { Wallet } = require('@project-serum/anchor');
const bs58 = require('bs58').default;
const logger = require('./logger'); // Import the logger

const SOLANA_NETWORK = 'https://api.mainnet-beta.solana.com';

// Initialize connection
const connection = new Connection(SOLANA_NETWORK);
logger.info('Connecting to Solana network...');

// Verify connection by fetching the current slot
async function verifyConnection() {
  try {
    const slot = await connection.getSlot();
    logger.info(`Connection to Solana network established. Current slot: ${slot}`);
  } catch (error) {
    logger.error('Failed to establish connection to Solana network:', error.message);
  }
}

// Initialize wallet public key
const walletPublicKey = new PublicKey(process.env.PUBLIC_KEY);
logger.info(`Wallet public key initialized: ${walletPublicKey.toBase58()}`);

// Decode private key
const privateKey = process.env.PRIVATE_KEY;
const secretKeyUint8Array = bs58.decode(privateKey);
logger.info('Private key decoded.');

// Initialize wallet
const wallet = new Wallet(Keypair.fromSecretKey(secretKeyUint8Array));
logger.info(`Wallet initialized with public key: ${wallet.publicKey.toBase58()}`);

// Verify the connection
verifyConnection();

module.exports = { connection, wallet, walletPublicKey, VersionedTransaction };