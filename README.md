# 区块链大作业：托管交易平台

必做路线为 **A：Spring Boot + Web3j 平台后端**。`spring-boot-backend/` 提供六个 Escrow REST 接口；`nextjs-frontend/` 保留实验 3 的 Hardhat/Next.js 项目及组长代币源码。本次买卖家通过 MetaMask 和 Remix 操作，后端账户作为仲裁人签署裁决交易。

## 运行路线 A

需要 Java 21、Node.js 与 npm（可从 PATH 使用）、Gradle Wrapper、POTOS Testnet 测试币，以及专门的后端仲裁账户。进入 `spring-boot-backend/`，在启动终端安全设置 `WEB3J_PRIVATE_KEY` 环境变量后运行：

```bash
bash gradlew generateContractWrappers
bash gradlew compileJava
bash gradlew bootRun
```

私钥只通过环境变量注入。配置文件 `src/main/resources/application.properties` 使用 `${WEB3J_PRIVATE_KEY}` 占位符；不要把私钥、助记词或 `.env` 提交到仓库。RPC 为 `https://rpc-testnet.potos.hk`，Chain ID `60600`。服务默认监听 `localhost:8080`。六个接口的参数与示例请求见 [后端说明](spring-boot-backend/README.md)。

## 关键地址

| 项目 | 地址 |
|---|---|
| 后端仲裁账户 | `0xbEAa3a6692C6FC388712E6f96eaA9B4d9168Ff16` |
| 本次后端部署的 Escrow | `0x49C0DF2C2eDf13EA769e61036bfd5e1EE9618B07`（区块 2689090） |
| 组长的 HHYToken（实验 3 候选） | `0x8E8a9195E32709e62BC8FaC445c983dB2A2c2900` |

## 交易记录

以下数据须由本组实际操作后填写。浏览器链接格式：`https://scan-testnet.potos.hk/tx/<交易哈希>`。

| 操作 | 交易哈希 | 区块浏览器链接 | 发起账户 |
|---|---|---|---|
| 部署 Escrow | `0x9b75a9d84a2580695c89bb5ea184c25e7e44f6aa5e657bbfb0b518475e5187a1` | [查看交易](https://scan-testnet.potos.hk/tx/0x9b75a9d84a2580695c89bb5ea184c25e7e44f6aa5e657bbfb0b518475e5187a1) | 后端账户 `0xbEAa…8Ff16` |
| createOrder 订单 0 | 待填 | 待填 | 买家 |
| approve | 待填 | 待填 | 买家 |
| deposit 订单 0 | 待填 | 待填 | 买家 |
| dispute 订单 1 | 待填 | 待填 | 卖家 |
| resolve 订单 1 | 待填 | 待填 | 后端账户 |
| confirm 订单 0 | 待填 | 待填 | 买家 |
| resolve 失败 | 待填或注明未广播 | 待填或注明未上链 | 后端账户 |

订单 1 的创建与付款也须保留交易记录。报告按课程《大作业报告模板》填写截图 4A-1 至 4A-8、解释 4A-1 至 4A-6、分工表和 AI 使用说明。

额外交易记录（用于完整追踪订单 1）：

| 操作 | 交易哈希 | 区块浏览器链接 | 发起账户 |
|---|---|---|---|
| createOrder 订单 1 | 待填 | 待填 | 买家 |
| deposit 订单 1 | 待填 | 待填 | 买家 |

## 分工

| 成员 | 工作 |
|---|---|
| 成员 1 | Escrow/HHYToken Java 封装与 `EscrowService` |
| 成员 2 | `EscrowController` 与 `OrderCreated` 事件查询 |
| 成员 3 | Remix 买卖家操作、验收记录与报告 |

姓名、学号和实际贡献在小组确认后补齐。

SimpleStorage 示例已在测试网部署到 `0x9ca218b0730071BCc20BC1D9855C702dBE28793e`；`set(100)` 的[交易](https://scan-testnet.potos.hk/tx/0xb1feedf591d6bb3cb004e8cc2aed775dbfa78c79e7805a7d2fd2344f4c1d734b)位于区块 2689002，之后 `get` 返回 `100`。
