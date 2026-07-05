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

export default function LandingPage({ openOrder = false }: { openOrder?: boolean }) {
  const { themeVars, playful } = useLanding();
  const flow = useOrderFlow();

  useEffect(() => {
    if (openOrder) flow.open("cart");
  }, [openOrder, flow]);

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
      {/* Footer + first-visit theme picker arrive in the next phase. */}
    </div>
  );
}
