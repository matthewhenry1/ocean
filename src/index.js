require('dotenv').config();
const { getPoolAddresses } = require('./bitquery');
const { swapTokens } = require('./swap');
const { walletPublicKey } = require('./wallet');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

async function main() {
  logger.info('Starting main function...');

  const maxRetries = process.env.MAX_RETRIES || 5;
  let attempts = 0;
  let success = false;

  while (attempts < maxRetries && !success) {
    attempts++;
    logger.info(`Attempt ${attempts}/${maxRetries} to find a valid token pair...`);

    try {
      const { tokenA, tokenB } = await getPoolAddresses();

      logger.info(`Token A: ${tokenA}`);
      logger.info(`Token B: ${tokenB}`);
      logger.info(`Wallet Public Key: ${walletPublicKey.toBase58()}`);

      if (tokenA && tokenB) {
        await swapTokens(tokenA, tokenB, 10000, 150); // Amount and slippage are parameters now
        logger.info('Swap successful!');
        success = true;
      } else {
        logger.warn('Invalid token pair, retrying...');
      }
    } catch (error) {
      logger.error(`Error during attempt ${attempts}: ${error.message}`);
    }
  }

  if (!success) {
    logger.error('Max retries reached. Could not find a valid token pair to swap.');
  }
}

main().catch(error => logger.error('Main function error:', error));