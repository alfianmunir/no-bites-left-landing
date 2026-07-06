"use client";

/**
 * Client-side cart: items + qty, persisted to localStorage (no server cart
 * table — the cart is ephemeral until POST /api/orders creates a real order).
 * Also owns the cart-drawer open state and a small toast queue for the
 * remove/undo + price-changed notices the cart design calls for.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPriceItem } from "@/lib/prices";

export interface CartLine {
  sku: string;
  name: string;
  variant: string;
  unitPrice: number;
  qty: number;
}

export interface Toast {
  id: string;
  message: string;
  undo?: () => void;
}

interface CartContextValue {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (sku: string, qty?: number, line?: { name: string; variant: string; unitPrice: number }) => void;
  setQty: (sku: string, qty: number) => void;
  removeItem: (sku: string) => void;
  clearCart: () => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  notify: (message: string) => void;
}

const STORAGE_KEY = "nbl_cart_v1";
const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    setItems(readStoredCart());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const pushToast = useCallback((message: string, undo?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((cur) => [...cur, { id, message, undo }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const addItem = useCallback((sku: string, qty: number = 1, line?: { name: string; variant: string; unitPrice: number }) => {
    // Prefer caller-supplied line data (DB-driven menu) so new SKUs not in the
    // static price list still add; fall back to the static list (e.g. the quiz).
    const info = line ?? getPriceItem(sku);
    if (!info) return;
    setItems((cur) => {
      const existing = cur.find((l) => l.sku === sku);
      if (existing) {
        return cur.map((l) => (l.sku === sku ? { ...l, qty: l.qty + qty } : l));
      }
      return [...cur, { sku, name: info.name, variant: info.variant, unitPrice: info.unitPrice, qty }];
    });
  }, []);

  const removeItem = useCallback(
    (sku: string) => {
      setItems((cur) => {
        const removed = cur.find((l) => l.sku === sku);
        if (!removed) return cur;
        pushToast(`Removed ${removed.name} · ${removed.variant}`, () => {
          setItems((inner) => (inner.some((l) => l.sku === sku) ? inner : [...inner, removed]));
        });
        return cur.filter((l) => l.sku !== sku);
      });
    },
    [pushToast],
  );

  const setQty = useCallback(
    (sku: string, qty: number) => {
      if (qty <= 0) {
        removeItem(sku);
        return;
      }
      setItems((cur) => cur.map((l) => (l.sku === sku ? { ...l, qty } : l)));
    },
    [removeItem],
  );

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = useMemo(() => items.reduce((sum, l) => sum + l.unitPrice * l.qty, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, l) => sum + l.qty, 0), [items]);

  const value: CartContextValue = {
    items,
    itemCount,
    subtotal,
    isOpen,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    addItem,
    setQty,
    removeItem,
    clearCart,
    toasts,
    dismissToast,
    notify: (message: string) => pushToast(message),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart() must be used within <CartProvider>");
  return ctx;
}
