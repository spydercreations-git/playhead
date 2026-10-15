"use client";

import { useReducedMotion, Transition } from "framer-motion";

/**
 * Standard transition curves and durations per Playhead spec:
 * Durations: 150ms to 250ms, ease out.
 * Closes faster than opens.
 * Respects "prefers-reduced-motion".
 */

export const transitions: Record<string, Transition> = {
  fast: {
    duration: 0.15,
    ease: "easeOut",
  },
  default: {
    duration: 0.2,
    ease: "easeOut",
  },
  slow: {
    duration: 0.25,
    ease: "easeOut",
  },
  close: {
    duration: 0.12,
    ease: "easeIn",
  },
  spring: {
    type: "spring",
    stiffness: 400,
    damping: 30,
  },
};

export const staggerContainer = (staggerMs = 0.03) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerMs,
    },
  },
});

export const itemFadeSlide = {
  hidden: { opacity: 0, y: 6, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -6,
    transition: transitions.close,
  },
};

export const cardScaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: transitions.close,
  },
};

export const dialogAnimation = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: transitions.close,
  },
};

export const menuAnimation = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.fast,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: -2,
    transition: transitions.close,
  },
};

/**
 * Hook to check if device prefers reduced motion.
 * When true, animations are disabled (duration 0).
 */
export function useMotionConfig() {
  const shouldReduceMotion = useReducedMotion();

  return {
    reduced: shouldReduceMotion,
    transition: (shouldReduceMotion ? { duration: 0 } : transitions.default) as Transition,
    fastTransition: (shouldReduceMotion ? { duration: 0 } : transitions.fast) as Transition,
    closeTransition: (shouldReduceMotion ? { duration: 0 } : transitions.close) as Transition,
  };
}
