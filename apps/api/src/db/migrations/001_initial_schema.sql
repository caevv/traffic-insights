-- Core schema.
--
-- Two small dimension tables and one big fact table. Every chart is a
-- SUM(...) GROUP BY <something>, which is what this shape is for. The
-- aggregation happens in Postgres, not in Node.
--
-- The fact table is hourly, not daily. The hour is what makes the data
-- interesting: rush hour peaks, quiet weekends, trucks running at night. All
-- of that disappears if you average a whole day.

CREATE TABLE countries (
    id       SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    iso_code CHAR(2)  NOT NULL UNIQUE,
    name     TEXT     NOT NULL,
    region   TEXT     NOT NULL,
    -- IANA zone like 'Europe/Berlin'. Lets us do
    -- `recorded_at AT TIME ZONE c.timezone` and get real local time, DST
    -- included, so 08:00 in Berlin and 08:00 in Tokyo land in the same bucket.
    timezone TEXT     NOT NULL,

    CONSTRAINT countries_iso_code_uppercase CHECK (iso_code = UPPER(iso_code))
);

COMMENT ON TABLE countries IS 'Country dimension, ISO 3166-1 alpha-2.';

CREATE TABLE vehicle_types (
    id         SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,
    label      TEXT     NOT NULL,
    sort_order SMALLINT NOT NULL,

    CONSTRAINT vehicle_types_code_lowercase CHECK (code = LOWER(code))
);

COMMENT ON TABLE vehicle_types IS 'Vehicle dimension (car, truck, bus, ...).';

CREATE TABLE traffic_records (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    country_id      SMALLINT      NOT NULL REFERENCES countries (id) ON DELETE RESTRICT,
    vehicle_type_id SMALLINT      NOT NULL REFERENCES vehicle_types (id) ON DELETE RESTRICT,
    -- Always on the hour. Stored as UTC; local time is worked out per country
    -- at query time, never stored.
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

    -- One row per country + vehicle type + hour. This is the natural key. It
    -- makes loading data repeatable (ON CONFLICT) and rules out the
    -- double-counting bug that would quietly inflate every chart.
    CONSTRAINT traffic_records_natural_key
        UNIQUE (country_id, vehicle_type_id, recorded_at)
);

COMMENT ON TABLE traffic_records IS
    'Hourly vehicle counts per country and vehicle type. The fact table.';

-- No `recorded_at <= now()` CHECK on purpose. now() is STABLE, not IMMUTABLE,
-- and a constraint built on it breaks dump and restore later: rows that were
-- fine when written fail to load back. That rule lives in the API schema.

-- --------------------------------------------------------------------------
-- Indexes
--
-- Both chart queries filter on a recorded_at range and then group by one
-- dimension. recorded_at goes first so the range drives the scan, and the
-- measures are INCLUDEd so the index covers the query. That gives an
-- index-only scan that never reads the table.
-- --------------------------------------------------------------------------

CREATE INDEX traffic_records_by_country_idx
    ON traffic_records (recorded_at, country_id)
    INCLUDE (vehicle_count, avg_speed_kph);

CREATE INDEX traffic_records_by_vehicle_type_idx
    ON traffic_records (recorded_at, vehicle_type_id)
    INCLUDE (vehicle_count, avg_speed_kph);

-- --------------------------------------------------------------------------
-- updated_at
--
-- Done in the database, not the app, so nobody can forget it. Not the API,
-- not a migration, not someone poking around in psql.
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
