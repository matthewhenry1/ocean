require('dotenv').config();
const axios = require('axios');
const lodash = require('lodash');
const { Connection, PublicKey } = require('@solana/web3.js');
const { AccountLayout, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const logger = require('./logger');
const { sleep } = require("./util");

const BITQUERY_API_URL = 'https://streaming.bitquery.io/eap';
const BITQUERY_OAUTH_TOKEN = process.env.BITQUERY_OAUTH_TOKEN;
const SOLANA_NETWORK = 'https://api.mainnet-beta.solana.com';

const connection = new Connection(SOLANA_NETWORK);

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
    if (error.response && error.response.status === 429) {
      // Handle rate limiting by sleeping and retrying
      logger.warn('Too Many Requests. Retrying after a delay...');
      await sleep(5);
      return fetchGraphQL(query);
    } else {
      throw new Error(`HTTP error! status: ${error.response.status}`);
    }
  }
}

function summarizeData(data, length = 50) {
  if (data.length <= length) {
    return data;
  }
  const half = Math.floor(length / 2);
  return `${data.substring(0, half)}...${data.substring(data.length - half)}`;
}

function convertBigIntToString(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  } else if (Array.isArray(value)) {
    return value.map(convertBigIntToString);
  } else if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertBigIntToString(v)]));
  } else {
    return value;
  }
}

async function getAccountInfo(accountAddress) {
  try {
    await sleep(1);
    const publicKey = new PublicKey(accountAddress);
    const accountInfo = await connection.getAccountInfo(publicKey);

    if (accountInfo === null) {
      throw new Error('Account not found');
    }

    logger.info(`accountInfo.data ${accountInfo?.data?.length > 0 ? 'has data' : 'is empty'}`);

    let parsedData;
    if (accountInfo.data.length > 0) {
      const accountDataBuffer = Buffer.from(accountInfo.data);
      if (accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        parsedData = AccountLayout.decode(accountDataBuffer);
      } else if (accountInfo.executable) {
        parsedData = 'Program Account Data (ELF format)';
      } else {
        parsedData = summarizeData(accountDataBuffer.toString('hex')); // Fallback to summarized raw hex data for non-token accounts
      }
    }

    const result = {
      solscanUrl: `https://solscan.io/token/${accountAddress}`,
      address: accountAddress,
      lamports: accountInfo.lamports.toString(), // Convert BigInt to string
      owner: accountInfo.owner.toString(),
      executable: accountInfo.executable,
      rentEpoch: accountInfo.rentEpoch.toString(), // Convert BigInt to string
      data: parsedData,
    };

    const safeResult = convertBigIntToString(result);
    logger.info(`getAccountInfo result ${JSON.stringify(safeResult, null, 4)}`);

    return safeResult;
  } catch (error) {
    logger.error(`Error fetching account info for ${accountAddress}: ${error.message}`);
    return null;
  }
}

/**
 * https://www.coingecko.com/learn/what-is-solscan-and-how-to-use-it#:~:text=Visit%20the%20Solscan%20Platform%20and,to%20see%20the%20token%20details.
 * isOnCurve: OnCurve addresses have private keys. If the account’s variable is set to True, then the account has a corresponding private key that controls access. Off-curve addresses do not have private keys.
 */
async function checkIfLiquidityBurned(accountInfo) {
  const result = accountInfo?.lamports === '0';
  logger.info(`checkIfLiquidityBurned result ${result}`);
  return result;
}

async function getPoolAddresses() {
  try {
    const data = await fetchGraphQL(query);
    const instructions = lodash.get(data, 'data.Solana.Instructions', []);

    if (!instructions.length) {
      throw new Error('No instructions found.');
    }

    logger.info(`getPoolAddress response ${JSON.stringify(instructions, null, 4)}`);

    const [instructionWrapper] = instructions;
    const { Instruction: { Accounts } } = instructionWrapper;
    logger.info(`getPoolAddress Accounts ${JSON.stringify(Accounts, null, 4)}`);

    const totalAccounts = Accounts.length;
    logger.info(`getPoolAddress totalAccounts ${totalAccounts}`);

    let counter = 1;
    const results = [];
    for (const account of Accounts) {
     
      logger.info(`getPoolAddress account ${account.Address} counter ${counter} totalAccounts ${totalAccounts}`);
      const accountInfo = await getAccountInfo(account.Address);

      if (!accountInfo || !accountInfo.data || typeof accountInfo.data !== 'object') {
        logger.warn(`Skipping account with unparsed data: ${account.Address}`);
        counter++;
        continue;
      }

      results.push({ ...accountInfo, isBurned: await checkIfLiquidityBurned(accountInfo) });
      
      counter++;
    }

    const filteredResult = results.filter(result => result !== null);
    logger.info(`getPoolAddress returning filteredResult ${JSON.stringify(filteredResult, null, 4)}`);
    return filteredResult;

  } catch (error) {
    logger.error(`Error fetching data: ${JSON.stringify(error.message)}`);
    return [];
  }
}

module.exports = {
  fetchGraphQL,
  getPoolAddresses,
};