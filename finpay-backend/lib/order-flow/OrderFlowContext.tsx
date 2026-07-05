"use client";

/**
 * Drives the single slide-over order drawer (README "one drawer, screen state").
 * Owns which screen shows, the pickup-date selection, the checkout gate, and the
 * Pay-now hand-off to Finpay. Nested inside CartProvider + AuthProvider.
 *
 * Because Google sign-in is a full-page OAuth redirect, the intended next screen
 * is stashed in localStorage and resumed on return (cart is in localStorage too,
 * so nothing is lost — README §2 "you won't lose a crumb").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useAuth } from "@/lib/auth/AuthContext";
import { getPickupWindow, type PickupDateOption } from "@/lib/pickupDate";

export type OrderScreen = "cart" | "signin" | "date" | "review" | "orders" | "profile" | "status";

const RESUME_KEY = "nbl_resume_screen";

interface OrderFlowValue {
  screen: OrderScreen | null;
  statusOrderId: string | null;
  open: (screen: OrderScreen) => void;
  go: (screen: OrderScreen) => void;
  close: () => void;
  openStatus: (orderId: string) => void;
  startCheckout: () => void; // cart → signin gate → date
  // pickup date
  pickupWindow: PickupDateOption[];
  pickupDate: string | null;
  setPickupDate: (date: string) => void;
  // checkout
  phone: string;
  setPhone: (phone: string) => void;
  paying: boolean;
  payError: string | null;
  payNow: () => Promise<void>;
}

const OrderFlowContext = createContext<OrderFlowValue | null>(null);

export function OrderFlowProvider({ children }: { children: ReactNode }) {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();

  const [screen, setScreen] = useState<OrderScreen | null>(null);
  const [statusOrderId, setStatusOrderId] = useState<string | null>(null);
  const [pickupDate, setPickupDateState] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const resumed = useRef(false);

  // Compute the pickup window once per mount ("today" is stable enough here).
  const pickupWindow = useMemo(() => getPickupWindow(), []);

  const firstSelectable = useMemo(() => pickupWindow.find((d) => !d.disabled)?.date ?? null, [pickupWindow]);

  const lockScroll = useCallback((locked: boolean) => {
    if (typeof document !== "undefined") {
      document.documentElement.style.overflow = locked ? "hidden" : "";
    }
  }, []);

  const open = useCallback(
    (s: OrderScreen) => {
      setScreen(s);
      lockScroll(true);
    },
    [lockScroll],
  );

  const go = useCallback((s: OrderScreen) => setScreen(s), []);

  const close = useCallback(() => {
    setScreen(null);
    lockScroll(false);
  }, [lockScroll]);

  const openStatus = useCallback(
    (orderId: string) => {
      setStatusOrderId(orderId);
      open("status");
    },
    [open],
  );

  const setPickupDate = useCallback((date: string) => setPickupDateState(date), []);

  // Default the pickup date to the first selectable day when landing on the step.
  useEffect(() => {
    if (screen === "date" && !pickupDate && firstSelectable) {
      setPickupDateState(firstSelectable);
    }
  }, [screen, pickupDate, firstSelectable]);

  // Checkout gate: signed in → pickup date; else → in-drawer sign-in, stashing
  // the resume point across the OAuth redirect.
  const startCheckout = useCallback(() => {
    if (user) {
      open("date");
    } else {
      try {
        window.localStorage.setItem(RESUME_KEY, "date");
      } catch {}
      open("signin");
    }
  }, [user, open]);

  // On return from OAuth (now signed in), resume where we left off.
  useEffect(() => {
    if (resumed.current || !user) return;
    let resume: string | null = null;
    try {
      resume = window.localStorage.getItem(RESUME_KEY);
    } catch {}
    if (resume === "date") {
      resumed.current = true;
      try {
        window.localStorage.removeItem(RESUME_KEY);
      } catch {}
      if (items.length > 0) open("date");
    }
  }, [user, items.length, open]);

  const payNow = useCallback(async () => {
    if (!user) {
      startCheckout();
      return;
    }
    if (!pickupDate || items.length === 0) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((l) => ({ sku: l.sku, qty: l.qty })),
          customer: { mobilePhone: phone },
          pickupDate,
        }),
      });
      const data = await res.json();
      if (res.ok && data.redirectUrl) {
        clearCart();
        // Real Finpay hosted page — full-page redirect; return lands on
        // /order/[id]?from=success (the confirmation/status page).
        window.location.href = data.redirectUrl;
      } else {
        setPayError(data.error ?? "Payment initiation failed, please try again.");
        setPaying(false);
      }
    } catch {
      setPayError("Request failed — check your connection and try again.");
      setPaying(false);
    }
  }, [user, pickupDate, items, phone, clearCart, startCheckout]);

  const value: OrderFlowValue = {
    screen,
    statusOrderId,
    open,
    go,
    close,
    openStatus,
    startCheckout,
    pickupWindow,
    pickupDate,
    setPickupDate,
    phone,
    setPhone,
    paying,
    payError,
    payNow,
  };

  return <OrderFlowContext.Provider value={value}>{children}</OrderFlowContext.Provider>;
}

export function useOrderFlow(): OrderFlowValue {
  const ctx = useContext(OrderFlowContext);
  if (!ctx) throw new Error("useOrderFlow() must be used within <OrderFlowProvider>");
  return ctx;
}
