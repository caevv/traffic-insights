-- Build a realistic hourly traffic dataset.
--
-- $1 :: int, days of history to make, ending at the current hour.
--
-- Postgres builds the whole thing in one statement. Nothing is generated in
-- Node and pushed over the wire. That's 16 countries x 6 vehicle types x 24
-- hours x 90 days, about 207k rows, and sending those through the driver would
-- be much slower than letting the database cross-join them in place.
--
-- The numbers are made up but not random. We model four things so the charts
-- show real shapes you can sanity check, not just noise:
--
--   1. Commuters. Two peaks, around 08:00 and 17:30 local time.
--   2. Freight. Flatter, runs overnight, goes against the commuter flow.
--   3. Weekends. Cars and trucks drop, bikes go up.
--   4. Congestion. Speed drops as volume rises.
--
-- local_hour comes from `AT TIME ZONE c.timezone`, so peaks line up across
-- zones and Postgres handles DST for us.

WITH params AS (
    SELECT
        date_trunc('hour', now()) - make_interval(days => $1::int) AS start_at,
        date_trunc('hour', now())                                  AS end_at
),

-- Rough hourly volume per country. Follows road network size more than
-- population. Singapore is small but dense, Kenya is big but has fewer cars.
country_weight (iso_code, weight) AS (
    VALUES
        ('US', 1.00), ('IN', 0.94), ('BR', 0.66), ('JP', 0.62),
        ('DE', 0.58), ('GB', 0.51), ('FR', 0.49), ('MX', 0.47),
        ('CA', 0.38), ('ES', 0.36), ('AU', 0.31), ('ZA', 0.27),
        ('NL', 0.24), ('AE', 0.21), ('SG', 0.17), ('KE', 0.15)
),

-- share          : how much of all traffic this type is
-- commuter_bias  : 1.0 = full commuter pattern, 0.0 = full freight pattern
-- weekend_factor : multiplier for Saturday and Sunday
-- base_speed     : average speed with an empty road, km/h
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
        -- Two commuter peaks and a small lunch bump, over a quiet night.
        (
            0.16
            + 0.95 * exp(-power(local_hour -  8.0, 2) / 4.5)
            + 1.00 * exp(-power(local_hour - 17.5, 2) / 6.0)
            + 0.30 * exp(-power(local_hour - 12.5, 2) / 9.0)
        ) AS commuter_shape,
        -- Freight: flat through the day, busier overnight.
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
        -- Mix the two patterns based on how commuter-like the vehicle is.
        (commuter_shape * commuter_bias + freight_shape * (1 - commuter_bias)) AS shape,
        weight,
        share,
        CASE WHEN local_dow >= 6 THEN weekend_factor ELSE 1.0 END AS weekend,
        -- Slight growth over the window so there is a trend to see.
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
    -- Speed drops as volume rises. Clamped so the CHECK constraint
    -- (0 < speed <= 300) can never fail.
    round(
        LEAST(
            300.0,
            GREATEST(5.0, base_speed * (1.30 - 0.42 * LEAST(shape, 2.0) / 2.0) * speed_noise)
        )::numeric,
        2
    ) AS avg_speed_kph
FROM modelled
-- Running this again just fills in the missing hours. It won't fail and it
-- won't double count. The natural key handles that.
ON CONFLICT (country_id, vehicle_type_id, recorded_at) DO NOTHING;
