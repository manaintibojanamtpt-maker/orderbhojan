import { motion } from 'framer-motion';

export function PremiumBadge({
  children,
  className = '',
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${className}`}
    >
      {children}
    </motion.span>
  );
}
