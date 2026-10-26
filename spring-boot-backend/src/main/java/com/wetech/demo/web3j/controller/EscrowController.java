package com.wetech.demo.web3j.controller;

import com.wetech.demo.web3j.service.EscrowService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import java.math.BigInteger;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/escrow")
@RequiredArgsConstructor
public class EscrowController {
    private final EscrowService service;

    @PostMapping("/deploy")
    public CompletableFuture<?> deploy() {
        return service.deploy().thenApply(c -> Map.of("contractAddress", c.getContractAddress(), "transactionHash", c.getTransactionReceipt().get().getTransactionHash(), "deployBlock", service.getDeployBlock()));
    }

    @GetMapping("/address")
    public Map<String, String> address() {
        return Map.of("contractAddress", service.getContractAddress(), "arbiter", service.getContractAddress());
    }

    @GetMapping("/orders/{id}")
    public CompletableFuture<Map<String, String>> getOrder(@PathVariable BigInteger id) {
        return service.getOrder(id);
    }

    @GetMapping("/orders")
    public List<Map<String, String>> listOrders() throws Exception {
        return service.listOrders();
    }

    @PostMapping("/orders/{id}/resolve")
    public CompletableFuture<TransactionReceipt> resolve(@PathVariable BigInteger id, @RequestParam boolean sellerWins) {
        return service.resolve(id, sellerWins);
    }
}
