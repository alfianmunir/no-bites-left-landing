"use client";

/**
 * The unified marketing landing. Sections are ported from the prototype in
 * phases; the order flow lives in the shared drawer. `/order` renders this with
 * `openOrder` so the deep link opens the cart/checkout straight away.
 */
import { useEffect } from "react";
import { useLanding } from "@/lib/landing/LandingContext";
import { useOrderFlow } from "@/lib/order-flow/OrderFlowContext";
import LandingNav from "./LandingNav";
import LandingHero from "./LandingHero";
import LandingStory from "./LandingStory";
import LandingMenu from "./LandingMenu";
import LandingQuiz from "./LandingQuiz";
import LandingInside from "./LandingInside";
import LandingTreat from "./LandingTreat";
import LandingOrder from "./LandingOrder";
import LandingB2B from "./LandingB2B";
import LandingFeedback from "./LandingFeedback";
import LandingFooter from "./LandingFooter";
import LandingThemePicker from "./LandingThemePicker";

export default function LandingPage({ openOrder = false, scrollTo }: { openOrder?: boolean; scrollTo?: string }) {
  const { themeVars, playful } = useLanding();
  const flow = useOrderFlow();

  useEffect(() => {
    if (openOrder) flow.open("cart");
  }, [openOrder, flow]);

  // Deep-link routes (/menu, /feedback, /b2b) render the landing and jump to a
  // section. Sections load async (menu/reviews fetch) and images shift layout,
  // so scroll a few times as it settles. scroll-margin-top handles the sticky nav.
  useEffect(() => {
    if (!scrollTo) return;
    const jump = () => document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
    const timers = [80, 450, 900].map((ms) => window.setTimeout(jump, ms));
    return () => timers.forEach(clearTimeout);
  }, [scrollTo]);

  return (
    <div className="nbl-landing" data-playful={playful ? "true" : "false"} style={themeVars}>
      <LandingNav />
      <LandingHero />
      <LandingStory />
      <LandingMenu />
      <LandingQuiz />
      <LandingInside />
      <LandingTreat />
      <LandingOrder />
      <LandingB2B />
      <LandingFeedback />
      <LandingFooter />
      <LandingThemePicker />
    </div>
  );
}
