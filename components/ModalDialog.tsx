"use client";

import { useLayoutEffect, useRef, type HTMLAttributes } from "react";

const activeDialogs: HTMLElement[] = [];
const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ModalDialog({ children, ...props }: HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const isolated: Array<{ element: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          isolated.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    document.body.style.overflow = "hidden";
    activeDialogs.push(dialog);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.matches(':disabled, [hidden]') && element.tabIndex >= 0 && element.getClientRects().length > 0);
    const focusInitial = () => (dialog.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? controls()[0] ?? dialog).focus();
    focusInitial();
    const containFocus = (event: FocusEvent) => {
      if (activeDialogs.at(-1) === dialog && event.target instanceof Node && !dialog.contains(event.target)) focusInitial();
    };
    const containTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || activeDialogs.at(-1) !== dialog) return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("focusin", containFocus);
    document.addEventListener("keydown", containTab, true);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.removeEventListener("keydown", containTab, true);
      activeDialogs.splice(activeDialogs.indexOf(dialog), 1);
      isolated.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <section {...props} ref={ref} tabIndex={-1} role="dialog" aria-modal="true">{children}</section>;
}
