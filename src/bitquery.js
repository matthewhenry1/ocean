require('dotenv').config();
const axios = require('axios');
const lodash = require('lodash');

const logger = require("./logger");
const BITQUERY_API_URL = 'https://streaming.bitquery.io/eap';
const BITQUERY_OAUTH_TOKEN = process.env.BITQUERY_OAUTH_TOKEN;

const gql = (strings, ...values) =>
  strings.reduce((final, str, i) => final + str + (values[i] || ''), '');

const query = gql`
  {
    Solana {
      Instructions(
        where: {
          Transaction: { Result: { Success: true } }
          Instruction: {
            Program: {
              Method: { is: "initializeUserWithNonce" }
              Address: { is: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8" }
            }
          }
        }
        limit: { count: 1 }
        orderBy: { ascending: Block_Date }
      ) {
        Instruction {
          Accounts {
            Address
          }
        }
      }
    }
  }
`;

async function fetchGraphQL(query) {
  try {
    const response = await axios.post(
      BITQUERY_API_URL,
      { query },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BITQUERY_OAUTH_TOKEN}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`HTTP error! status: ${error.response.status}`);
  }
}

async function getPoolAddresses() {
  try {
    const data = await fetchGraphQL(query);
    const instructions = lodash.get(data, 'data.Solana.Instructions', []);

    if (!instructions.length) {
      throw new Error('No instructions found.');
    }

    return instructions.map(({ Instruction: { Accounts } }) => ({
      poolAddress: Accounts.length > 4 ? Accounts[4].Address : undefined,
      tokenA: Accounts.length > 8 ? Accounts[8].Address : undefined,
      tokenB: Accounts.length > 9 ? Accounts[9].Address : undefined,
    }))[0];
  } catch (error) {
    logger.error('Error fetching data:', error);
    return { poolAddress: '', tokenA: '', tokenB: '' };
  }
}

module.exports = {
  fetchGraphQL,
  getPoolAddresses,
};
