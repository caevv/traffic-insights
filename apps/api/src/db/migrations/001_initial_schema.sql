-- Traffic analytics core schema.
--
-- Shape: two small dimension tables and one large fact table. Every dashboard
-- read is `SUM(...) ... GROUP BY <dimension>`, which is exactly what this
-- layout is for — aggregation happens in Postgres, never in Node.
--
-- Grain of the fact table is one hour, per country, per vehicle type. Hourly
-- rather than daily because the hour is what makes the data interesting: rush
-- hour peaks, weekend troughs, and freight running against the commuter tide
-- all disappear the moment you average a day away.

CREATE TABLE countries (
    id       SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    iso_code CHAR(2)  NOT NULL UNIQUE,
    name     TEXT     NOT NULL,
    region   TEXT     NOT NULL,
    -- IANA zone, e.g. 'Europe/Berlin'. Lets `recorded_at AT TIME ZONE
    -- c.timezone` resolve true local time including DST, so an 08:00 peak in
    -- Berlin and in Tokyo land on the same bucket of the hour-of-day chart.
    timezone TEXT     NOT NULL,

    CONSTRAINT countries_iso_code_uppercase CHECK (iso_code = UPPER(iso_code))
);

COMMENT ON TABLE countries IS
    'ISO 3166-1 alpha-2 dimension for country-wise rollups.';

CREATE TABLE vehicle_types (
    id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,
    label      TEXT     NOT NULL,
    sort_order SMALLINT NOT NULL,

    CONSTRAINT vehicle_types_code_lowercase CHECK (code = LOWER(code))
);

COMMENT ON TABLE vehicle_types IS
    'Vehicle classification dimension (car, truck, bus, ...).';

CREATE TABLE traffic_records (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country_id      SMALLINT      NOT NULL REFERENCES countries (id) ON DELETE RESTRICT,
    vehicle_type_id SMALLINT      NOT NULL REFERENCES vehicle_types (id) ON DELETE RESTRICT,
    -- Truncated to the hour. Stored as timestamptz (UTC on the wire); local
    -- time is derived per country at query time, never stored.
    recorded_at     TIMESTAMPTZ   NOT NULL,
    vehicle_count   INTEGER       NOT NULL,
    avg_speed_kph   NUMERIC(5, 2) NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT traffic_records_vehicle_count_non_negative
        CHECK (vehicle_count >= 0),
    CONSTRAINT traffic_records_avg_speed_plausible
        CHECK (avg_speed_kph > 0 AND avg_speed_kph <= 300),
    CONSTRAINT traffic_records_recorded_on_the_hour
        CHECK (recorded_at = date_trunc('hour', recorded_at)),

    -- One observation per country x vehicle type x hour. This is the natural
    -- key: it makes ingestion idempotent (ON CONFLICT), rules out the
    -- double-count bug that silently inflates every chart, and gives the
    -- planner a uniqueness guarantee for free.
    CONSTRAINT traffic_records_natural_key
        UNIQUE (country_id, vehicle_type_id, recorded_at)
);

COMMENT ON TABLE traffic_records IS
    'Hourly vehicle counts per country and vehicle type. The fact table.';

-- Note: there is deliberately no `recorded_at <= now()` CHECK. now() is STABLE,
-- not IMMUTABLE, and a constraint built on it silently breaks dump/restore —
-- rows that were valid when written fail to reload later. "Not in the future"
-- is enforced in the API's request schema instead, where it belongs.

-- --------------------------------------------------------------------------
-- Indexes
--
-- Both dashboard aggregates filter on a `recorded_at` range and then group by
-- one dimension. Leading with `recorded_at` lets the range predicate drive the
-- scan; INCLUDE-ing the measures makes the index covering, so the aggregate
-- runs as an index-only scan that never touches the heap.
-- --------------------------------------------------------------------------

CREATE INDEX traffic_records_by_country_idx
    ON traffic_records (recorded_at, country_id)
    INCLUDE (vehicle_count, avg_speed_kph);

CREATE INDEX traffic_records_by_vehicle_type_idx
    ON traffic_records (recorded_at, vehicle_type_id)
    INCLUDE (vehicle_count, avg_speed_kph);

-- --------------------------------------------------------------------------
-- `updated_at` maintenance
--
-- Kept in the database rather than the application so that ANY writer — the
-- API, a migration, a human with psql — cannot forget it.
-- --------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER traffic_records_set_updated_at
    BEFORE UPDATE ON traffic_records
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
