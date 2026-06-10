const {
    CrossChainState
} = require('midnight-crosschain');

const state = new CrossChainState("https://indexer.preprod.midnight.network/api/v4/graphql",
        "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",'e18145baaee32c097b65a7a8100f196cef5790c07e1814d62a309c9a082837ae');

state.getContractState().then((res) => {
    console.log(res.ledgerState.smgPKThreshold);
    const nightToken = '0000000000000000000000000000000000000000000000000000000000000000';
    console.log(res.balances[nightToken]);
}).catch((err) => {
    console.error(err);
});
