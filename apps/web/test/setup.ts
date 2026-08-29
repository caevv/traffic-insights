import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom does no layout, so every element measures 0x0. Recharts'
 * ResponsiveContainer measures its parent and draws nothing at zero width, so
 * every chart test would be checking an empty SVG.
 *
 * Stubbing ResizeObserver and the bounding box gives the charts a size to draw
 * into, so the tests run the real Recharts code and not a mock of it.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as never

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => ({
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }),
})

// Recharts reads these directly when it sizes its container.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 800,
})
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 400,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
