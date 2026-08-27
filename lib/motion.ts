import type { Transition, Variants } from "framer-motion";

// Critically damped by default (no overshoot) per Apple's fluid-interfaces guidance;
// reserved for momentum-driven moments only (see springBounce).
export const springSmooth: Transition = { type: "spring", damping: 26, stiffness: 220, mass: 0.9 };
export const springBounce: Transition = { type: "spring", damping: 16, stiffness: 240, mass: 0.9 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: springSmooth }
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: springSmooth }
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

export const pressScale = { scale: 0.97 };
export const hoverLift = { y: -2 };
