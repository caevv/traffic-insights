import { useState, type SubmitEvent } from 'react'
import { Button } from '@/shared/components/Button'
import { formatNumber, formatSpeed, formatTimestamp } from '@/shared/lib/format'
import type { RecordMutations } from '../api/queries'
import type { Reference, TrafficRecord } from '../types'
import './RecordsPanel.css'

/** `YYYY-MM-DDTHH:00`, which is what <input type="datetime-local"> wants. */
function currentHourLocalInput(): string {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}T${pad(now.getHours())}:00`
}

type RecordsPanelProps = {
  records: TrafficRecord[]
  total: number
  reference: Reference
  mutations: RecordMutations
}

/**
 * The write path: add, edit and delete records.
 *
 * This is the smallest thing that covers "enable data updates". It's not an
 * admin console. Its real job is to show the round trip: change a number here
 * and the charts above redraw from the database, because the mutation
 * invalidates their queries.
 *
 * Only vehicleCount can be edited inline. It's the number that visibly moves
 * every chart, so you can see the invalidation happen. The rest of a record is
 * its identity, and editing that in place runs into the natural key.
 */
export function RecordsPanel({
  records,
  total,
  reference,
  mutations,
}: RecordsPanelProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const firstCountry = reference.countries[0]?.code ?? 'DE'
  const firstVehicle = reference.vehicleTypes[0]?.code ?? 'car'

  const [draft, setDraft] = useState({
    country: firstCountry,
    vehicleType: firstVehicle,
    recordedAt: currentHourLocalInput(),
    vehicleCount: '1200',
    avgSpeedKph: '64',
  })

  const pendingError =
    mutations.create.error ?? mutations.update.error ?? mutations.remove.error

  function handleCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    mutations.create.mutate(
      {
        country: draft.country,
        vehicleType: draft.vehicleType,
        // datetime-local gives a plain local string. new Date reads it in the
        // browser's zone and toISOString turns it into the UTC time the API
        // stores. Sending the raw string would shift every record by the
        // user's UTC offset.
        recordedAt: new Date(draft.recordedAt).toISOString(),
        vehicleCount: Number(draft.vehicleCount),
        avgSpeedKph: Number(draft.avgSpeedKph),
      },
      { onSuccess: () => mutations.create.reset() },
    )
  }

  function startEditing(record: TrafficRecord) {
    setEditingId(record.id)
    setEditValue(String(record.vehicleCount))
  }

  function commitEdit(id: number) {
    const value = Number(editValue)
    if (Number.isFinite(value) && value >= 0) {
      mutations.update.mutate({ id, patch: { vehicleCount: value } })
    }
    setEditingId(null)
  }

  return (
    <div className="records">
      <form className="records__form" onSubmit={handleCreate}>
        <label className="records__field">
          <span>Country</span>
          <select
            value={draft.country}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                country: event.target.value,
              }))
            }
          >
            {reference.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label className="records__field">
          <span>Vehicle type</span>
          <select
            value={draft.vehicleType}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                vehicleType: event.target.value,
              }))
            }
          >
            {reference.vehicleTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="records__field">
          <span>Hour</span>
          <input
            type="datetime-local"
            value={draft.recordedAt}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                recordedAt: event.target.value,
              }))
            }
            required
          />
        </label>

        <label className="records__field records__field--narrow">
          <span>Vehicles</span>
          <input
            type="number"
            min={0}
            step={1}
            value={draft.vehicleCount}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                vehicleCount: event.target.value,
              }))
            }
            required
          />
        </label>

        <label className="records__field records__field--narrow">
          <span>Speed km/h</span>
          <input
            type="number"
            min={1}
            max={300}
            step="0.1"
            value={draft.avgSpeedKph}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                avgSpeedKph: event.target.value,
              }))
            }
            required
          />
        </label>

        <Button type="submit" disabled={mutations.create.isPending}>
          {mutations.create.isPending ? 'Adding…' : 'Add observation'}
        </Button>
      </form>

      {pendingError ? (
        <p className="records__error" role="alert">
          {pendingError.message}
        </p>
      ) : null}

      <div className="records__scroll">
        <table className="records__table">
          <caption className="records__caption">
            {`Showing ${records.length} of ${formatNumber(total)} matching observations, newest first`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Hour (UTC)</th>
              <th scope="col">Country</th>
              <th scope="col">Vehicle</th>
              <th scope="col" className="records__num">
                Vehicles
              </th>
              <th scope="col" className="records__num">
                Speed
              </th>
              <th scope="col">
                <span className="records__sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatTimestamp(record.recordedAt)}</td>
                <td>{record.countryName}</td>
                <td>{record.vehicleTypeLabel}</td>
                <td className="records__num">
                  {editingId === record.id ? (
                    <input
                      className="records__inline-input"
                      type="number"
                      min={0}
                      value={editValue}
                      autoFocus
                      onChange={(event) => setEditValue(event.target.value)}
                      onBlur={() => commitEdit(record.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitEdit(record.id)
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                      aria-label={`Vehicle count for ${record.countryName} ${record.vehicleTypeLabel}`}
                    />
                  ) : (
                    <button
                      type="button"
                      className="records__edit-trigger"
                      onClick={() => startEditing(record)}
                    >
                      {formatNumber(record.vehicleCount)}
                    </button>
                  )}
                </td>
                <td className="records__num">
                  {formatSpeed(record.avgSpeedKph)}
                </td>
                <td>
                  <Button
                    variant="danger"
                    onClick={() => mutations.remove.mutate(record.id)}
                    disabled={mutations.remove.isPending}
                    aria-label={`Delete the ${record.vehicleTypeLabel} observation for ${record.countryName}`}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
