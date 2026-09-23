import type {
  BasketOrder,
  Driver,
  RecoveryItem,
  SlotId,
  VerificationRecord,
  Zone
} from "./types";

// —— 主资料：时段与司机车载额度 ——

export const SLOTS: { id: SlotId; label: string; window: string }[] = [
  { id: "morning", label: "早班", window: "06:00–10:00" },
  { id: "noon", label: "午班", window: "11:00–14:00" },
  { id: "evening", label: "晚班", window: "16:00–20:00" }
];

export const ZONE_LABEL: Record<Zone, string> = {
  cold: "冷筐",
  ambient: "常温筐"
};

export const SLOT_LABEL: Record<SlotId, string> = Object.fromEntries(
  SLOTS.map((slot) => [slot.id, slot.label])
) as Record<SlotId, string>;

export const DRIVERS: Driver[] = [
  { id: "d-liu", name: "刘师傅", coldCap: 40, ambCap: 40, totalCap: 60 },
  { id: "d-zhao", name: "赵师傅", coldCap: 30, ambCap: 50, totalCap: 60 },
  { id: "d-sun", name: "孙师傅", coldCap: 20, ambCap: 30, totalCap: 40 }
];

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = "hxwlfront-14-basket-desk-v2";

// —— 种子数据：覆盖待分配、已排车、已发车、已送达(含待回收) ——

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

export const SEED_ORDERS: BasketOrder[] = [
  {
    id: "seed-o1",
    orderNo: "ORD-9012",
    destination: "浦东生鲜市场",
    slot: "morning",
    cold: 20,
    amb: 10,
    status: "assigned",
    driverId: "d-liu",
    note: "上午配送，冷链优先",
    createdAt: iso(1)
  },
  {
    id: "seed-o2",
    orderNo: "ORD-9031",
    destination: "嘉定商超",
    slot: "morning",
    cold: 12,
    amb: 18,
    status: "assigned",
    driverId: "d-liu",
    note: "待排班",
    createdAt: iso(1)
  },
  {
    id: "seed-o3",
    orderNo: "ORD-9045",
    destination: "虹桥餐饮街",
    slot: "noon",
    cold: 8,
    amb: 20,
    status: "departed",
    driverId: "d-zhao",
    note: "午班发车",
    createdAt: iso(0)
  },
  {
    id: "seed-o4",
    orderNo: "ORD-9058",
    destination: "徐汇社区店",
    slot: "evening",
    cold: 6,
    amb: 4,
    status: "pending",
    note: "客户要求傍晚送达",
    createdAt: iso(0)
  },
  {
    id: "seed-o5",
    orderNo: "ORD-9001",
    destination: "闵行冷链仓",
    slot: "morning",
    cold: 15,
    amb: 0,
    status: "delivered",
    driverId: "d-sun",
    note: "昨日班次",
    createdAt: iso(2)
  }
];

export const SEED_VERIFICATIONS: VerificationRecord[] = [
  {
    id: "seed-v1",
    orderId: "seed-o5",
    orderNo: "ORD-9001",
    driverId: "d-sun",
    slot: "morning",
    issuedCold: 15,
    issuedAmb: 0,
    versions: [
      {
        version: 1,
        createdAt: iso(2),
        returnedCold: 13,
        returnedAmb: 0,
        damagedCold: 1,
        damagedAmb: 0,
        note: "客户现场清点"
      }
    ]
  }
];

export const SEED_RECOVERIES: RecoveryItem[] = [
  {
    id: "seed-r1",
    orderId: "seed-o5",
    orderNo: "ORD-9001",
    verificationId: "seed-v1",
    version: 1,
    driverId: "d-sun",
    slot: "morning",
    zone: "cold",
    missingQty: 2,
    damagedQty: 1,
    status: "open",
    createdAt: iso(2)
  }
];
