import { QueryClientProvider } from '@tanstack/react-query'
import { TrafficDashboard } from '@/features/traffic-dashboard'
import { queryClient } from './queryClient'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TrafficDashboard />
    </QueryClientProvider>
  )
}
