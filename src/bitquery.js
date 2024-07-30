require('dotenv').config();
const axios = require('axios');
const logger = require("./logger");

const BITQUERY_ENDPOINT = process.env.BITQUERY_ENDPOINT || 'https://graphql.bitquery.io/';
const BITQUERY_API_KEY = process.env.BITQUERY_API_KEY;

async function fetchGraphQL(query, variables) {
  try {
    const response = await axios.post(
      BITQUERY_ENDPOINT,
      {
        query,
        variables,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': BITQUERY_API_KEY

,
        },
      }
    );

    if (response.data.errors) {
      logger.error('Error fetching data:', response.data.errors);
      throw new Error('Error fetching data');
    }

    return response.data.data;
  } catch (error) {
    logger.error('Error fetching data:', error.message);
    throw new Error(`Error fetching data: ${error.message}`);
  }
}

async function getPoolAddresses() {
  const query = `{
    ethereum(network: solana) {
      dexTrades(
        options: {desc: "tradeAmount"}
        exchangeName: {in: ["Jupiter", "Raydium"]}
        date: {since: "2021-01-01"}
        tradeAmountUsd: {gt: 1000}
      ) {
        poolAddress: smartContract {
          address {
            address
            annotation
          }
        }
        tradeAmount(in: USD)
        transaction {
          hash
        }
      }
    }
  }`;

  try {
    const data = await fetchGraphQL(query, {});
    const { ethereum: { dexTrades } } = data;

    if (!dexTrades.length) {
      throw new Error('No trades found.');
    }

    const { poolAddress: { address } } = dexTrades[0];
    return address;
  } catch (error) {
    logger.error('Error fetching pool addresses:', error.message);
    return null;
  }
}

module.exports = {
  fetchGraphQL,
  getPoolAddresses,
};