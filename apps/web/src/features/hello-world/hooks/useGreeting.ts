import { useCallback, useState } from 'react'
import type { Greeting } from '../types'

const AUDIENCES = ['world', 'developer', 'friend', 'Vite user', 'template user']

export function useGreeting(): {
  greeting: Greeting
  cycleAudience: () => void
} {
  const [index, setIndex] = useState(0)

  const cycleAudience = useCallback(() => {
    setIndex((prev) => (prev + 1) % AUDIENCES.length)
  }, [])

  return {
    greeting: { message: 'Hello', audience: AUDIENCES[index] },
    cycleAudience,
  }
}
