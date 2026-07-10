"use client"

import { motion, useReducedMotion } from "framer-motion"
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
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      variants={itemVariants}
      // Skip the slide-in entirely under reduced motion — render at rest.
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      transition={
        reduceMotion
          ? { duration: 0 }
          : { delay: Math.min(index, 15) * 0.04, duration: 0.3, ease: "easeOut" }
      }
      className={className}
    >
      {children}
    </motion.div>
  )
}
