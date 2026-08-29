-- Generate a realistic hourly traffic dataset.
--
-- $1 :: int — days of history to generate, ending at the current hour.
--
-- The whole dataset is built by Postgres in one statement. Nothing is
-- generated in Node and shipped over the wire: 16 countries x 6 vehicle types
-- x 24 hours x N days is ~207k rows at the default 90 days, and round-tripping
-- those through the driver would take orders of magnitude longer than letting
-- the database cross-join them in place.
--
-- The numbers are synthetic but not arbitrary. Four effects are modelled so the
-- charts show structure a reviewer can sanity-check rather than uniform noise:
--
--   1. Commuter rhythm  — twin peaks around 08:00 and 17:30 LOCAL time.
--   2. Freight rhythm   — flatter, running overnight, against the commuter tide.
--   3. Weekend effect   — cars and freight fall, bicycles and motorcycles rise.
--   4. Congestion       — average speed falls as volume rises.
--
-- `local_hour` is derived per country via `AT TIME ZONE c.timezone`, so peaks
-- align across zones and DST is handled by Postgres' own tz database.

WITH params AS (
    SELECT
        date_trunc('hour', now()) - make_interval(days => $1::int) AS start_at,
        date_trunc('hour', now())                                  AS end_at
),

-- Relative hourly volume per country. Loosely tracks road-network scale, not
-- population: Singapore is small but dense, Kenya large but less motorised.
country_weight (iso_code, weight) AS (
    VALUES
        ('US', 1.00), ('IN', 0.94), ('BR', 0.66), ('JP', 0.62),
        ('DE', 0.58), ('GB', 0.51), ('FR', 0.49), ('MX', 0.47),
        ('CA', 0.38), ('ES', 0.36), ('AU', 0.31), ('ZA', 0.27),
        ('NL', 0.24), ('AE', 0.21), ('SG', 0.17), ('KE', 0.15)
),

-- share          : fraction of all vehicles on the road
-- commuter_bias  : 1.0 = pure commuter rhythm, 0.0 = pure freight rhythm
-- weekend_factor : multiplier applied Saturday and Sunday
-- base_speed     : free-flow average speed in km/h
vehicle_profile (code, share, commuter_bias, weekend_factor, base_speed) AS (
    VALUES
        ('car',        0.47, 1.00, 0.72,  64.0),
        ('motorcycle', 0.13, 0.85, 1.15,  58.0),
        ('bus',        0.07, 0.90, 0.55,  38.0),
        ('truck',      0.16, 0.10, 0.34,  76.0),
        ('van',        0.12, 0.45, 0.48,  61.0),
        ('bicycle',    0.05, 0.95, 1.45,  17.0)
),

grid AS (
    SELECT
        c.id                                                        AS country_id,
        v.id                                                        AS vehicle_type_id,
        g.recorded_at,
        cw.weight,
        vp.share,
        vp.commuter_bias,
        vp.weekend_factor,
        vp.base_speed,
        EXTRACT(HOUR  FROM g.recorded_at AT TIME ZONE c.timezone)::float8 AS local_hour,
        EXTRACT(ISODOW FROM g.recorded_at AT TIME ZONE c.timezone)::int   AS local_dow,
        -- 0.0 at the start of the window, 1.0 at the end.
        EXTRACT(EPOCH FROM g.recorded_at - p.start_at)::float8
            / NULLIF(EXTRACT(EPOCH FROM p.end_at - p.start_at)::float8, 0) AS progress
    FROM params p
    CROSS JOIN LATERAL generate_series(p.start_at, p.end_at, interval '1 hour') AS g (recorded_at)
    CROSS JOIN countries c
    JOIN country_weight cw ON cw.iso_code = c.iso_code
    CROSS JOIN vehicle_types v
    JOIN vehicle_profile vp ON vp.code = v.code
),

shaped AS (
    SELECT
        country_id,
        vehicle_type_id,
        recorded_at,
        share,
        weekend_factor,
        base_speed,
        weight,
        local_dow,
        progress,
        -- Twin commuter peaks plus a lunchtime bump, on a low overnight floor.
        (
            0.16
            + 0.95 * exp(-power(local_hour -  8.0, 2) / 4.5)
            + 1.00 * exp(-power(local_hour - 17.5, 2) / 6.0)
            + 0.30 * exp(-power(local_hour - 12.5, 2) / 9.0)
        ) AS commuter_shape,
        -- Freight: broad daytime plateau with a pronounced overnight run.
        (
            0.52
            + 0.46 * exp(-power(local_hour - 22.5, 2) / 22.0)
            + 0.38 * exp(-power(local_hour - 10.0, 2) / 26.0)
        ) AS freight_shape,
        commuter_bias
    FROM grid
),

modelled AS (
    SELECT
        country_id,
        vehicle_type_id,
        recorded_at,
        base_speed,
        -- Blend the two rhythms according to how commuter-like the vehicle is.
        (commuter_shape * commuter_bias + freight_shape * (1 - commuter_bias)) AS shape,
        weight,
        share,
        CASE WHEN local_dow >= 6 THEN weekend_factor ELSE 1.0 END AS weekend,
        -- Mild secular growth across the window, so the trend line has a slope.
        (1.0 + 0.14 * progress)                                   AS trend,
        (0.88 + random() * 0.24)                                  AS noise,
        (0.97 + random() * 0.06)                                  AS speed_noise
    FROM shaped
)

INSERT INTO traffic_records
    (country_id, vehicle_type_id, recorded_at, vehicle_count, avg_speed_kph)
SELECT
    country_id,
    vehicle_type_id,
    recorded_at,
    GREATEST(
        0,
        round(4200 * weight * share * shape * weekend * trend * noise)
    )::int AS vehicle_count,
    -- Congestion: speed decays as the volume shape rises, floored so the
    -- CHECK constraint (0 < speed <= 300) can never be violated.
    round(
        LEAST(
            300.0,
            GREATEST(5.0, base_speed * (1.30 - 0.42 * LEAST(shape, 2.0) / 2.0) * speed_noise)
        )::numeric,
        2
    ) AS avg_speed_kph
FROM modelled
-- Idempotent: re-running the seed tops up missing hours instead of failing or
-- double counting. The natural key does the work.
ON CONFLICT (country_id, vehicle_type_id, recorded_at) DO NOTHING;
