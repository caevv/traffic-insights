-- Reference (dimension) data.
--
-- These rows are part of the schema contract, not sample data: the API resolves
-- every incoming `country`/`vehicleType` against them and rejects anything
-- unlisted, and the seed generator cross-joins them to build the fact table.
-- They ship in a migration so dev, CI and production start from an identical
-- dimension set.
--
-- ON CONFLICT DO NOTHING keeps the migration re-runnable.

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
