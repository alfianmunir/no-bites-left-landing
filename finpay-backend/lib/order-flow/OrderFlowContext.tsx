"use client";

/**
 * Drives the single slide-over order drawer (README "one drawer, screen state").
 * Owns which screen shows, the pickup-location + rule-aware pickup-date
 * selection, the checkout gate, and the Pay-now hand-off to Finpay. Nested
 * inside CartProvider + AuthProvider.
 *
 * Screen order (v1 multi-location): cart → signin → location → date → review.
 * A selected `external` location branches out to Shopee/GrabFood and never
 * reaches date/review.
 *
 * Because Google sign-in is a full-page OAuth redirect, the intended next screen
 * is stashed in localStorage and resumed on return (cart is in localStorage too,
 * so nothing is lost — README §2 "you won't lose a crumb").
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  getPickupWindow,
  defaultPickupMonth,
  shiftMonth,
  DEFAULT_PICKUP_SETTINGS,
  type PickupDateOption,
  type PickupLocation,
  type PickupSettings,
} from "@/lib/pickup";

export type OrderScreen = "cart" | "signin" | "location" | "date" | "review" | "orders" | "profile" | "status";

const RESUME_KEY = "nbl_resume_screen";
const RESUME_TARGET: OrderScreen = "location"; // where checkout resumes after OAuth

interface OrderFlowValue {
  screen: OrderScreen | null;
  statusOrderId: string | null;
  open: (screen: OrderScreen) => void;
  go: (screen: OrderScreen) => void;
  close: () => void;
  openStatus: (orderId: string) => void;
  startCheckout: () => void; // cart → signin gate → location
  // pickup locations
  locations: PickupLocation[];
  settings: PickupSettings;
  selectedLocationId: string | null;
  selectedLocation: PickupLocation | null;
  setSelectedLocation: (id: string) => void;
  // pickup date (rule-aware month grid)
  month: string; // "YYYY-MM"
  prevMonth: () => void;
  nextMonth: () => void;
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
  const { items, clearCart } = useCart();
  const { user } = useAuth();

  const [screen, setScreen] = useState<OrderScreen | null>(null);
  const [statusOrderId, setStatusOrderId] = useState<string | null>(null);
  const [pickupDate, setPickupDateState] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const resumed = useRef(false);

  // Pickup catalog (active locations + settings) — loaded once from the server.
  const [locations, setLocations] = useState<PickupLocation[]>([]);
  const [settings, setSettings] = useState<PickupSettings>(DEFAULT_PICKUP_SETTINGS);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => defaultPickupMonth());

  useEffect(() => {
    let active = true;
    fetch("/api/pickup-locations")
      .then((r) => (r.ok ? r.json() : { locations: [], settings: DEFAULT_PICKUP_SETTINGS }))
      .then((d) => {
        if (!active) return;
        setLocations(Array.isArray(d.locations) ? d.locations : []);
        if (d.settings) setSettings(d.settings);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

  // Rule-aware month grid for the selected location (empty until one is picked).
  const pickupWindow = useMemo(() => {
    if (!selectedLocation || selectedLocation.rule.type === "external") return [];
    return getPickupWindow(selectedLocation.rule, new Date(), month, settings.sameDayCutoffWib);
  }, [selectedLocation, month, settings.sameDayCutoffWib]);

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

  const setSelectedLocation = useCallback((id: string) => {
    setSelectedLocationId(id);
    // Re-open the calendar on the month that has selectable days and clear any
    // previously chosen date (the new location's rule may exclude it).
    setMonth(defaultPickupMonth());
    setPickupDateState(null);
  }, []);

  const setPickupDate = useCallback((date: string) => setPickupDateState(date), []);
  const prevMonth = useCallback(() => setMonth((m) => shiftMonth(m, -1)), []);
  const nextMonth = useCallback(() => setMonth((m) => shiftMonth(m, 1)), []);

  // Default the pickup date to the first selectable day when landing on the step
  // (or when the location/month changes and the current pick is no longer valid).
  useEffect(() => {
    if (screen !== "date") return;
    const stillValid = pickupDate && pickupWindow.some((d) => d.date === pickupDate && !d.disabled);
    if (!stillValid && firstSelectable) setPickupDateState(firstSelectable);
  }, [screen, pickupDate, firstSelectable, pickupWindow]);

  // Checkout gate: signed in → pickup location; else → in-drawer sign-in,
  // stashing the resume point across the OAuth redirect.
  const startCheckout = useCallback(() => {
    if (user) {
      open("location");
    } else {
      try {
        window.localStorage.setItem(RESUME_KEY, RESUME_TARGET);
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
    if (resume === RESUME_TARGET) {
      resumed.current = true;
      try {
        window.localStorage.removeItem(RESUME_KEY);
      } catch {}
      if (items.length > 0) open(RESUME_TARGET);
    }
  }, [user, items.length, open]);

  const payNow = useCallback(async () => {
    if (!user) {
      startCheckout();
      return;
    }
    if (!pickupDate || !selectedLocationId || items.length === 0) return;
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
          pickupLocationId: selectedLocationId,
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
  }, [user, pickupDate, selectedLocationId, items, phone, clearCart, startCheckout]);

  const value: OrderFlowValue = {
    screen,
    statusOrderId,
    open,
    go,
    close,
    openStatus,
    startCheckout,
    locations,
    settings,
    selectedLocationId,
    selectedLocation,
    setSelectedLocation,
    month,
    prevMonth,
    nextMonth,
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
