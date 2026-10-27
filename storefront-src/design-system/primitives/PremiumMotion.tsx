import { motion, type Variants } from 'framer-motion';

/** Standard spring config used across the premium design system */
export const OB_SPRING = { type: 'spring' as const, stiffness: 260, damping: 28 };
export const OB_EASE = [0.22, 1, 0.36, 1] as const;
export const OB_FAST = { duration: 0.15, ease: OB_EASE };
export const OB_NORMAL = { duration: 0.25, ease: OB_EASE };

/** Card lift on hover — subtle depth cue */
export const cardLift = {
  initial: { y: 0 },
  hover: { y: -3, transition: OB_SPRING },
};

/** Stagger container for list reveals */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/** Individual list item entrance */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: OB_SPRING },
};

/** Page transition */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: OB_SPRING },
  exit: { opacity: 0, y: -8, transition: OB_FAST },
};

/** Scale press feedback */
export const pressScale = {
  whileTap: { scale: 0.96, transition: OB_FAST },
};