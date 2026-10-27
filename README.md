# ERC-20 托管交易系统

本仓库提供基于 ERC-20 代币的托管交易实现。买家创建订单后将代币存入 Escrow 合约；交易完成时，合约向卖家付款。订单超期可退款，买卖双方也可发起争议，由仲裁者决定资金归属。

项目包含两条独立实现路线。**路线 A** 使用 Spring Boot 和 Web3j 提供 REST 接口；**路线 B** 使用 Next.js 页面连接钱包、读取合约并提交交易。两条路线各有自己的 Escrow 合约源码，运行时应分别核对合约地址、ABI 和状态定义。

## 功能与角色

| 角色 | 可执行操作 |
| --- | --- |
| 买家 | 创建订单、授权并支付代币、确认交易、超期退款、发起争议 |
| 卖家 | 查看订单、发起争议 |
| 仲裁者 | 对争议订单作出裁决，决定代币归买家或卖家 |

Escrow 合约保存买家、卖家、代币地址、金额、截止时间、订单状态和描述。代币支付采用 `approve` + `transferFrom`：买家先授权 Escrow 使用对应金额，再调用 `deposit` 将代币存入合约。订单的支付、完成、退款和争议等操作会发出链上事件，网页用这些事件展示订单时间线。

## 目录结构

```text
.
├── spring-boot-backend/                 # 路线 A：Spring Boot + Web3j
│   └── src/main/
│       ├── java/com/wetech/demo/web3j/ # 配置、服务、控制器与合约封装类
│       └── resources/contracts/        # HHYToken、Escrow、SimpleStorage 源码
└── nextjs-frontend/                    # 路线 B：npm 工作区
    └── packages/
        ├── nextjs/                      # 页面、钱包连接、合约地址与 ABI
        └── hardhat/                     # 合约源码、部署脚本和测试
```

`HHYToken` 实现代币余额、转账、授权、代扣、增发和销毁；`SimpleStorage` 用于演示链上整数的读写。路线 B 的 Escrow 页面使用 [`deployedContracts.ts`](nextjs-frontend/packages/nextjs/contracts/deployedContracts.ts) 中的 Escrow 与 LTCToken 配置，和路线 A 的 HHYToken 部署流程相互独立。

## 路线 A：启动后端服务

### 环境

- JDK 21。
- 可访问的以太坊兼容 RPC；未配置时使用 `http://localhost:8545`。
- 持有测试币的部署账户。服务通过本机环境变量 `WEB3J_PRIVATE_KEY` 读取签名私钥。
- Web3j 生成合约封装类时，需要 `${user.home}/.web3j/solc/0.8.13/solc` 存在并可执行；这是 [`build.gradle`](spring-boot-backend/build.gradle) 指定的位置。

`WEB3J_CLIENT_ADDRESS` 可覆盖 RPC 地址，`WEB3J_GAS_PRICE` 和 `WEB3J_GAS_LIMIT` 可覆盖默认交易参数。不要把私钥写到仓库里的配置文件。

### 构建与运行

从仓库根目录执行：

```bash
cd spring-boot-backend
bash gradlew generateContractWrappers
bash gradlew compileJava
bash gradlew bootRun
```

服务默认监听 `http://localhost:8080`。`SimpleStorage` 在读写前必须先部署或加载合约。当前 `EscrowService` 只在本次服务进程中保存部署地址和部署区块；重启后不会自动恢复旧合约，订单列表也依赖 RPC 对事件日志的查询支持。

### REST 接口

| 方法 | 路径 | 功能与参数 |
| --- | --- | --- |
| `POST` | `/api/storage/deploy` | 部署 SimpleStorage，返回合约地址 |
| `POST` | `/api/storage/load` | 加载已有合约；查询参数 `address` |
| `GET` | `/api/storage/value/get` | 读取当前整数值 |
| `POST` | `/api/storage/value/set` | 写入整数；查询参数 `value`，返回交易信息 |
| `GET` | `/api/storage/address` | 查询当前加载的合约地址 |
| `POST` | `/api/escrow/deploy` | 部署 Escrow，当前服务账户成为仲裁者 |
| `GET` | `/api/escrow/address` | 查询服务当前持有的 Escrow 地址 |
| `GET` | `/api/escrow/orders` | 根据订单创建事件列出订单 |
| `GET` | `/api/escrow/orders/{id}` | 读取指定订单详情 |
| `POST` | `/api/escrow/orders/{id}/resolve` | 仲裁争议；布尔查询参数 `sellerWins` |

## 路线 B：启动网页应用

