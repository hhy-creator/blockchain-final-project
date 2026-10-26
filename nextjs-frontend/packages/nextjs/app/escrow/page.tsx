"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import {
  useDeployedContractInfo,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";

// The configured POTOS address is still the original Escrow deployment.
// Flip this after deploying the Shipped-enabled Escrow and updating its address.
const HAS_SHIPPED_STATUS = false;
const STATUS = HAS_SHIPPED_STATUS
  ? (["Created", "Paid", "Shipped", "Completed", "Refunded", "Disputed"] as const)
  : (["Created", "Paid", "Completed", "Refunded", "Disputed"] as const);
const TOKEN_NAME = "LTCToken" as const;
const EVENT_BATCH_SIZE = 1000;

type OrderData = {
  buyer: Address;
  seller: Address;
  token: Address;
  amount: bigint;
  deadline: bigint;
  status: number;
  description: string;
};

type TimelineEvent = {
  name: string;
  blockNumber?: bigint;
  logIndex?: number;
  transactionHash?: string;
  detail?: string;
};

const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "-";

function OrderRow({
  id,
  currentAddress,
  arbiter,
  escrowAddress,
  timeline,
}: {
  id: bigint;
  currentAddress?: Address;
  arbiter?: Address;
  escrowAddress?: Address;
  timeline: TimelineEvent[];
}) {
  const [busy, setBusy] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const { data: rawOrder, refetch } = useScaffoldReadContract({
    contractName: "Escrow",
    functionName: "getOrder",
    args: [id],
  });
  const { writeContractAsync: writeEscrow } = useScaffoldWriteContract({ contractName: "Escrow" });
  const { writeContractAsync: writeToken } = useScaffoldWriteContract({ contractName: TOKEN_NAME });

  const order = rawOrder as OrderData | undefined;
  if (!order) {
    return <div className="rounded-lg border border-base-300 p-4">订单 {id.toString()} 读取中...</div>;
  }

  const status = Number(order.status);
  const isBuyer = currentAddress?.toLowerCase() === order.buyer.toLowerCase();
  const isSeller = currentAddress?.toLowerCase() === order.seller.toLowerCase();
  const isArbiter = currentAddress?.toLowerCase() === arbiter?.toLowerCase();
  const canPay = isBuyer && status === 0;
  const canShip = HAS_SHIPPED_STATUS && isSeller && status === 1;
  const canConfirm = isBuyer && (HAS_SHIPPED_STATUS ? status === 2 : status === 1);
  const canDispute =
    (isBuyer || isSeller) && (status === 1 || (HAS_SHIPPED_STATUS && status === 2));
  const canRefund = isBuyer && status === 1 && BigInt(Math.floor(Date.now() / 1000)) > order.deadline;
  const canResolve = isArbiter && status === (HAS_SHIPPED_STATUS ? 5 : 4);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setBusy(true);
      await action();
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const pay = () =>
    run(async () => {
      if (!escrowAddress) throw new Error("Escrow 地址尚未读取");
      await writeToken({ functionName: "approve", args: [escrowAddress, order.amount] });
      await writeEscrow({ functionName: "deposit", args: [id] });
    });

  return (
    <article className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">订单 #{id.toString()}</h3>
          <p className="text-sm text-base-content/70">{order.description || "无描述"}</p>
        </div>
        <span className="badge badge-primary">{STATUS[status] ?? `状态 ${status}`}</span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
        <div><dt className="text-base-content/60">买家</dt><dd>{shortAddress(order.buyer)}</dd></div>
        <div><dt className="text-base-content/60">卖家</dt><dd>{shortAddress(order.seller)}</dd></div>
        <div><dt className="text-base-content/60">金额</dt><dd>{formatUnits(order.amount, 18)} LTC202430550827</dd></div>
        <div><dt className="text-base-content/60">截止时间</dt><dd>{new Date(Number(order.deadline) * 1000).toLocaleString()}</dd></div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {canPay && <button className="btn btn-primary btn-sm" disabled={busy} onClick={pay}>付款（授权并存入）</button>}
        {canShip && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "markShipped", args: [id] }))}>标记已发货</button>}
        {canConfirm && <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "confirm", args: [id] }))}>确认收货</button>}
        {canRefund && <button className="btn btn-warning btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "refund", args: [id] }))}>超期退款</button>}
        {canDispute && <button className="btn btn-warning btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "dispute", args: [id] }))}>发起争议</button>}
        {canResolve && (
          <>
            <button className="btn btn-error btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "resolve", args: [id, false] }))}>退给买家</button>
            <button className="btn btn-info btn-sm" disabled={busy} onClick={() => run(() => writeEscrow({ functionName: "resolve", args: [id, true] }))}>判给卖家</button>
          </>
        )}
        {!canPay && !canShip && !canConfirm && !canRefund && !canDispute && !canResolve && (
          <span className="text-sm text-base-content/60">当前账户没有可执行操作</span>
        )}
      </div>

      <button className="mt-4 text-sm font-medium text-primary underline" onClick={() => setTimelineOpen(open => !open)}>
        {timelineOpen ? "收起事件时间线" : "展开事件时间线"}
      </button>
      {timelineOpen && (
        <ol className="mt-3 space-y-2 border-l-2 border-primary/30 pl-4 text-sm">
          {timeline.map((item, index) => (
            <li key={`${item.transactionHash}-${item.logIndex}-${index}`}>
              <div className="font-medium">{item.name}{item.detail ? `：${item.detail}` : ""}</div>
              <div className="text-base-content/60">
                区块 {item.blockNumber?.toString() ?? "-"} · {item.transactionHash ?? "无交易哈希"}
              </div>
            </li>
          ))}
          {timeline.length === 0 && <li className="text-base-content/60">暂无事件</li>}
        </ol>
      )}
    </article>
  );
}

