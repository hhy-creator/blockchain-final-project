# 区块链大作业：路线 A 平台后端

Spring Boot 3、Web3j 4、Java 21 服务。后端账户部署 Escrow 并作为仲裁人签署 `resolve` 交易；买卖家用各自的 MetaMask 在 Remix 里创建、付款、争议与确认。订单列表从 `OrderCreated` 日志重建，每 10 个区块查询一次，以适配 POTOS 测试网。

## 运行

需要 JDK 21、POTOS Testnet（Chain ID 60600）和有测试币的后端仲裁账户。私钥仅通过运行环境变量 `WEB3J_PRIVATE_KEY` 注入，不能写入仓库、配置文件或截图。RPC 地址和 gas 参数见 `src/main/resources/application.properties`。

```bash
bash gradlew generateContractWrappers
bash gradlew compileJava
bash gradlew bootRun
```

启动前可在 Bash 终端用下面的命令隐蔽输入，粘贴私钥后按回车。`read` 不把私钥写进命令历史，也不会回显到终端；前缀 `0x` 可有可无。

```bash
read -rsp '后端仲裁账户私钥：' WEB3J_PRIVATE_KEY
echo
export WEB3J_PRIVATE_KEY
bash gradlew bootRun
```

服务默认监听 `http://localhost:8080`。服务重启后用 `/load` 恢复合约地址及真实部署区块。

## 六个接口

| 方法 | 路径 | 参数 | 主要返回 |
|---|---|---|---|
| POST | `/api/escrow/deploy` | 无 | `contractAddress`、`transactionHash`、`deployBlock` |
| POST | `/api/escrow/load` | `address`、`fromBlock` | `contractAddress` |
| GET | `/api/escrow/address` | 无 | `contractAddress`、`arbiter` |
| GET | `/api/escrow/orders/{id}` | 订单 ID | 订单详情，状态为文字 |
| GET | `/api/escrow/orders` | 无 | 来自 `OrderCreated` 的订单列表 |
| POST | `/api/escrow/orders/{id}/resolve` | `sellerWins=true/false` | `transactionHash`、`blockNumber`、最终状态 |

例如：

```bash
curl -X POST http://localhost:8080/api/escrow/deploy
curl http://localhost:8080/api/escrow/address
curl http://localhost:8080/api/escrow/orders
curl 'http://localhost:8080/api/escrow/orders/0'
curl -X POST 'http://localhost:8080/api/escrow/orders/1/resolve?sellerWins=false'
```

SimpleStorage 示例接口仍保留在 `/api/storage`，供教程 4.4 节验收。

## 合约与分工

`Escrow.sol` 和 `HHYToken.sol` 位于 `src/main/resources/contracts/`，生成的 Java 封装位于 `src/main/java/com/wetech/demo/web3j/contracts/`。`EscrowService.java` 实现部署、加载、查询和仲裁；`EscrowController.java` 暴露 HTTP 接口。

| 成员 | 负责内容 |
|---|---|
| 成员 1 | 合约封装与 Service |
| 成员 2 | Controller 与事件查询 |
| 成员 3 | Remix 买卖家操作、验收记录与报告 |

组员姓名、学号和具体贡献在报告确认后填写。

## 合约地址与交易记录

组长实验 3 的 HHYToken 候选地址为 `0x8E8a9195E32709e62BC8FaC445c983dB2A2c2900`，已确认该地址在 POTOS 上有合约代码。本次后端 Escrow 为 `0x3827e86d03e41784d6bdF19130b724AC6B6b93bC`，部署区块 `2688775`，仲裁账户 `0xbEAa3a6692C6FC388712E6f96eaA9B4d9168Ff16`。服务重启后可调用：

```bash
curl -X POST 'http://localhost:8080/api/escrow/load?address=0x3827e86d03e41784d6bdF19130b724AC6B6b93bC&fromBlock=2688775'
```

以下表格必须在组内实际交易后填写，链接使用 `https://scan-testnet.potos.hk/tx/` 加交易哈希。

| 操作 | 交易哈希 | 区块浏览器链接 | 发起账户 |
|---|---|---|---|
| 部署 Escrow | `0xe1cd56cb97a5b37ed6146dde585d0b8a26e84aabb46b1f299ad714f393feb968` | [查看交易](https://scan-testnet.potos.hk/tx/0xe1cd56cb97a5b37ed6146dde585d0b8a26e84aabb46b1f299ad714f393feb968) | `0xbEAa…8Ff16` |
| createOrder 订单 0 | 待填 | 待填 | 买家 |
| approve | 待填 | 待填 | 买家 |
| deposit 订单 0 | 待填 | 待填 | 买家 |
| dispute 订单 1 | 待填 | 待填 | 卖家 |
| resolve 订单 1 | 待填 | 待填 | 后端仲裁账户 |
| confirm 订单 0 | 待填 | 待填 | 买家 |
| resolve 失败 | 待填或注明未广播 | 待填或注明未上链 | 后端仲裁账户 |

订单 1 还需创建与付款。完整验收顺序和截图编号见课程大作业教程第 4.6 节。报告解释题要引用实际交易、区块、账户和余额，不能使用教程示例值。
