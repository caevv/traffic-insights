import { Button } from '@/shared/components/Button'
import { useGreeting } from '../hooks/useGreeting'
import './HelloWorld.css'

export function HelloWorld() {
  const { greeting, cycleAudience } = useGreeting()

  return (
    <section className="hello-world">
      <h1>
        {greeting.message},{' '}
        <span className="audience">{greeting.audience}</span>!
      </h1>
      <p>
        Edit <code>src/features/hello-world/</code> to customize this feature,
        or add your own slice under <code>src/features/</code>.
      </p>
      <Button onClick={cycleAudience}>Cycle audience</Button>
    </section>
  )
}
