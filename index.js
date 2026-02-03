// // This file is part of midnightntwrk/example-counter.
// // Copyright (C) 2025 Midnight Foundation
// // SPDX-License-Identifier: Apache-2.0
// // Licensed under the Apache License, Version 2.0 (the "License");
// // You may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// // http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.

import "dotenv/config";
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'readline/promises';
// // import { type Logger } from 'pino';
import {
    CrossChainApi, MidnightWalletSDK, initNetwork
    , pad
    , getTreasuryCoinsFromState, upgradeContractCircuit, removeContractCircuit,configuration
} from 'midnight-crosschain';
// import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as fs from 'fs/promises'

import * as runtime from '@midnight-ntwrk/compact-runtime'
// import { createCoinInfo } from '@midnight-ntwrk/zswap';
import { coinCommitment, communicationCommitmentRandomness, nativeToken, sampleCoinPublicKey, decodeRawTokenType, rawTokenType, encodeRawTokenType, LedgerParameters } from '@midnight-ntwrk/ledger-v7';
import { MidnightBech32m, ShieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import * as Rx from 'rxjs';
import { assertIsContractAddress, fromHex, parseCoinPublicKeyToHex, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { assert } from 'node:console';
// import { CoinInfo, decodeRawTokenType, encodeTokenType, Transaction, TransactionId, tokenType, communicationCommitmentRandomness, sampleCoinPublicKey, encodeCoinInfo, createCoinInfo } from '@midnight-ntwrk/ledger';

// import path from 'node:path';

import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english';
import * as facade from '@midnight-ntwrk/wallet-sdk-facade';

// dotenv.config({ path: path.join('.', '.env') });
// import { BigNumber } from 'bignumber.js';

// /**
//  * This seed gives access to tokens minted in the genesis block of a local development node - only
//  * used in standalone networks to build a wallet with initial funds.
//  */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new counter contract
  2. Join an existing counter contract
  3. Upgrade circuit
  0. Exit
Which would you like to do? `;

const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Display wallet balance
  2. Display contract balance
  3-0. Display token pairs & fee common config
  3-1. addTokenPair [tokenPairId]
  3-2. removeTokenPair [tokenPairId]
  3-3. setFeeCommonConfig [chainId] [fee]
  3-4. getTokensTotalSupply [tokenType]
  4-1. userLock
  4-2. smgRelease
  4-3. smgMint
  4-4. userBurn
  4-5. voteMultiCrossProposal [[proposalId0 ... proposalId4]]
  4-6. executeMultiCrossProposal [[proposalId0 coinIndex ... proposalId4 0]]
  5-0. Display smgThreshold & smgPks ( getLedgerState )
  5-1. setSmgPksks
  5-2. setSmgPKThreold
  5-3. updateSmgPk
  6-0. show user claim info
  6-1. userRechargeForFee [amount]
  6-2. userClaimMappingToken [id]
  0. Exit
Which would you like to do? `;
// const NETWORKID = 'preview';//'undeployed';//
const NETWORKID = 'undeployed';//'undeployed';//
initNetwork(NETWORKID);
const api = new CrossChainApi();

const join = async (rli) => {
    const contractAddress = await rli.question('What is the contract address (in hex)? ');
    console.log('Joining contract at:', contractAddress);
    await api.join(contractAddress);
    return contractAddress;
};

const selectAndReadFile = async (rli) => {
    const filePath = await rli.question('What is the file path? (please press enter directly to select default)');
    while (filePath) {
        try {
            const fileComment = await fs.readFile(filePath, { encoding: "ascii" });
            console.log(`select file: ${filePath}`);
            return { filePath: filePath, fileComment: fileComment };
        } catch (error) {
            console.log(`select file: ${circuit} error: ${error}`);
            const circuit = await rli.question('What is the file path? (please press enter directly to select default)');
        }
    }
    console.log(`select file: default`);
}

const upgradeContract = async (rli) => {
    const contractAddress = await rli.question('What is the contract address? ');
    const circuitId = await rli.question('What is the circuit id? ');
    let circuitFile = await selectAndReadFile(rli);
    if (!circuitFile) {
        circuitFile = { fileComment: await api.providers.zkConfigProvider.getVerifierKey(circuitId), filePath: 'default' };
    }
    console.log(`Upgrading contract (${contractAddress}) circuitId ${circuitId} with new circuit: ${circuitFile ? circuitFile.filePath : 'default'}`);
    const contractState = await api.providers.publicDataProvider.queryContractState(contractAddress);

    if (contractState.operation(circuitId)) {
        console.log(`Remove Contract Circuit ${circuitId} first ...`);
        const ret = await removeContractCircuit(api.providers, contractAddress, circuitId);
        if (ret) console.log(`Remove Contract Circuit ${ret.status}, ${ret}`);
        console.log(`Remove Contract Circuit Tx at block:${ret.blockHeight} txHash:${ret.blockHash}`);
    }

    return await upgradeContractCircuit(api.providers, contractAddress, circuitId, circuitFile.fileComment);
}

const deployOrJoin = async (rli) => {
    try {
        const contractAddr = await fs.readFile('contractAddr', 'ascii');
        if (!contractAddr) throw new Error('No contract address found, deploying new contract or specify a contract address ...');
        await api.join(contractAddr);
        return contractAddr;
    } catch (error) {
        console.log('No contract address found, deploying new contract or specify a contract address ...');
    }


    while (true) {
        const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
        switch (choice) {
            case '1':
                console.log('Begin to deploy contract ...');
                const contractAddr = await api.deployContract(0n, 1, '0100a2ebc5b7e2f50478398f6d5e609d71e7dfbb307ad3d8883bf5bf46d89e875cff');
                console.log('Contract deployed at:', contractAddr);
                await fs.writeFile('contractAddr', contractAddr, 'ascii');
                return contractAddr;
            case '2':
                return await join(rli);
            case '3':
                console.log('Begin to upgrade circuit ...');
                const ret = await upgradeContract(rli);
                console.log(`Upgrade Contract Tx at block:${ret.blockHeight} txHash:${ret.blockHash}`);
                break;
            case '0':
                console.info('Exiting...');
                return null;
            default:
                console.error(`Invalid choice: ${choice}`);
        }
    }
};

const tokenPair = [
    {
        tokenPairId: 1,
        fromChainId: 1,
        toChainId: 2,
        midnightTokenAccount: nativeToken(),
        fee: 0,
        isMappingToken: false
    },
    {
        tokenPairId: 2,
        fromChainId: 2,
        toChainId: 1,
        midnightTokenAccount: 'ETH',
        fee: 0,
        isMappingToken: true
    },
    {
        tokenPairId: 1236,
        fromChainId: 1073741862,
        toChainId: 2153201998,
        midnightTokenAccount: 'Wan',
        fee: 0,
        isMappingToken: true
    }
]

// const config = {
//     // logDir: `testnet-remote.log`,
//     indexer: 'http://54.187.143.74:8088/api/v3/graphql',//'https://indexer.preview.midnight.network/api/v3/graphql',
//     indexerWS: 'ws://54.187.143.74:8088/api/v3/graphql/ws',//'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
//     node: 'ws://54.187.143.74:9944',//'https://rpc.preview.midnight.network',
//     proofServer: 'http://54.187.143.74:6300',//'http://127.0.0.1:6300'//
//     // proofServer: 'http://44.229.225.45:6300',//'http://127.0.0.1:6300'//
//     // zkConfigPath: '/home/liulin/midnight/midnight-crosschain/src/managed/crosschain/'
// };

// const config = {
//     // logDir: `testnet-remote.log`,
//     indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
//     indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
//     node: 'https://rpc.preview.midnight.network',
//     proofServer: 'https://lace-proof-pub.preview.midnight.network',//'http://127.0.0.1:6300'//
//     // proofServer: 'http://44.229.225.45:6300',//'http://127.0.0.1:6300'//
//     // zkConfigPath: '/home/liulin/midnight/midnight-crosschain/src/managed/crosschain/'
// };

const config = {
    // logDir: `testnet-remote.log`,
    indexer: 'http://localhost:8088/api/v3/graphql',
    indexerWS: 'ws://localhost:8088/api/v3/graphql/ws',
    node: 'http://localhost:9944',
    proofServer: 'http://localhost:6300',//'http://127.0.0.1:6300'//
    // proofServer: 'http://44.229.225.45:6300',//'http://127.0.0.1:6300'//
    // zkConfigPath: '/home/liulin/midnight/midnight-crosschain/src/managed/crosschain/'
};

const proofData = {
    smgId: '0000000000000000000000000000000000000000000000000000000000000001',
    uniqueId: '0000000000000000000000000000000000000000000000000000000000000012',
    tokenPairId: 1,
    amount: 1111,
    fee: 2,
    toAddr: 'addr',
    coins: Array.from({ length: 4 }, (_, i) => i),
    signers: Array.from({ length: 29 }, (_, i) => i),
    ttl: 100000
};
// console.log(...Object.values(proofData));
// const arr = Object.values(api.newProofData(...Object.values(proofData)));
// console.log(...arr);
// console.log(pad('Deep-Seek', 32));
// console.log(Buffer.from(encodeTokenType('02002d0349c68eb1df471377819ea38d45bffdf1f072b4a54d9a1e93326104b5')).toString('hex'));


const showCoinsOfToken = (state, tokenType) => {
    // const token = encodeTokenType(tokenType);
    // if(!state.treasuryCoins.member(token)){
    //     console.log(`None ${tokenType} coins in treasury`);
    //     return;
    // }

    const allCoins = getTreasuryCoinsFromState(state);


    for (const [tokenTypeOfCoin, coinMap] of allCoins) {
        console.log(`tokenTypeOfCoin:${tokenTypeOfCoin}`);
        if (tokenTypeOfCoin === tokenType) {
            for (const [coinIndex, coin] of coinMap) {
                console.log(`[${coinIndex}]: color:${toHex(coin.color)},nonce:${toHex(coin.nonce)},value:${coin.value},mt_index:${coin.mt_index}`);
            }
        }
    }
}

export const getCoinPublicKeyFromShieldAddress = (shieldAddr) => {
    const tmp1 = MidnightBech32m.parse(shieldAddr);//('mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600');
    const tmp2 = ShieldedAddress.codec.decode(tmp1.network, tmp1);
    // console.log('coinPublicKeyString:', toHex(tmp2.coinPublicKey.data));
    return tmp2.coinPublicKeyString();
}

function signProof(proofData) {
    const proof = api.newProofData(...Object.values(proofData));
    const hash = api.caculateHashOfProofData(proof);
    const signResult = proofData.signers.map(v => {
        return signData(1n, BigInt(v));
    });
    const Rs = signResult.map(v => v.R);
    const Ss = signResult.map(v => v.s);
    const R = Rs.reduce((acc, cur) => runtime.ecAdd(acc, cur));
    const s = Ss.reduce((acc, cur) => acc + cur);

    return { R, s };
}

function verifySignature(proofData, Ps, R, s) {
    const proof = api.newProofData(...Object.values(proofData));
    const hash = 1n;//api.caculateHashOfProofData(proof);
    const P = Ps.reduce((acc, p) => runtime.ecAdd(acc, p));
    const left = runtime.ecMulGenerator(BigInt(s));
    const right = runtime.ecAdd(runtime.ecMul(P, hash), R);
    return left.x === right.x && left.y === right.y;
}

const mainLoop = async (rli, wallet) => {
    console.log('api initializing...');
    await api.init(config, wallet);
    console.log('api initailized');

    // {
    //     const curcuitId = 'approveUserWithdrawFee';
    //     const vkPath = '/home/liulin/midnight/midnight-crosschain-test/node_modules/midnight-crosschain/dist/managed/crosschain/keys/';
    //     const file = vkPath + curcuitId + '.verifier';
    //     const verifyHex = await fs.readFile(file);
    //     const ret = await removeContractCircuit(api.providers, '0200977b217a300ca8ef78c088a39028341c1845ef11edda84d43c28d3334cd76863', curcuitId);
    //     assert(ret.status == 'SucceedEntirely','remove contract circuit failed');
    //     await upgradeContractCircuit(api.providers, '0200977b217a300ca8ef78c088a39028341c1845ef11edda84d43c28d3334cd76863', 'approveUserWithdrawFee', Buffer.from(verifyHex).toString('hex'));
    // }

    const counterContract = await deployOrJoin(rli);
    if (!counterContract) {
        console.log('no contract deployed or joined, exit');
        return;
    }
    console.log(api.crossChainContract.deployTxData.public.contractAddress);
    console.log(`contract address:${api.crossChainContract.deployTxData.public.contractAddress},deploy block:${api.crossChainContract.deployTxData.public.blockHeight},
        deploy block hash:${api.crossChainContract.deployTxData.public.blockHash}, fee:${api.crossChainContract.deployTxData.public.tx.fees(LedgerParameters.dummyParameters())}`);

    // const ret = await api.smgMint('8612999a5702039d16e48ec4c605bd83a4b8518cab706c29f7db89219d648422'
    //     , '000000000000000000000000000000000000000000000000006465765f323537'
    //     , 1236, 12345678, 0, 'mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600', 1762836067017);
    while (true) {
        try {
            const cmd = await rli.question(MAIN_LOOP_QUESTION);
            const [choice, ...args] = cmd.split(' ');

            switch (choice) {
                case '1': {
                    const balances = await walletSdk.getBalances();
                    console.log('Balances:', balances);
                    // for (const tokenType in balances) {
                    //     console.log(`Balance of ${tokenType}: ${balances[tokenType]}`);
                    // }
                    break;
                }
                case '2':
                    const tokenTypeStr = (args && args.length === 1) ? args[0] : nativeToken();
                    console.log(`tokenType:${tokenTypeStr}`);
                    const ledgerState = await api.getLedgerState();
                    showCoinsOfToken(ledgerState, tokenTypeStr);
                    break;
                case '3-0': {
                    const state = await api.getLedgerState();
                    console.log(`--------------------------------   tokenPair   ---------------------------------`);
                    for (const [tokenPairId, tokenPair] of state.tokenPairs) {
                        console.log(`tokenPairId: ${tokenPairId}, fromChainId: ${tokenPair.fromChainId}, toChainId: ${tokenPair.toChainId}, midnigthTokenAccount: ${toHex(tokenPair.midnigthTokenAccount)}, isMappintToken: ${tokenPair.domainSep}, fee: ${tokenPair.fee}`);
                    }
                    console.log(`--------------------------------   feeCommonConfig   ---------------------------------`);
                    for (const [chainId, fee] of state.feeCommonConfig) {
                        console.log(`chainId: ${chainId.toString(10)}, fee: ${fee}`);
                    }
                    break;
                }
                case '3-2': {
                    if (!args || args.length !== 1) {
                        console.log('invalid args');
                        break;
                    }
                    await api.removeTokenPair(args[0]);
                    console.log(`removeTokenPair ${args[0]}`);
                    break;
                }
                case '3-3': {
                    if (!args || args.length !== 2) {
                        console.log('invalid args');
                        break;
                    }
                    await api.setFeeCommonConfig(args[0], args[1]);
                    console.log(`setFeeCommonConfig ${args[0]} ${args[1]}`);
                    break;
                }
                case '3-4': {
                    // const token_0 = args.map(arg => encodeTokenType(arg));
                    const totalSupply = await api.getTokensTotalSupply(args);
                    console.log(`--------------------------------   totalSupply   ---------------------------------`);
                    totalSupply.forEach((t) => console.log(`token:${t.token} totalSupply:${t.totalSupply}`));
                    break;
                }
                case '3': {
                    if (!args || args.length !== 1) {
                        console.log('invalid args');
                        break;
                    }
                    const tokenPairIndex = args[0] * 1 - 1;
                    const tokenPairSelect = tokenPair[tokenPairIndex];
                    console.log(`addTokenPair ${tokenPairIndex}:${JSON.stringify(tokenPairSelect)}`);
                    let domainSep = '';
                    let midnightTokenAccount = tokenPairSelect.midnightTokenAccount;
                    if (tokenPairSelect.isMappingToken) {
                        midnightTokenAccount = rawTokenType(pad(tokenPairSelect.midnightTokenAccount, 32), api.crossChainContract.deployTxData.public.contractAddress);
                        domainSep = tokenPairSelect.midnightTokenAccount;
                    }
                    console.log(`addTokenPair:${midnightTokenAccount} domainSep:${domainSep}`);
                    await api.addTokenPair(tokenPairSelect.tokenPairId, tokenPairSelect.fromChainId, tokenPairSelect.toChainId, midnightTokenAccount, domainSep, tokenPairSelect.fee);
                    break;
                }
                case '4-1': {
                    if (!args || args.length !== 4) {
                        await api.userLock('0000000000000000000000000000000000000000000000000000000000000001', '0x1d1e18e1a484d0a10623661546ba97DEfAB7a7AE', 1, 123);
                    } else {
                        await api.userLock(...args);
                    }

                    break;
                }
                case '4-2': {
                    const ledgerState = await api.getLedgerState();
                    const treasuryCoins = getTreasuryCoinsFromState(ledgerState);

                    let proofData;
                    if (!args || args.length !== 4) {
                        const tokenType = decodeRawTokenType(ledgerState.tokenPairs.lookup(BigInt(1)).midnigthTokenAccount);
                        const coins = treasuryCoins.get(tokenType);
                        for (const [id, coin] of coins) {
                            console.log(`[${id}]: color:${toHex(coin.color)}, nonce:${toHex(coin.color)},value:${coin.value},mt_index:${coin.mt_index},`);
                        }
                        const addr = 'mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600';
                        proofData = {
                            smgId: '0000000000000000000000000000000000000000000000000000000000000001',
                            uniqueId: '0000000000000000000000000000000000000000000000000000000000000011',
                            tokenPairId: 1,
                            amount: 123,
                            fee: 0,
                            toAddr: addr,
                            coins: [],//coins.keys().map(v => BigInt(v)),
                            signers: Array.from({ length: 29 }, (_, i) => i),
                            ttl: 10000000000
                        };
                        for (const [id, coin] of coins) { proofData.coins.push(BigInt(id)) };
                    } else {
                        const tokenType = decodeRawTokenType(ledgerState.tokenPairs.lookup(BigInt(args[0])).midnigthTokenAccount);
                        const coins = treasuryCoins.get(tokenType);
                        for (const [id, coin] of coins) {
                            console.log(`[${id}]: color:${toHex(coin.color)}, nonce:${toHex(coin.color)},value:${coin.value},mt_index:${coin.mt_index},`);
                        }
                        proofData = {
                            smgId: '0000000000000000000000000000000000000000000000000000000000000001',
                            uniqueId: '0000000000000000000000000000000000000000000000000000000000000012',
                            tokenPairId: args[0],
                            amount: args[1],
                            fee: args[2],
                            toAddr: args[3],
                            coins: [],
                            signers: Array.from({ length: 29 }, (_, i) => i),
                            ttl: 10000000000
                        }
                        for (const [id, coin] of coins) { proofData.coins.push(BigInt(id)) };
                        console.log(coins.keys())
                    }

                    console.log(`proof: {smgId:${proofData.smgId}, uniqueId:${proofData.uniqueId}, tokenPairId:${proofData.tokenPairId}, amount:${proofData.amount}, fee:${proofData.fee}, toAddr:${proofData.toAddr}, coins:${proofData.coins}, signers:${proofData.signers}, ttl:${proofData.ttl}`);
                    await api.smgRelease(
                        proofData.uniqueId
                        , proofData.smgId
                        , proofData.tokenPairId
                        , proofData.amount, proofData.fee, proofData.toAddr, proofData.ttl);

                    break;
                }
                case '4-3': {
                    const ledgerState = await api.getLedgerState();
                    // const treasuryCoins = getTreasuryCoinsFromState(ledgerState);
                    // const tokenType = decodeRawTokenType(ledgerState.tokenPairs.lookup(BigInt(proofData.tokenPairId)).midnigthTokenAccount);
                    // const coins = treasuryCoins.get(tokenType);
                    let proofData;
                    if (!args || args.length !== 4) {
                        const addr = 'mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600';
                        proofData = {
                            smgId: '000000000000000000000000000000000000000000000000006465765f323537',
                            uniqueId: '3612999a5702039d16e48ec4c605bd83a4b8518cab706c29f7db89219d648422',
                            tokenPairId: 1236,
                            amount: 12345678,
                            fee: 0,
                            toAddr: 'mn_shield-addr_test1gcfhdzk3l4wwucv94m0xx3cejrz5csfdxhrx4rv33yu9j5xxy8jsxqz5ke949y5s0eev00nysyrw3drv0yusdwhwa2vg9ygm0u4wtgnh2safmk5r',//addr,
                            coins: undefined,
                            signers: Array.from({ length: 29 }, (_, i) => i),
                            ttl: 1762836067000
                        };
                    } else {
                        proofData = {
                            smgId: '0000000000000000000000000000000000000000000000000000000000000001',
                            uniqueId: '0000000000000000000000000000000000000000000000000000000000000012',
                            tokenPairId: args[0],
                            amount: args[1],
                            fee: args[2],
                            toAddr: args[3],
                            coins: undefined,
                            signers: Array.from({ length: 29 }, (_, i) => i),
                            ttl: 10000000000
                        }
                    }
                    console.log(`smgMint: uniqueId: ${proofData.uniqueId}, smgId: ${proofData.smgId}, tokenPairId: ${proofData.tokenPairId}, amount: ${proofData.amount}, fee: ${proofData.fee}, toAddr: ${proofData.toAddr}, ttl: ${proofData.ttl}`);
                    const ret = await api.smgMint(proofData.uniqueId, proofData.smgId, proofData.tokenPairId, proofData.amount, proofData.fee, proofData.toAddr, proofData.ttl);
                    console.log(`smgMint Tx at block:${ret.public.blockHeight} txHash:${ret.public.blockHash}`);
                    break;
                }
                case '4-4': {
                    const smgId = '0000000000000000000000000000000000000000000000000000000000000001';
                    let ret;
                    if (!args || args.length !== 3) {
                        ret = await api.userBurn(smgId, '0x1d1e18e1a484d0a10623661546ba97DEfAB7a7AE', 2, 1);
                    } else {
                        ret = await api.userBurn(smgId, ...args);
                    }
                    console.log(`userBurn Tx at block:${ret.public.blockHeight} txHash:${ret.public.blockHash}`);
                    break;
                }
                case '4-5': {
                    if (!args || args.length !== 1) {
                        console.log('invalid args');
                        break;
                    } else {
                        // const params = args.map((arg) => {
                        //     return { uniqueId: args };
                        // })
                        const ret = await api.voteMultiCrossProposal(args);
                        console.log(`voteMultiCrossProposal Tx at block:${ret.public.blockHeight} txHash:${ret.public.blockHash}`);
                    }

                    break;
                }
                case '4-6': {
                    //   4-6. executeCrossProposal
                    if (!args || args.length !== 1) {
                        console.log('invalid args');
                        break;
                    } else {
                        // assert(args.length%2 === 0, 'invalid args');

                        const params = args.map((arg) => {
                            return { uniqueId: args };
                        })
                        const ret = await api.executeMultiCrossProposal([{ uniqueId: args[0], coinIndex: args.length > 1 ? args[1] : 0 }]);
                        console.log(`executeMultiCrossProposal Tx at block:${ret.public.blockHeight} txHash:${ret.public.blockHash}`);
                    }

                    break;
                }
                case '4-0':{
                    const state = await api.getLedgerState();
                    console.log(`--------------------------------   user unclaimed list   ---------------------------------`);
                    for (const [smgId, userUnclaimed] of state.mappingTokenToBeClaim) {
                        console.log(`\tsmgId: ${Buffer.from(smgId).toString('hex')}, userUnclaimed: domainSep=${userUnclaimed.domainSep}, amount= ${userUnclaimed.amount}, receiver: ${Buffer.from(userUnclaimed.receiver.bytes).toString('hex')}`);
                    }
                    console.log('==========')
                    for (const [smgId, userUnclaimed] of state.coinToBeClaimed) {
                        console.log(`\tsmgId: ${smgId}, userUnclaimed: color=${Buffer.from(userUnclaimed.coin.color).toString('hex')}, amount= ${userUnclaimed.coin.value}, receiver: ${Buffer.from(userUnclaimed.receiver.bytes).toString('hex')}`);
                    }

                    break;
                }
                case '5-0': {
                    const state = await api.getLedgerState();
                    console.log(`--------------------------------   smgTxSigners & smgPKThreshold   ---------------------------------`);
                    console.log(`voters: smgThreshold = ${state.smgPKThreshold}`);
                    for (const [smg, smgId] of state.smgTxSigners) {
                        console.log(`\tsmgId: ${smgId}, voter: ${Buffer.from(smg.bytes).toString('hex')}`);
                    }
                    console.log(`--------------------------------------   crossProposal   -------------------------------------------`);
                    console.log(`current CrossProposal: ${state.crossProposal.size()}`);
                    for (const [crossProposalId, crossProposal] of state.crossProposal) {
                        console.log('ppppppppp');
                        console.log(`\tcrossProposalId: ${Buffer.from(crossProposalId).toString('hex')}, smgId: ${Buffer.from(crossProposal.smgId).toString('hex')}, token: ${Buffer.from(crossProposal.token).toString('hex')}, isMappingToken: ${crossProposal.isMappingToken}, amount: ${crossProposal.amount}, fee: ${crossProposal.fee}, toAddr: ${Buffer.from(crossProposal.toAddr.bytes).toString('hex')}, ttl: ${crossProposal.ttl}`);
                        const voters = state.crossProposalVoters.lookup(crossProposalId);

                        let votersStr = '';
                        for (const voter of voters) {
                            votersStr += voter + ',';
                        }
                        votersStr = votersStr.slice(0, votersStr.length - 1);
                        console.log(`\t\tvoters(${voters.size()}): [${votersStr}]`);
                    }

                    {

                        console.log(`----------------------   currentExecuteCrossProposal: ${state.currentExecuteCrossProposal.size()}   -----------------------`);
                        for (const tx of state.currentExecuteCrossProposal) {
                            console.log(`[${toHex(tx.uniqueId)}] - 
                            \tsmgId:${toHex(tx.crossProposal.smgId)}
                            \ttokenPairId:${tx.crossProposal.tokenPairId}
                            \ttoken: ${toHex(tx.crossProposal.token)}
                            \tisMaping: ${tx.crossProposal.isMappingToken ? 'mapping' : 'not mapping'} token
                            \tamount: ${tx.crossProposal.amount}, fee: ${tx.crossProposal.fee}
                            \ttoAddr: ${toHex(tx.crossProposal.toAddr.bytes)}
                            \tttl: ${tx.crossProposal.ttl}`);
                        }
                    }


                    console.log(`latestOutBoundCrosstxInfo: smgId=${toHex(state.latestOutBoundCrosstxInfo.smgId)}, fromAddr=${toHex(state.latestOutBoundCrosstxInfo.fromAddr.bytes)}, tokenPairId=${state.latestOutBoundCrosstxInfo.tokenPairId}, tokenAccount=${toHex(state.latestOutBoundCrosstxInfo.tokenAccount)}, toAddr=${state.latestOutBoundCrosstxInfo.toAddr}, amount=${state.latestOutBoundCrosstxInfo.amount}, fee=${state.latestOutBoundCrosstxInfo.fee}, nonce=${state.latestOutBoundCrosstxInfo.nonce}}`)
                    // console.log(`--------------------------------------      feeCommonConfig      ------------------------------------------`);

                    // for (const [chainId, fee] of state.feeCommonConfig) {
                    //     console.log(`--> ${chainId}: ${fee}`);
                    // }
                    console.log(`-----------------------------------     userFeeBalance    -------------------------------------------------`);
                    for (const [zwpubk, amount] of state.userFeeBalance) {
                        console.log(`userBalance: zwpubk=${toHex(zwpubk.bytes)}, amount=${amount}`);
                    }
                    break;
                }
                case '5-1': {
                    // const state = await Rx.firstValueFrom(wallet.state());
                    const pks = [
                        'mn_shield-addr_test1wcwr534s5vasc49h426dfema8qjef2yrsuenp88g9304nkplzkgsxqqmkt0f9ve0whvq6hzcjwdtn5h7fnflvw2jeg6pjfq8tjnk9txej5h7szus',
                        'mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600',
                        'mn_shield-addr_test10hcfzy7ehc8ajc3rg5673meg3vdln3x83cs2dstr7eadcrvzxg4qxq8u3y3q8d30vrfpslszkhpemzk24s0q2jjmrx6dlgj59g8newzr5csnwdw8',
                        'mn_shield-addr_test1sdpznllsf28fwwk43slqtja8249efd6666fjmr93ak7nxczamdlsxqz7y7wz462nyw4l8wa9l62e797wzafcp3mqj0tj9wzg9qcfmpwc8vx80n5c',
                        'mn_shield-addr_test1njp03sr3jt7zyvc4wrt4vx92uj8xr5n8v5c8d788nw4s8yf9hl3qxqq0qxj3ykc53qys0tyxpd7pzq4m9x9vhecjfxcprjphv00wam735vt84rjk', //leader
                        'mn_shield-addr_test13qpnw0xntfpnthd4mv5kvm3gmyg5cculauk7psd79l99zvpxk6msxqre6q676xp5v7a9qh4ws5ykk45lewcd0dn2kyyztn3fkt6q40rl7vxu7hfq',
                        'mn_shield-addr_test1paa2s0yp9czpkx5zyhcf3azuehzean5g3cxxvswwv4mam6f8nxesxq90ea8t5e4grmcf0qg4d4939fjkf9wsrez8gfxugsypm903w25q3ydw2ngd'
                    ]
                    const res = await api.setSmgPksks(pks);
                    console.log('setSmgPksks res:', res.public.blockHash, res.public.blockHeight);
                    break;
                }
                case '5-2': {
                    const res = await api.setSmgPKThreold(args[0]);
                    console.log('setSmgPKThreold res:', res.public.blockHash, res.public.blockHeight);
                    break;
                }
                case '5-3': {
                    await api.updateSmgPk(args[0]);
                    break;
                }
                case '6-0': {
                    const state = await api.getLedgerState();
                    let userAddr = 'mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600';
                    if (args.length > 0) {
                        userAddr = args[0];
                    }
                    console.log('-----------------------------   coinToBeClaimed   ------------------------------------');
                    for (const [id, coinClaimInfo] of state.coinToBeClaimed) {
                        // if(getCoinPublicKeyFromShieldAddress(walletSdk.walletAddress) == Buffer.from(coinClaimInfo.receiver.bytes).toString('hex')){
                        if (getCoinPublicKeyFromShieldAddress(userAddr) == Buffer.from(coinClaimInfo.receiver.bytes).toString('hex')) {
                            console.log(`coinToBeClaimed: id=${Buffer.from(id).toString('hex')}, coin={color: ${toHex(coinClaimInfo.coin.color)}, amount: ${coinClaimInfo.coin.value}`);
                        }
                    }
                    console.log('-----------------------------   mappingTokenToBeClaim   ------------------------------------');
                    for (const [id, claimMappingTokenInfo] of state.mappingTokenToBeClaim) {
                        // if(getCoinPublicKeyFromShieldAddress(walletSdk.walletAddress) == Buffer.from(coinClaimInfo.receiver.bytes).toString('hex')){
                        if (getCoinPublicKeyFromShieldAddress(userAddr) == Buffer.from(claimMappingTokenInfo.receiver.bytes).toString('hex')) {
                            console.log(`mappingTokenToBeClaim: id=${Buffer.from(id).toString('hex')}, mappintToken=${toHex(claimMappingTokenInfo.domainSep)}, ${claimMappingTokenInfo.amount}`);
                        }
                    }
                    break;
                }
                case '6-1': {
                    console.log('userRechargeForFee args:', args);
                    const res = await api.userRechargeForFee(args[0]);
                    console.log('userRechargeForFee res:', res.public.blockHash, res.public.blockHeight);
                    break;
                }
                case '6-2': {
                    console.log('userClaimMappingToken args:', args);
                    const res = await api.userClaimMappingToken(args[0]);
                    console.log('userClaimMappingToken res:', res.public.blockHash, res.public.blockHeight);
                    break;
                }
                case '6-3': {//approveUserWithdrawFee
                    console.log('userClaimCoin args:', args);
                    const res = await api.userClaimCoin(args[0]);
                    console.log('userClaimCoin res:', res.public.blockHash, res.public.blockHeight);
                    break;
                }
                case '6': {
                    break;
                }
                case '7-0':{
                    const state = await api.getLedgerState();
                    console.log(`mergerWorker: ${Buffer.from(state.mergeWorker.bytes).toString('hex')}`);
                    break;
                }
                case '7': {
                    let res;
                    switch (args[0]) {
                        case '0': {
                            console.log(`assign [${args[0]}] role`);
                            break;
                        }
                        case '1': {
                            res = await api.setMegerWorker(args[1]);
                            if(res) console.log('setMegerWorker res:', res.public.blockHash, res.public.blockHeight);
                            break;
                        }
                        default:
                            break;
                    }
                    
                    break;
                }
                case '0':
                    console.info('Exiting...');
                    return;
                default:
                    console.error(`Invalid choice: ${choice}`);
            }
        } catch (error) {
            console.error(`Error: ${error}`);
        }
    }
};

// const buildWalletFromSeed = async (config, rli) => {
//     const seed = await rli.question('Enter your wallet seed: ');
//     return await api.buildWalletAndWaitForFunds(config, seed, '');
// };

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

//mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600
const seed = process.env.SEED;

// const buildWallet = async (config) => {
//     const state = await readWalletState();
//     return await buildWalletAndWaitForFunds(config, seed, state);//mn_shield-addr_test10th0dtqgnpanzwmqj236zccpkmj9xxpkl7r7e7cr5e3v7k0stm5qxqxa9m6z5f4603nyuu4kw9c65ektu48hhyrtu2f07h42ycppkvw9ccyry600
//     // return await buildWalletAndWaitForFunds(config, "42fa5956447ddfb94a5d21f4a46516ea4ad4b51240d448795ff8a36526c874ce", '');//mn_shield-addr_test1kh6uwh96xq09ek9p85jnjhqwzvcru6rmsk4nexkpf30tkne567msxq8e8q40v4wycfxn8dcvhejpqh0sz6hu2llum595aqp9rc3wx4x6gyj0r632
//     // return await buildWalletAndWaitForFunds(config, "5e426c4474b2758528fd966e2c5eac089af220b04a04d3179bccb51d1c4e3bf9", '');//mn_shield-addr_test1wcwr534s5vasc49h426dfema8qjef2yrsuenp88g9304nkplzkgsxqqmkt0f9ve0whvq6hzcjwdtn5h7fnflvw2jeg6pjfq8tjnk9txej5h7szus
// };



const storeWalletSate = async (state) => {
    await fs.writeFile('./serialized-state-'+seed, JSON.stringify(state), 'ascii');
}
const readWalletState = async () => {
    try {
        return JSON.parse(await fs.readFile('./serialized-state-'+seed, 'ascii'));
    } catch (error) {
        console.error(`Error reading wallet state: ${error}`);
    }
}
let walletSdk;


export const transferTo = async (address, amount, coinType, wallet) => {
  // import { nativeToken } from '@midnight-ntwrk/zswap';

  const transferRecipe = await wallet.transferTransaction([
    {
      amount: BigInt(amount),
      receiverAddress: address,
      type: coinType, // tDUST token type
    },
  ]);

  const provenTransaction = await wallet.proveTransaction(transferRecipe);
  const submittedTransaction = await wallet.submitTransaction(provenTransaction);
  // console.log('Transaction submitted:', submittedTransaction);
  return submittedTransaction;
  
}

async function ttt(){
    const memo = 'guilt upgrade salon ranch puppy cushion envelope table model boat figure garlic chef inspire memory fringe era correct ginger salmon glare tribe tilt tattoo';
    // const memo = 'frog assume tenant furnace amount will soap ask hobby alpha smooth boy bacon love guitar shy early patch hip ecology obscure subject stick pear';
    // const memo = '';
    const seedM = bip39.mnemonicToSeedSync(memo);
    console.log('seed:', Buffer.from(seedM).toString('hex'));

    // const seedHex = Buffer.from(seed).toString('hex');
    // const memo2 = bip39.entropyToMnemonic(seedHex,english);
    // console.log('memo2:', memo2);
}

export const run = async (config) => {
    ttt();
    console.info('Begin to run test tool ...');
    const rli = createInterface({ input, output, terminal: true });
    // const cc = rli.question(WALLET_LOOP_QUESTION)

    console.info('Building Wallet ...');
    walletSdk = new MidnightWalletSDK(configuration(config.indexer,config.indexerWS,config.proofServer,NETWORKID),true);
    const serializedState = await readWalletState();
    await walletSdk.initWallet(seed, storeWalletSate, serializedState, 60000);
    const wallet = walletSdk.getWalletInstance();
    // const wallet = await buildWallet(config);
    assert(wallet !== null, 'Wallet is null');
    console.info('Wallet Built completly...: address = ', walletSdk.getAccountAddress());
    console.info('Wallet Balance:', await walletSdk.getBalances());

    await walletSdk.registerNightUtxosForDustGeneration();
    console.info('Night Utxos registered for dust generation');

    // CombinedTokenTransfer
    const transferInfo = {
        type: 'unshielded',
        outputs:[
            {
                type: nativeToken().raw,//ledger.RawTokenType;
                // receiverAddress: 'mn_addr_preview12qvgwhe5mdr2aq8pem0ugd36zyzq7xss2tgt6yrel6nmfjaqy9xspqume3',//'string;
                receiverAddress: 'mn_addr_undeployed1h3ssm5ru2t6eqy4g3she78zlxn96e36ms6pq996aduvmateh9p9sk96u7s',//'string;
                amount: 1000000n//bigint;
            }
        ]
    }
    const txHashTransfer = await walletSdk.transferTo([transferInfo], new Date( Date.now() + 600 * 1000 ));
    console.log('transferTo txHash:', txHashTransfer);
    // const amount = 2200152859n;
    const amount = 10000000n;
    // const recevier = 'mn_shield-addr_test1sdpznllsf28fwwk43slqtja8249efd6666fjmr93ak7nxczamdlsxqz7y7wz462nyw4l8wa9l62e797wzafcp3mqj0tj9wzg9qcfmpwc8vx80n5c';
    const recevier = 'mn_shield-addr_test1njp03sr3jt7zyvc4wrt4vx92uj8xr5n8v5c8d788nw4s8yf9hl3qxqq0qxj3ykc53qys0tyxpd7pzq4m9x9vhecjfxcprjphv00wam735vt84rjk'; // leader
    const txHash = await transferTo(recevier, amount, nativeToken(),wallet);
    console.log('transferTo txHash:', txHash);
    try {
        if (wallet !== null) {
            await mainLoop(rli, wallet);
        }
    } catch (e) {
        if (e instanceof Error) {
            console.error(`Found error '${e.message}'`);
            console.info('Exiting...');
            console.info(`${e.stack}`);
        } else {
            throw e;
        }
    } finally {
        try {
            rli.close();
            rli.removeAllListeners();
        } catch (e) {
            console.error(`Error closing readline interface: ${e}`);
        } finally {
            try {
                if (wallet !== null) {
                    // await walletSdk.uninitWallet();
                    // await wallet.close();
                }
            } catch (e) {
                console.error(`Error closing wallet: ${e}`);
            } finally {
                // try {
                //     if (env !== undefined) {
                //         await env.down();
                //         console.info('Goodbye');
                //     }
                // } catch (e) {
                //     console.error(`Error shutting down docker environment: ${e}`);
                // }
                console.info('Goodbye');
                process.exit(0);
            }
        }
    }
};


run(config).catch((e) => {
    console.error(`Error running app: ${e}`);
    process.exit(1);
});

// async function main(){
//     await run(config);
// }

// main();