### 环境

- Node.js 20.18.3 或更新版本。
- 可连接 POTOS 测试网的钱包。代码默认配置的链 ID 为 `60600`，RPC 为 `https://rpc-testnet.potos.hk`。
- 能访问 npm 镜像以安装依赖。仓库已提交 `nextjs-frontend/package-lock.json`；现有 Yarn 配置引用了未提交的 `.yarn/releases/` 文件，因此这里使用 npm。

### 安装与运行

从仓库根目录执行：

```bash
cd nextjs-frontend
npm ci --legacy-peer-deps
cd packages/nextjs
npx next dev
```

终端会显示实际访问地址；默认端口是 `3000`，被占用时 Next.js 会选择其他端口。主要页面：

| 路径 | 用途 |
| --- | --- |
| `/` | 钱包连接状态及项目入口 |
| `/escrow` | 创建订单、查看订单及事件时间线、执行账户允许的操作 |
| `/debug` | 查看和调用已配置的合约 |
| `/blockexplorer` | 查看本地链相关信息 |

### 使用 Escrow 页面

1. 将钱包连接到代码配置的 POTOS 测试网，并确认钱包有支付交易所需的原生代币。
2. 在 `/escrow` 填写卖家地址、代币数量、有效期限和描述，提交创建订单交易。
3. 买家在订单卡片中付款。页面依次发送代币 `approve` 和 Escrow `deposit` 两笔交易。
4. 买家可以确认交易；超过截止时间后可申请退款。买卖双方可发起争议，仲裁者可选择将代币退给买家或支付给卖家。
5. 展开订单事件时间线，可查看相关区块号和交易哈希。订单列表结合链上 `orderCount` 与历史事件生成，历史日志加载速度取决于 RPC 服务。

网络配置在 [`scaffold.config.ts`](nextjs-frontend/packages/nextjs/scaffold.config.ts)；前端使用的合约地址和 ABI 在 [`deployedContracts.ts`](nextjs-frontend/packages/nextjs/contracts/deployedContracts.ts)。网页开发不要求启动本地 Hardhat 节点。

## 已部署合约与交易记录

以下地址和交易来自 POTOS 测试网（链 ID `60600`），均可通过区块浏览器直接核对。路线 A 与路线 B 使用不同的 Escrow 合约，交易不能互相充当另一条路线的验收记录。

