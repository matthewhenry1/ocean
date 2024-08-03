require('dotenv').config();
const { getPoolAddresses } = require('./bitquery');
const { swapTokens, isTokenTradable } = require('./swap');
const logger = require('./logger');
const config = require("./config");
const { sleep } = require("./util");

async function main() {
  logger.info('Starting main function...');

  const maxRetries = process.env.MAX_RETRIES || 5;
  let attempts = 0;
  let success = false;

  while (attempts < maxRetries && !success) {
    attempts++;
    logger.info(`Attempt ${attempts}/${maxRetries} to find a valid token pair...`);

    try {
      const buyAddresses = await getPoolAddresses();

      for (const buyToken of buyAddresses) {
        logger.info(`Checking if Buy Token is tradable: ${buyToken.address}`);
        const isTradable = await isTokenTradable(buyToken.address);

        if (!isTradable) {
          logger.warn(`Token not tradable: ${buyToken.address}`);
          continue;
        }

        logger.info(`Attempting to swap with Buy Token: ${buyToken.address}`);
        success = await swapTokens(buyToken.address, config.SOLANA.ADDRESS, 10000, 150);
        await sleep(1.5);
        if (success) {
          logger.info('Swap successful!');
          break;
        }
      }
    } catch (error) {
      logger.error(`Error during attempt ${attempts}: ${error.message}`);
    }

    if (!success && attempts < maxRetries) {
      logger.info('Retrying...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before retrying
    }
  }

  if (!success) {
    logger.error('Failed to complete the swap after maximum retries.');
  }
}

main().catch(error => logger.error('Main function error:', error));