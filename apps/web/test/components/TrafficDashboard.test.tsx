import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrafficDashboard } from '@/features/traffic-dashboard'
import { stubApi } from '../helpers/stubApi'

/**
 * The whole dashboard, with only fetch stubbed.
 *
 * Everything between the DOM and the network is real: the query client, the
 * query-string builder, the filter state, and the SVG Recharts draws.
 */
function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // A retry turns a failed assertion into a timeout, and a stale time
      // lets one test read another test's cached response.
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TrafficDashboard />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrafficDashboard', () => {
  it('renders the KPI strip from the summary endpoint', async () => {
    stubApi()
    renderDashboard()

    // Scoped to the KPI card. 700 is also the total in the donut centre.
    const totalCard = (await screen.findByText('Total vehicles')).closest(
      '.kpi',
    )
    expect(
      within(totalCard as HTMLElement).getByText('700'),
    ).toBeInTheDocument()
    expect(await screen.findByText('48.6 km/h')).toBeInTheDocument()
  })

  it('renders both required charts with their headings', async () => {
    stubApi()
    renderDashboard()

    expect(
      await screen.findByRole('heading', { name: 'Country-wise traffic' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Vehicle type distribution' }),
    ).toBeInTheDocument()
  })

  it('shows each vehicle type with its share in the legend', async () => {
    stubApi()
    renderDashboard()

    // 600/700 = 85.7%, 100/700 = 14.3%.
    expect(await screen.findByText('85.7%')).toBeInTheDocument()
    expect(await screen.findByText('14.3%')).toBeInTheDocument()
  })

  it('asks the API for the default 30-day window', async () => {
    const api = stubApi()
    renderDashboard()

    await waitFor(() =>
      expect(
        api.calls.some((call) => call.url.includes('/traffic/by-country')),
      ).toBe(true),
    )

    const request = api.calls.find((call) =>
      call.url.includes('/traffic/by-country'),
    )
    expect(request?.url).toContain('from=')
    // No country or vehicle filters until someone picks one.
    expect(request?.url).not.toContain('countries=')
  })

  /** The point of cross-filtering: a chart click has to reach the network. */
  it('re-queries with a country filter when a legend entry is clicked', async () => {
    const user = userEvent.setup()
    const api = stubApi()
    renderDashboard()

    await screen.findByText('85.7%')

    // The donut legend is also a keyboard-friendly filter control.
    // Scoped to the legend, because a "Car" filter chip has the same name.
    const legend = screen.getByRole('list', { name: 'Vehicle type shares' })
    await user.click(within(legend).getByRole('button', { name: /Car/ }))

    await waitFor(() => {
      expect(
        api.calls.some((call) => call.url.includes('vehicleTypes=car')),
      ).toBe(true)
    })
  })

  it('reflects a filter chip selection in the request', async () => {
    const user = userEvent.setup()
    const api = stubApi()
    renderDashboard()

    await screen.findByText('Total vehicles')

    await user.click(screen.getByRole('button', { name: 'DE' }))

    await waitFor(() => {
      expect(api.calls.some((call) => call.url.includes('countries=DE'))).toBe(
        true,
      )
    })
  })

  it('enables the reset button only once something is filtered', async () => {
    const user = userEvent.setup()
    stubApi()
    renderDashboard()

    await screen.findByText('Total vehicles')

    const reset = screen.getByRole('button', { name: 'Reset filters' })
    expect(reset).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'DE' }))
    expect(reset).toBeEnabled()

    await user.click(reset)
    expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('lists observations in the records table', async () => {
    stubApi()
    renderDashboard()

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Germany')).toBeInTheDocument()
    expect(within(table).getByText('300')).toBeInTheDocument()
  })

  it('sends a PATCH when a vehicle count is edited inline', async () => {
    const user = userEvent.setup()
    const api = stubApi()
    renderDashboard()

    const table = await screen.findByRole('table')
    await user.click(within(table).getByRole('button', { name: '300' }))

    const input = await screen.findByLabelText(/Vehicle count for Germany Car/)
    await user.clear(input)
    await user.type(input, '450{Enter}')

    await waitFor(() => {
      const patch = api.calls.find((call) => call.method === 'PATCH')
      expect(patch?.url).toContain('/traffic/records/1')
    })
  })

  it('surfaces a failed load as an error the reader can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'INTERNAL', message: 'Database is unreachable.' },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    renderDashboard()

    expect(
      await screen.findByText('Database is unreachable.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })
})
