/**
 * 存储层：localStorage 读写。
 * 订单、回收记录、核销版本放在同一个 key 下整体读写，
 * 任何一次操作都原子落盘，刷新后不会出现三类数据互相错位。
 */
import type { Order, Recovery, Verification } from "./domain";
import { SEED_ORDERS, SEED_RECOVERIES, SEED_VERIFICATIONS } from "./data";

export const STORAGE_KEY = "hxwlfront-14-basket-console";

export interface ConsoleState {
  orders: Order[];
  recoveries: Recovery[];
  verifications: Verification[];
}

function seedState(): ConsoleState {
  return {
    orders: SEED_ORDERS,
    recoveries: SEED_RECOVERIES,
    verifications: SEED_VERIFICATIONS
  };
}

export function loadState(): ConsoleState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    const parsed = JSON.parse(raw) as Partial<ConsoleState>;
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      recoveries: Array.isArray(parsed.recoveries) ? parsed.recoveries : [],
      verifications: Array.isArray(parsed.verifications) ? parsed.verifications : []
    };
  } catch {
    return seedState();
  }
}

export function saveState(state: ConsoleState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
