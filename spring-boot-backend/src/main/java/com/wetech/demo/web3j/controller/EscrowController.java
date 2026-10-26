package com.wetech.demo.web3j.controller;

import com.wetech.demo.web3j.service.EscrowService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

@RestController
@RequestMapping("/api/escrow")
public class EscrowController {

    private final EscrowService escrowService;

    public EscrowController(EscrowService escrowService) {
        this.escrowService = escrowService;
    }

    @PostMapping("/deploy")
    public CompletableFuture<Map<String, String>> deploy() {
        return escrowService.deploy();
    }

    @PostMapping("/load")
    public Map<String, String> load(@RequestParam String address, @RequestParam BigInteger fromBlock) {
        escrowService.load(address, fromBlock);
        return Map.of("contractAddress", escrowService.getContractAddress());
    }

    @GetMapping("/address")
    public CompletableFuture<Map<String, String>> address() {
        String contractAddress = escrowService.getContractAddress();
        return escrowService.getArbiter().thenApply(arbiter ->
                Map.of("contractAddress", contractAddress, "arbiter", arbiter));
    }

    @GetMapping("/orders/{id}")
    public CompletableFuture<Map<String, String>> order(@PathVariable BigInteger id) {
        return escrowService.getOrder(id);
    }

    @GetMapping("/orders")
    public List<Map<String, String>> orders() throws Exception {
        return escrowService.listOrders();
    }

    @PostMapping("/orders/{id}/resolve")
    public CompletableFuture<Map<String, String>> resolve(
            @PathVariable BigInteger id, @RequestParam boolean sellerWins) {
        return escrowService.resolve(id, sellerWins).thenCompose(receipt ->
                escrowService.getOrder(id).thenApply(order -> {
                    Map<String, String> result = new LinkedHashMap<>();
                    result.put("transactionHash", receipt.getTransactionHash());
                    result.put("blockNumber", receipt.getBlockNumber().toString());
                    result.put("status", order.get("status"));
                    return result;
                }));
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class, CompletionException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(Exception error) {
        Throwable cause = error instanceof CompletionException && error.getCause() != null
                ? error.getCause() : error;
        String message = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }
}