export default function EscrowPage() {
  const { address } = useAccount();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("30");
  const [minutes, setMinutes] = useState("30");
  const [description, setDescription] = useState("实验订单");
  const [formError, setFormError] = useState("");

  const { data: escrowInfo } = useDeployedContractInfo({ contractName: "Escrow" });
  const { data: tokenInfo } = useDeployedContractInfo({ contractName: TOKEN_NAME });
  const { data: arbiter } = useScaffoldReadContract({ contractName: "Escrow", functionName: "arbiter" });
  const { data: orderCount } = useScaffoldReadContract({ contractName: "Escrow", functionName: "orderCount" });
  const { writeContractAsync: writeEscrow } = useScaffoldWriteContract({ contractName: "Escrow" });
  const { data: createdEvents, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "Escrow",
    eventName: "OrderCreated",
    fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0),
    watch: true,
    blocksBatchSize: EVENT_BATCH_SIZE,
  });
  const { data: paidEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderPaid", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });
  const { data: shippedEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderShipped", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });
  const { data: disputedEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderDisputed", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });
  const { data: completedEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderCompleted", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });
  const { data: refundedEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderRefunded", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });
  const { data: resolvedEvents } = useScaffoldEventHistory({ contractName: "Escrow", eventName: "OrderResolved", fromBlock: BigInt(escrowInfo?.deployedOnBlock ?? 0), watch: true, blocksBatchSize: EVENT_BATCH_SIZE });

  const timelineByOrder = useMemo(() => {
    const all: TimelineEvent[] = [];
    const add = (events: any[] | undefined, name: string, detail?: (event: any) => string) => {
      for (const event of events ?? []) {
        const id = event.args?.id;
        if (typeof id !== "bigint") continue;
        all.push({
          name,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          transactionHash: event.transactionHash,
          detail: detail?.(event),
        });
        (all[all.length - 1] as TimelineEvent & { orderId?: bigint }).orderId = id;
      }
    };
    add(createdEvents, "创建订单");
    add(paidEvents, "买家付款");
    add(shippedEvents, "卖家发货");
    add(disputedEvents, "发起争议");
    add(completedEvents, "订单完成");
    add(refundedEvents, "订单退款");
    add(resolvedEvents, "仲裁完成", event => event.args?.sellerWins ? "判给卖家" : "退给买家");
    return all.reduce<Record<string, TimelineEvent[]>>((result, item) => {
      const orderId = (item as TimelineEvent & { orderId?: bigint }).orderId;
      if (orderId === undefined) return result;
      const clean = { ...item } as TimelineEvent;
      delete (clean as TimelineEvent & { orderId?: bigint }).orderId;
      (result[orderId.toString()] ??= []).push(clean);
      return result;
    }, {});
  }, [createdEvents, paidEvents, shippedEvents, disputedEvents, completedEvents, refundedEvents, resolvedEvents]);

  for (const events of Object.values(timelineByOrder)) {
    events.sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0));
  }

  const ids = useMemo(() => {
    const values = (createdEvents ?? [])
      .map(event => event.args?.id)
      .filter((id): id is bigint => typeof id === "bigint");
    // Keep the event-derived ids, but use orderCount as a live fallback while
    // POTOS finishes its batched historical log query.
    const count = typeof orderCount === "bigint" ? Number(orderCount) : 0;
    for (let index = 0; index < count; index++) values.push(BigInt(index));
    return [...new Set(values.map(value => value.toString()))]
      .map(value => BigInt(value))
      .sort((a, b) => (a < b ? 1 : -1));
  }, [createdEvents, orderCount]);

  const currentRole = useMemo(() => {
    if (!address) return "未连接钱包";
    if (arbiter && address.toLowerCase() === arbiter.toLowerCase()) return "仲裁人";
    const event = (createdEvents ?? []).find(item => {
      const buyer = item.args?.buyer as string | undefined;
      const sellerAddress = item.args?.seller as string | undefined;
      return buyer?.toLowerCase() === address.toLowerCase() || sellerAddress?.toLowerCase() === address.toLowerCase();
    });
    if (event?.args?.buyer?.toLowerCase() === address.toLowerCase()) return "买家";
    if (event?.args?.seller?.toLowerCase() === address.toLowerCase()) return "卖家";
    return "旁观者";
  }, [address, arbiter, createdEvents]);

  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!isAddress(seller)) return setFormError("请输入有效的卖家地址");
    if (!tokenInfo?.address) return setFormError("代币合约地址尚未读取");
    const numericAmount = Number(amount);
    const numericMinutes = Number(minutes);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setFormError("金额必须大于 0");
    if (!Number.isFinite(numericMinutes) || numericMinutes <= 0) return setFormError("期限必须大于 0 分钟");

    await writeEscrow({
      functionName: "createOrder",
      args: [
        seller as Address,
        tokenInfo.address,
        parseUnits(amount, 18),
        BigInt(Math.floor(Date.now() / 1000) + Math.floor(numericMinutes * 60)),
        description,
      ],
    });
    setSeller("");
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">POTOS Testnet · Escrow</p>
        <h1 className="text-4xl font-bold">托管订单</h1>
        <p className="text-base-content/70">当前账户：{address ?? "请连接 MetaMask"} · 当前角色：{currentRole}</p>
        <p className="text-sm text-base-content/60">仲裁人：{arbiter ? shortAddress(arbiter) : "读取中..."}</p>
      </header>

      <section className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-sm">
        <h2 className="text-xl font-semibold">创建订单</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={createOrder}>
          <label className="form-control"><span className="label-text">卖家地址</span><input className="input input-bordered" value={seller} onChange={event => setSeller(event.target.value)} placeholder="0x..." /></label>
          <label className="form-control"><span className="label-text">金额（代币个数）</span><input className="input input-bordered" type="number" min="0.000000000000000001" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <label className="form-control"><span className="label-text">多少分钟后到期</span><input className="input input-bordered" type="number" min="1" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
          <label className="form-control"><span className="label-text">描述</span><input className="input input-bordered" value={description} onChange={event => setDescription(event.target.value)} /></label>
          {formError && <p className="text-sm text-error md:col-span-2">{formError}</p>}
          <button className="btn btn-primary md:col-span-2" type="submit" disabled={!address}>创建订单</button>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">订单列表</h2><span className="text-sm text-base-content/60">共 {ids.length} 笔</span></div>
        {eventsLoading && <p>正在读取链上订单...</p>}
        {!eventsLoading && ids.length === 0 && <p className="rounded-lg border border-dashed border-base-300 p-6 text-base-content/60">暂无订单</p>}
        {ids.map(id => <OrderRow key={id.toString()} id={id} currentAddress={address} arbiter={arbiter as Address | undefined} escrowAddress={escrowInfo?.address} timeline={timelineByOrder[id.toString()] ?? []} />)}
      </section>
    </main>
  );
}
