import { useState, useCallback, useRef, useEffect } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

type AnimationPhase = 'idle' | 'highlight' | 'badge' | 'settle'

type UseCascadeAnimationReturn = {
  triggerCascade: (transactionIds: string[]) => void
  animatingIds: string[]
  isAnimating: boolean
  animationPhase: AnimationPhase
}

const PHASE_DURATIONS = {
  highlight: 100,
  badge: 200,
  settle: 300,
} as const

export const useCascadeAnimation = (): UseCascadeAnimationReturn => {
  const prefersReducedMotion = useReducedMotion()
  const [animatingIds, setAnimatingIds] = useState<string[]>([])
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('idle')
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const triggerCascade = useCallback(
    (transactionIds: string[]) => {
      clearTimers()

      if (prefersReducedMotion) {
        setAnimatingIds([])
        setAnimationPhase('idle')
        return
      }

      setAnimatingIds(transactionIds)
      setAnimationPhase('highlight')

      const t1 = setTimeout(() => {
        setAnimationPhase('badge')
      }, PHASE_DURATIONS.highlight)

      const t2 = setTimeout(() => {
        setAnimationPhase('settle')
      }, PHASE_DURATIONS.highlight + PHASE_DURATIONS.badge)

      const t3 = setTimeout(() => {
        setAnimationPhase('idle')
        setAnimatingIds([])
      }, PHASE_DURATIONS.highlight + PHASE_DURATIONS.badge + PHASE_DURATIONS.settle)

      timersRef.current = [t1, t2, t3]
    },
    [prefersReducedMotion, clearTimers],
  )

  return {
    triggerCascade,
    animatingIds,
    isAnimating: animationPhase !== 'idle',
    animationPhase,
  }
}
