import type pg from 'pg'
import { insertRecords } from './database.ts'

/**
 * A tiny dataset you can check in your head.
 *
 * Four rows, picked so every number below can be worked out by hand, and so a
 * WRONG implementation gives a clearly different answer, not a slightly off
 * one.
 *
 *   Country  Vehicle  Recorded (UTC)      Vehicles  Speed km/h
 *   -------  -------  ------------------  --------  ----------
 *   DE       car      2024-01-15 08:00Z        100       50.00
 *   DE       car      2024-01-15 09:00Z        300       30.00
 *   DE       truck    2024-01-15 08:00Z        100       80.00
 *   FR       car      2024-01-16 08:00Z        200       60.00
 *
 * January on purpose: Berlin and Paris are both UTC+1 then, so the expected
 * local hours are clear and summer time can't confuse them.
 */
export const FIXTURE_RECORDS = [
  {
    country: 'DE',
    vehicleType: 'car',
    recordedAt: '2024-01-15T08:00:00Z',
    vehicleCount: 100,
    avgSpeedKph: 50,
  },
  {
    country: 'DE',
    vehicleType: 'car',
    recordedAt: '2024-01-15T09:00:00Z',
    vehicleCount: 300,
    avgSpeedKph: 30,
  },
  {
    country: 'DE',
    vehicleType: 'truck',
    recordedAt: '2024-01-15T08:00:00Z',
    vehicleCount: 100,
    avgSpeedKph: 80,
  },
  {
    country: 'FR',
    vehicleType: 'car',
    recordedAt: '2024-01-16T08:00:00Z',
    vehicleCount: 200,
    avgSpeedKph: 60,
  },
] as const

/** All rows sit inside this window. Use it to test range filtering. */
export const FIXTURE_WINDOW = {
  from: '2024-01-01T00:00:00Z',
  to: '2024-02-01T00:00:00Z',
} as const

export const EXPECTED = {
  totalVehicles: 700, // 100 + 300 + 100 + 200

  germany: {
    vehicles: 500, // 100 + 300 + 100
    /**
     * Weighted: (100x50 + 300x30 + 100x80) / 500
     *         = (5000 + 9000 + 8000) / 500 = 22000 / 500 = 44.0
     *
     * Unweighted, the average of the three hourly numbers is
     * (50 + 30 + 80) / 3 = 53.3. Far enough apart that the test really tells
     * the two apart.
     */
    weightedSpeed: 44,
  },

  france: { vehicles: 200, weightedSpeed: 60 },

  cars: {
    vehicles: 600, // 100 + 300 + 200
    share: 600 / 700, // ≈ 0.857143
  },
  trucks: {
    vehicles: 100,
    share: 100 / 700, // ≈ 0.142857
  },

  /**
   * Local hour buckets. Berlin and Paris are UTC+1 in January, so every 08:00Z
   * row goes to local hour 9 and the 09:00Z row goes to hour 10.
   *
   *   local 09 -> DE car 100 + DE truck 100 + FR car 200 = 400
   *   local 10 -> DE car 300                             = 300
   *
   * By UTC hour you'd get 8 -> 400 and 9 -> 300 instead, so this test fails
   * loudly if the timezone conversion ever goes away.
   */
  localHours: [
    { hour: 9, vehicleCount: 400 },
    { hour: 10, vehicleCount: 300 },
  ],
} as const

export async function seedFixtures(pool: pg.Pool): Promise<void> {
  await insertRecords(pool, [...FIXTURE_RECORDS])
}
