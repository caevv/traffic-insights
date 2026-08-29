import { describe, expect, it } from 'vitest'
import { buildTrafficFilter } from '../../src/modules/traffic/traffic.sql.ts'

/**
 * The filter builder is the one piece of SQL assembled at runtime, so it is
 * also the one place an injection could be introduced. These tests pin the
 * invariant that keeps it safe: values NEVER reach the SQL string — only
 * `$n` placeholders do.
 */
describe('buildTrafficFilter', () => {
  it('emits no WHERE clause when nothing is filtered', () => {
    const { clause, values } = buildTrafficFilter({})

    expect(clause).toBe('')
    expect(values).toEqual([])
  })

  it('numbers placeholders in the same order as the values array', () => {
    const from = new Date('2024-01-01T00:00:00Z')
    const to = new Date('2024-02-01T00:00:00Z')

    const { clause, values } = buildTrafficFilter({
      from,
      to,
      countries: ['DE'],
      vehicleTypes: ['car'],
    })

    expect(clause).toContain('t.recorded_at >= $1')
    expect(clause).toContain('t.recorded_at < $2')
    expect(clause).toContain('iso_code = ANY ($3)')
    expect(clause).toContain('code = ANY ($4)')
    expect(values).toEqual([from, to, ['DE'], ['car']])
  })

  it('uses a half-open range: >= from, < to', () => {
    const { clause } = buildTrafficFilter({
      from: new Date('2024-01-01T00:00:00Z'),
      to: new Date('2024-01-02T00:00:00Z'),
    })

    // `BETWEEN` would include both endpoints, double-counting the boundary
    // hour whenever two adjacent windows are compared.
    expect(clause).not.toContain('BETWEEN')
    expect(clause).toContain('>=')
    expect(clause).toContain('<')
  })

  it('continues placeholder numbering from startIndex', () => {
    // Callers that append LIMIT/OFFSET need to know where to resume.
    const { clause, nextIndex } = buildTrafficFilter({ countries: ['DE'] }, 4)

    expect(clause).toContain('$5')
    expect(nextIndex).toBe(5)
  })

  it('never interpolates a filter value into the SQL text', () => {
    const hostile = "DE'; DROP TABLE traffic_records; --"

    const { clause, values } = buildTrafficFilter({
      countries: [hostile],
      vehicleTypes: [hostile],
    })

    expect(clause).not.toContain(hostile)
    expect(clause).not.toContain('DROP')
    // The string travels as a bound parameter, where it is data, not syntax.
    expect(values).toEqual([[hostile], [hostile]])
  })

  it('ignores empty code lists rather than emitting `= ANY (ARRAY[])`', () => {
    // An empty array would match nothing and silently blank the dashboard;
    // "no selection" must mean "no filter".
    const { clause, values } = buildTrafficFilter({
      countries: [],
      vehicleTypes: [],
    })

    expect(clause).toBe('')
    expect(values).toEqual([])
  })
})