| 用途 | 合约地址 |
| --- | --- |
| 路线 A Escrow | [`0xa6CdE57f64febdDfE13E443096DBF6b80380AB9a`](https://scan-testnet.potos.hk/address/0xa6CdE57f64febdDfE13E443096DBF6b80380AB9a) |
| 路线 B Escrow | [`0xfCD502c6ad8A448be077e71536c37b09C2741865`](https://scan-testnet.potos.hk/address/0xfCD502c6ad8A448be077e71536c37b09C2741865) |
| 路线 B LTCToken | [`0x7f8656006d83Ac07061C2fa5AaA7C28cC9cF5cea`](https://scan-testnet.potos.hk/address/0x7f8656006d83Ac07061C2fa5AaA7C28cC9cF5cea) |

### 交易记录表（8 笔）

下表保留验收表的操作顺序，并按链上记录修正发起账户和订单 ID。“订单 0/1”是本次验收的相对编号，在路线 B 已部署合约上的实际 ID 分别为 `6/7`。表中 `approve` 属于实际 ID 7。

| 操作 | 交易哈希 | 区块浏览器链接 | 发起账户 |
| --- | --- | --- | --- |
| 部署 Escrow（路线 A） | `0xf4f5a00d2fb1cdaaec15e58981956f7c2b183dc9510133f6c32396abdae344cf` | [查看交易](https://scan-testnet.potos.hk/tx/0xf4f5a00d2fb1cdaaec15e58981956f7c2b183dc9510133f6c32396abdae344cf) | [`0xbBeC75a0b58530467244905512aceb91A820C036`](https://scan-testnet.potos.hk/address/0xbBeC75a0b58530467244905512aceb91A820C036) |
| createOrder：验收订单 0／链上 ID 6（路线 B） | `0x678ae3e583520239e1da545752a3006a2854ebbba6b2431a0dad241838f2bcb3` | [查看交易](https://scan-testnet.potos.hk/tx/0x678ae3e583520239e1da545752a3006a2854ebbba6b2431a0dad241838f2bcb3) | [`0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b`](https://scan-testnet.potos.hk/address/0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b) |
| approve：链上 ID 7（路线 B） | `0x0bcefe45bae807a4b8be7836aa6cb9037b13f320cbd5dcae4ceeba8f22787273` | [查看交易](https://scan-testnet.potos.hk/tx/0x0bcefe45bae807a4b8be7836aa6cb9037b13f320cbd5dcae4ceeba8f22787273) | [`0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b`](https://scan-testnet.potos.hk/address/0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b) |
| deposit：验收订单 0／链上 ID 6（路线 B） | `0x4a7a72bd4c31c0156126b21a1263783ae2e246717c92e6288fdf2f63d24a7efb` | [查看交易](https://scan-testnet.potos.hk/tx/0x4a7a72bd4c31c0156126b21a1263783ae2e246717c92e6288fdf2f63d24a7efb) | [`0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b`](https://scan-testnet.potos.hk/address/0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b) |
| dispute：验收订单 1／链上 ID 7（路线 B） | `0xf4c9ec9d6279cd616594a41a4ac379806deb478da5a650fcda6af6fa3c2bf464` | [查看交易](https://scan-testnet.potos.hk/tx/0xf4c9ec9d6279cd616594a41a4ac379806deb478da5a650fcda6af6fa3c2bf464) | [`0x30f2f3d3f23ec2DF6CEB20d4031035615C22A6FE`](https://scan-testnet.potos.hk/address/0x30f2f3d3f23ec2DF6CEB20d4031035615C22A6FE) |
| resolve：验收订单 1／链上 ID 7（路线 B） | `0x1d43a79dbd9764c2a0f9b7d89fca280dd2e2a2ff96671d31909fe1e2427e7b04` | [查看交易](https://scan-testnet.potos.hk/tx/0x1d43a79dbd9764c2a0f9b7d89fca280dd2e2a2ff96671d31909fe1e2427e7b04) | [`0xbBeC75a0b58530467244905512aceb91A820C036`](https://scan-testnet.potos.hk/address/0xbBeC75a0b58530467244905512aceb91A820C036) |
| confirm：验收订单 0／链上 ID 6（路线 B） | `0x2f7c1eee51051442bb2f2998c8906d634d5673136bf673bbc9e2d405a4708d38` | [查看交易](https://scan-testnet.potos.hk/tx/0x2f7c1eee51051442bb2f2998c8906d634d5673136bf673bbc9e2d405a4708d38) | [`0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b`](https://scan-testnet.potos.hk/address/0x92344cFefe53E5B98Bf3BCD7745d21697C514a6b) |
| resolve 失败：链上 ID 2（路线 A） | `0x207b960a5d5ef1f3fb31eb254e86d90c1744af1d02f968b2af77b2311df4b79e` | [查看交易](https://scan-testnet.potos.hk/tx/0x207b960a5d5ef1f3fb31eb254e86d90c1744af1d02f968b2af77b2311df4b79e) | [`0xbBeC75a0b58530467244905512aceb91A820C036`](https://scan-testnet.potos.hk/address/0xbBeC75a0b58530467244905512aceb91A820C036) |

以上 8 笔中最后一笔链上状态为失败，其余 7 笔为成功。路线 A 的部署交易由仲裁账户发起，`0xa6Cd…B9a` 是部署出的合约地址，不是发起账户。

## 团队分工

| 成员 | 负责内容 |
| --- | --- |
| 黄泓源 | 路线 A 的 Web3j 服务、部署和接口验收 |
| 李天诚 | 路线 B 的 Escrow 页面与前端合约交互 |
| 王武略 | README、文档格式校对与 AI 使用说明审核 |

## 合约开发与配置

路线 B 的 Solidity 源码、部署脚本和测试分别位于 [`contracts/`](nextjs-frontend/packages/hardhat/contracts/)、[`deploy/`](nextjs-frontend/packages/hardhat/deploy/) 和 [`test/`](nextjs-frontend/packages/hardhat/test/)。部署脚本要求通过 `ESCROW_ARBITER_ADDRESS` 指定仲裁者地址。当前 `main` 分支的 [`hardhat.config.ts`](nextjs-frontend/packages/hardhat/hardhat.config.ts) 在部署者私钥配置行有语法错误，Hardhat 编译、部署和测试命令须先修复该行才能运行。

前端环境变量模板位于 [`packages/nextjs/.env.example`](nextjs-frontend/packages/nextjs/.env.example)，Hardhat 模板位于 [`packages/hardhat/.env.example`](nextjs-frontend/packages/hardhat/.env.example)。本机设置应保存在未提交的 `.env.local`、`.env` 或进程环境中。私钥和钱包导出文件不得写入源码或提交记录。
