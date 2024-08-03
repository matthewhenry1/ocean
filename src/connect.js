require('dotenv').config();
const WebSocket = require("ws");

const BITQUERY_WS_URL = "wss://streaming.bitquery.io/graphql";
const BITQUERY_OAUTH_TOKEN = process.env.BITQUERY_OAUTH_TOKEN; // Replace with your actual token

const bitqueryConnection = new WebSocket(
    `${BITQUERY_WS_URL}?token=${BITQUERY_OAUTH_TOKEN}`,
    ["graphql-ws"]
);

bitqueryConnection.on("open", () => {
    console.log("Connected to Bitquery.");

    // Send initialization message
    const initMessage = JSON.stringify({ type: "connection_init" });
    bitqueryConnection.send(initMessage);

    // After initialization, send the actual subscription message
    setTimeout(() => {
        const message = JSON.stringify({
            type: "start",
            id: "1",
            payload: {
                query: `
                subscription {
                    Solana {
                        Instructions(
                        where: {Transaction: {Result: {Success: true}}, Instruction: {Program: {Method: {is: "initializeUserWithNonce"}, Address: {is: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"}}}}
                        ) {
                        Instruction {
                            Accounts {
                            Address
                            }
                        }
                        }
                    }
                    }
                `
            },
        });

        bitqueryConnection.send(message);
    }, 1000);
});

bitqueryConnection.on("message", (data) => {
    const response = JSON.parse(data);
    if (response.type === "data") {
        // Broadcast the data to all connected clients of your local server
        console.log(`Received data from Bitquery: ${JSON.stringify(response.payload.data)}`);

        // Close the connection after receiving data
        // bitqueryConnection.close();
    }
});

bitqueryConnection.on("close", () => {
    console.log("Disconnected from Bitquery.");
});

bitqueryConnection.on("error", (error) => {
    console.error(`WebSocket Error: ${JSON.stringify(error)}`);
});