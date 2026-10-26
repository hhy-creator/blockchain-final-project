package com.wetech.demo.web3j.service;

import com.wetech.demo.web3j.contracts.escrow.Escrow;
import org.springframework.stereotype.Service;
import org.web3j.abi.EventEncoder;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameter;
import org.web3j.protocol.core.methods.request.EthFilter;
import org.web3j.protocol.core.methods.response.EthLog;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.tx.gas.ContractGasProvider;
import org.web3j.crypto.WalletUtils;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/** Contract operations owned by the backend account. */
@Service
public class EscrowService {

    private static final String[] STATUS = {"Created", "Paid", "Completed", "Refunded", "Disputed"};

    private final Web3j web3j;
    private final Credentials credentials;
    private final ContractGasProvider gasProvider;

    private volatile Escrow contract;
    private volatile String contractAddress;
    private volatile BigInteger deployBlock;

    public EscrowService(Web3j web3j, Credentials credentials, ContractGasProvider gasProvider) {
        this.web3j = web3j;
        this.credentials = credentials;
        this.gasProvider = gasProvider;
    }

    /** Deploy Escrow with the backend signer as its arbiter. */
    public CompletableFuture<Map<String, String>> deploy() {
        return Escrow.deploy(web3j, credentials, gasProvider, credentials.getAddress())
                .sendAsync()
                .thenApply(deployed -> {
                    TransactionReceipt receipt = deployed.getTransactionReceipt()
                            .orElseThrow(() -> new IllegalStateException("Deployment receipt is missing"));
                    this.contract = deployed;
                    this.contractAddress = deployed.getContractAddress();
                    this.deployBlock = receipt.getBlockNumber();
                    return Map.of(
                            "contractAddress", contractAddress,
                            "transactionHash", receipt.getTransactionHash(),
                            "deployBlock", deployBlock.toString());
                });
    }

    /** Reattach after a restart; fromBlock must be the actual deployment block for event queries. */
    public void load(String address, BigInteger fromBlock) {
        if (!WalletUtils.isValidAddress(address)) {
            throw new IllegalArgumentException("Invalid contract address");
        }
        if (fromBlock == null || fromBlock.signum() < 0) {
            throw new IllegalArgumentException("fromBlock must be non-negative");
        }
        this.contract = Escrow.load(address, web3j, credentials, gasProvider);
        this.contractAddress = address;
        this.deployBlock = fromBlock;
    }

    public String getContractAddress() {
        requireContract();
        return contractAddress;
    }

    public BigInteger getDeployBlock() {
        requireContract();
        return deployBlock;
    }

    public String getBackendAddress() {
        return credentials.getAddress();
    }

    public CompletableFuture<String> getArbiter() {
        return requireContract().arbiter().sendAsync();
    }

    public CompletableFuture<Map<String, String>> getOrder(BigInteger id) {
        requireOrderId(id);
        return requireContract().getOrder(id).sendAsync().thenApply(order -> {
            int status = order.status.intValueExact();
            if (status < 0 || status >= STATUS.length) {
                throw new IllegalStateException("Unknown order status: " + status);
            }
            Map<String, String> data = new LinkedHashMap<>();
            data.put("buyer", order.buyer);
            data.put("seller", order.seller);
            data.put("token", order.token);
            data.put("amount", order.amount.toString());
            data.put("deadline", order.deadline.toString());
            data.put("status", STATUS[status]);
            data.put("description", order.description);
            return data;
        });
    }

    /** The contract enforces arbiter and Disputed-state checks before transferring tokens. */
    public CompletableFuture<TransactionReceipt> resolve(BigInteger id, boolean sellerWins) {
        requireOrderId(id);
        return requireContract().resolve(id, sellerWins).sendAsync();
    }

    /** POTOS limits eth_getLogs to ten blocks per request. */
    public List<Map<String, String>> listOrders() throws Exception {
        requireContract();
        BigInteger latest = web3j.ethBlockNumber().send().getBlockNumber();
        List<Map<String, String>> orders = new ArrayList<>();
        for (BigInteger from = deployBlock; from.compareTo(latest) <= 0; from = from.add(BigInteger.TEN)) {
            BigInteger to = from.add(BigInteger.valueOf(9)).min(latest);
            EthFilter filter = new EthFilter(
                    DefaultBlockParameter.valueOf(from),
                    DefaultBlockParameter.valueOf(to),
                    contractAddress);
            filter.addSingleTopic(EventEncoder.encode(Escrow.ORDERCREATED_EVENT));
            EthLog response = web3j.ethGetLogs(filter).send();
            if (response.hasError()) {
                throw new IllegalStateException("eth_getLogs failed at block " + from + ": "
                        + response.getError().getMessage());
            }
            for (EthLog.LogResult<?> result : response.getLogs()) {
                if (!(result.get() instanceof Log log)) {
                    throw new IllegalStateException("Unexpected eth_getLogs result at block " + from);
                }
                Escrow.OrderCreatedEventResponse event = Escrow.getOrderCreatedEventFromLog(log);
                Map<String, String> order = new LinkedHashMap<>();
                order.put("id", event.id.toString());
                order.put("buyer", event.buyer);
                order.put("seller", event.seller);
                order.put("amount", event.amount.toString());
                order.put("blockNumber", log.getBlockNumber().toString());
                order.put("transactionHash", log.getTransactionHash());
                orders.add(order);
            }
        }
        return orders;
    }

    private Escrow requireContract() {
        Escrow current = contract;
        if (current == null) {
            throw new IllegalStateException("Contract not deployed or loaded; call /deploy or /load first");
        }
        return current;
    }

    private static void requireOrderId(BigInteger id) {
        if (id == null || id.signum() < 0) {
            throw new IllegalArgumentException("Order id must be non-negative");
        }
    }
}
