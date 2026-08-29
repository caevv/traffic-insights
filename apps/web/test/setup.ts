import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom implements no layout, so every element reports a size of 0x0. Recharts'
 * `ResponsiveContainer` measures its parent and renders nothing at zero width,
 * which would make every chart test assert on an empty SVG.
 *
 * Stubbing ResizeObserver and the bounding box gives the charts a viewport to
 * draw into, so the tests exercise the real Recharts rendering path rather than
 * a mock of it.
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

// Recharts reads these directly when sizing its container.
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
