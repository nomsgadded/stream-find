"use client";
import { useEffect, useRef, useState } from "react";

export default function useMobileSearchFocus() {
  const [active, setActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const begin = () => {
    if (window.matchMedia("(max-width: 700px)").matches) setActive(true);
  };
  const end = () => setActive(false);
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const update = () => {
      if (!window.matchMedia("(max-width: 700px)").matches) { setActive(false); return; }
      const container = containerRef.current;
      container?.style.setProperty("--search-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      container?.style.setProperty("--search-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return { active, begin, end, containerRef };
}
