"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const cards = ".discoveryCard, .titleCard, .musicVideoCard, .personCreditGrid > button, .titleCreditsGrid > button, .titleCreditsGrid > article, .titleSimilarGrid > button, .titleOfferGrid > a, .togetherCandidate";
const headings = ".discoveryFeedHeading, .memberHeading, .titleSectionHeading, .personSectionHeading, .togetherResultsHeading, main section > h2, main section > header";

/** Enhance content after hydration; without animation support everything stays visible. */
export default function ScrollMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (!("IntersectionObserver" in window) || !Element.prototype.animate) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<HTMLElement>();
    const pending = new Set<HTMLElement>();
    const animations = new Set<Animation>();
    let frame = 0;

    const reveal = (element: HTMLElement, animate: boolean) => {
      pending.delete(element);
      observer.unobserve(element);
      element.removeAttribute("data-scroll-pending");
      if (!animate || reducedMotion.matches || !element.isConnected) return;
      const siblings = element.parentElement ? Array.from(element.parentElement.children) : [];
      const index = Math.max(0, siblings.indexOf(element));
      const animation = element.animate([
        { opacity: 0, translate: "0 20px" },
        { opacity: 1, translate: "0 0" },
      ], {
        duration: 540,
        delay: element.matches(cards) ? Math.min(index % 6, 4) * 45 : 0,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "backwards",
      });
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
      animation.oncancel = () => animations.delete(animation);
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target as HTMLElement, true);
      }
    }, { threshold: 0, rootMargin: "0px 0px -32px 0px" });

    const scan = () => {
      frame = 0;
      if (reducedMotion.matches) return;
      const targets = new Set(document.querySelectorAll<HTMLElement>(`${cards}, ${headings}`));
      // Standalone sections reveal as a group; grids reveal their cards individually.
      document.querySelectorAll<HTMLElement>("main section").forEach((section) => {
        if (!section.querySelector(`section, ${cards}, ${headings}`)) targets.add(section);
      });
      for (const element of targets) {
        if (seen.has(element) || element.closest('[role="dialog"], [aria-busy="true"], [aria-hidden="true"], .hero, .titleHero, .personHero, .titlePageSkeleton')) continue;
        seen.add(element);
        const bounds = element.getBoundingClientRect();
        // Above-the-fold content and restored scroll positions appear immediately.
        if (!bounds.width || !bounds.height || bounds.top < window.innerHeight) continue;
        element.setAttribute("data-scroll-pending", "");
        pending.add(element);
        observer.observe(element);
      }
      for (const element of pending) {
        if (!element.isConnected) { pending.delete(element); observer.unobserve(element); }
      }
    };
    const scheduleScan = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const mutations = new MutationObserver(scheduleScan);
    mutations.observe(document.body, { childList: true, subtree: true });
    const showFocusedContent = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>("[data-scroll-pending]");
      if (element) reveal(element, false);
      animations.forEach((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (target instanceof Element && target.contains(event.target as Node)) animation.cancel();
      });
    };
    const onMotionChange = () => {
      if (reducedMotion.matches) {
        pending.forEach((element) => reveal(element, false));
        animations.forEach((animation) => animation.cancel());
        animations.clear();
      } else scheduleScan();
    };
    document.addEventListener("focusin", showFocusedContent);
    reducedMotion.addEventListener("change", onMotionChange);
    scan();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      pending.forEach((element) => element.removeAttribute("data-scroll-pending"));
      animations.forEach((animation) => animation.cancel());
      document.removeEventListener("focusin", showFocusedContent);
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, [pathname]);
  return null;
}
