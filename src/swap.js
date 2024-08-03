require('dotenv').config();
const axios = require('axios');
const { connection, wallet, VersionedTransaction } = require('./wallet');
const logger = require('./logger');

const JUPITER_API_BASE_URL = process.env.JUPITER_API_BASE_URL || 'https://quote-api.jup.ag/v6';

function isValidSolanaAddress(address) {
  // Simple validation check for Solana addresses (32 characters and base58)
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

async function isTokenTradable(tokenAddress) {
  const url = `${JUPITER_API_BASE_URL}/tokens`;
  try {
    const response = await axios.get(url);
    const tradableTokens = response.data;
    return tradableTokens.some(token => token.address === tokenAddress);
  } catch (error) {
    logger.error(`Failed to check if token is tradable: ${error.message}`);
    return false;
  }
}

async function getQuote(buyTokenAddress, sellTokenAddress, amount, slippageBps) {
  if (!isValidSolanaAddress(buyTokenAddress) || !isValidSolanaAddress(sellTokenAddress)) {
    throw new Error(`Invalid Solana address. Buy: ${buyTokenAddress}, Sell: ${sellTokenAddress}`);
  }

  const quoteUrl = `${JUPITER_API_BASE_URL}/quote?inputMint=${sellTokenAddress}&outputMint=${buyTokenAddress}&amount=${amount}&slippageBps=${slippageBps}`;
  logger.info(`Quote URL: ${quoteUrl}`);

  try {
    const response = await axios.get(quoteUrl);
    const quoteData = response.data;

    if (quoteData.errorCode) {
      logger.error(`Quote API error: ${quoteData.errorCode}, Message: ${quoteData.message}`);
      throw new Error(quoteData.message);
    }

    return quoteData;
  } catch (error) {
    logger.error(`Quote API request failed: ${error.response ? JSON.stringify(error.response.data) : JSON.stringify(error.message)}`);
    throw new Error(`Failed to get quote: ${error.response ? JSON.stringify(error.response.data) : JSON.stringify(error.message)}`);
  }
}

async function getSwapTransaction(quoteData) {
  try {
    const response = await axios.post(
      `${JUPITER_API_BASE_URL}/swap`,
      {
        quoteResponse: quoteData,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return response.data.swapTransaction;
  } catch (error) {
    throw new Error(`Failed to get swap transaction: ${error.message}`);
  }
}

async function sendAndConfirmTransaction(swapTransaction) {
  const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
  logger.info(`Swap Transaction Buffer: ${swapTransactionBuf.toString('hex')}`);
  
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  transaction.sign([wallet.payer]);

  const rawTransaction = transaction.serialize();
  const txid = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false,
    maxRetries: 4,
    preflightCommitment: 'confirmed',
    commitment: 'confirmed',
  });

  const timeout = 60 * 1000; // 60 seconds
  const confirmation = await connection.confirmTransaction(txid, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${confirmation.value.err}`);
  }

  logger.info(`Transaction successful: https://solscan.io/tx/${txid}`);
  return { txid, confirmation };
}

async function swapTokens(buyTokenAddress, sellTokenAddress, amount = 10000, slippageBps = 150) {
  let success = false;
  try {
    const quoteData = await getQuote(buyTokenAddress, sellTokenAddress, amount, slippageBps);
    logger.info(`Quote Data: ${JSON.stringify(quoteData, null, 2)}`);

    const swapTransaction = await getSwapTransaction(quoteData);
    logger.info(`Swap Transaction: ${JSON.stringify(swapTransaction, null, 2)}`);

    const { txid, confirmation } = await sendAndConfirmTransaction(swapTransaction);
    logger.info(`Transaction ID: ${txid}`);
    logger.info(`Confirmation: ${JSON.stringify(confirmation, null, 2)}`);
    success = true;
  } catch (error) {
    logger.error(`Swap failed: ${JSON.stringify(error.message)}`);
  }
  return success;
}

module.exports = { swapTokens, isTokenTradable };