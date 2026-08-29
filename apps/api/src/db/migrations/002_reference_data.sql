-- Dimension data.
--
-- This is part of the schema, not sample data. The API looks up every incoming
-- country and vehicleType here and rejects anything that isn't listed, and the
-- seed cross-joins these tables to build the fact table. Shipping them in a
-- migration means dev, CI and production all start the same.
--
-- ON CONFLICT DO NOTHING so the migration can run again safely.

INSERT INTO countries (iso_code, name, region, timezone) VALUES
    ('AE', 'United Arab Emirates', 'Middle East',   'Asia/Dubai'),
    ('AU', 'Australia',            'Oceania',       'Australia/Sydney'),
    ('BR', 'Brazil',               'South America', 'America/Sao_Paulo'),
    ('CA', 'Canada',               'North America', 'America/Toronto'),
    ('DE', 'Germany',              'Europe',        'Europe/Berlin'),
    ('ES', 'Spain',                'Europe',        'Europe/Madrid'),
    ('FR', 'France',               'Europe',        'Europe/Paris'),
    ('GB', 'United Kingdom',       'Europe',        'Europe/London'),
    ('IN', 'India',                'Asia',          'Asia/Kolkata'),
    ('JP', 'Japan',                'Asia',          'Asia/Tokyo'),
    ('KE', 'Kenya',                'Africa',        'Africa/Nairobi'),
    ('MX', 'Mexico',               'North America', 'America/Mexico_City'),
    ('NL', 'Netherlands',          'Europe',        'Europe/Amsterdam'),
    ('SG', 'Singapore',            'Asia',          'Asia/Singapore'),
    ('US', 'United States',        'North America', 'America/New_York'),
    ('ZA', 'South Africa',         'Africa',        'Africa/Johannesburg')
ON CONFLICT (iso_code) DO NOTHING;

INSERT INTO vehicle_types (code, label, sort_order) VALUES
    ('car',        'Car',        1),
    ('motorcycle', 'Motorcycle', 2),
    ('bus',        'Bus',        3),
    ('truck',      'Truck',      4),
    ('van',        'Van',        5),
    ('bicycle',    'Bicycle',    6)
ON CONFLICT (code) DO NOTHING;
