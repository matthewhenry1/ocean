require('dotenv').config();
const axios = require('axios');
const { connection, wallet, VersionedTransaction } = require('./wallet');
const logger = require("./logger");

const JUPITER_API_BASE_URL = process.env.JUPITER_API_BASE_URL || 'https://quote-api.jup.ag/v6';

async function getQuote(tokenA, tokenB, amount, slippageBps) {
  const quoteUrl = `${JUPITER_API_BASE_URL}/quote?inputMint=${tokenB}&outputMint=${tokenA}&amount=${amount}&slippageBps=${slippageBps}`;
  logger.info('Quote URL:', quoteUrl);

  try {
    const response = await axios.get(quoteUrl);
    const quoteData = response.data;

    if (quoteData.errorCode === 'TOKEN_NOT_TRADABLE' || quoteData.errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
      logger.error('Error: ', quoteData.error);
      throw new Error(quoteData.error);
    }

    return quoteData;
  } catch (error) {
    throw new Error(`Failed to get quote: ${error.message}`);
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
  logger.info('Swap Transaction Buffer:', swapTransactionBuf);
  
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

  return { txid, confirmation };
}

async function swapTokens(tokenA, tokenB, amount, slippageBps) {
  try {
    const quoteData = await getQuote(tokenA, tokenB, amount, slippageBps);
    logger.info('Quote Data:', quoteData);

    const swapTransaction = await getSwapTransaction(quoteData);
    logger.info('Swap Transaction:', swapTransaction);

    const { txid, confirmation } = await sendAndConfirmTransaction(swapTransaction);
    logger.info('Transaction ID:', txid);
    logger.info('Confirmation:', confirmation);
  } catch (error) {
    logger.error('Swap failed:', error.message);
    throw error;
  }
}

module.exports = { swapTokens };