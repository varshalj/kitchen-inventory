"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export function AnimatedItem({
  children,
  index,
  className,
}: {
  children: ReactNode
  index: number
  className?: string
}) {
  return (
    <motion.div
      variants={itemVariants}
      initial="hidden"
      animate="show"
      transition={{
        delay: Math.min(index, 15) * 0.04,
        duration: 0.3,
        ease: "easeOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
