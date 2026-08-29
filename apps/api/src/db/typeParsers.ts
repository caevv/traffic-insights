import pg from 'pg'

/**
 * Teach node-postgres how to hand us the types we actually want.
 *
 * This lives in its own module, apart from `pool.ts`, so the tests can register
 * the same parsers without importing `pool.ts` and constructing the production
 * pool as a side effect. Both call it, so the two can't drift.
 *
 * `setTypeParser` is global to the pg module, not per pool, so calling this
 * more than once is harmless.
 */
export function registerTypeParsers(): void {
  const { types } = pg

  // pg returns bigint and numeric as strings, because they can be bigger than a
  // JS number can hold. Our sums are vehicle counts, nowhere near that limit,
  // so we parse them here. Otherwise SUM() comes back as "48213" and the charts
  // get a string where they want a number.
  types.setTypeParser(types.builtins.INT8, (value) =>
    Number.parseInt(value, 10),
  )
  types.setTypeParser(types.builtins.NUMERIC, (value) =>
    Number.parseFloat(value),
  )

  // DATE would be parsed into a JS Date, which shifts the day if the process
  // runs outside UTC. A calendar date has no timezone, so keep the string.
  types.setTypeParser(types.builtins.DATE, (value) => value)
}
