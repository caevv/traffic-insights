# Scaling from 5 to 50 to 500 RPS

This is the answer to the scalability question in the brief. I'd rather not
write the usual "add a load balancer and a cache" paragraph, so everything
below is tied to something you can find in this repo, and the numbers come
from a load test you can re-run yourself.

## Where the numbers come from

```bash
docker compose -f docker-compose.yml -f docker-compose.bench.yml up -d
npm run bench
```

The override file matters. At the normal rate limit of 300 requests a minute,
autocannon gets 429s in the first second and every number after that is the
limiter, not the app. My first run said 26,000 RPS with 100% non-2xx, which is
a nicely humbling result. The bench now checks for that up front and refuses
to run, and it fails if any scenario returns a 4xx or 5xx.

Measured on: Apple M5 Max, 18 cores, Docker Desktop with 18 CPUs and 16 GB,
Postgres 18.6 in a container, one API container, `PG_POOL_MAX=30`,
207,456 rows in `traffic_records` (46 MB with indexes).

A laptop is not production. What's useful here is the _shape_: which endpoints
are cheap, which are expensive, and by how much.

| Endpoint         | 10 conns | 50 conns | 100 conns | p99 @100 | MB/s |
| ---------------- | -------- | -------- | --------- | -------- | ---- |
| by-country (30d) | 582 rps  | 689 rps  | 705 rps   | 344 ms   | 1.7  |
| by-country (all) | 227 rps  | 248 rps  | 250 rps   | 570 ms   | 0.6  |
| by-vehicle-type  | 207 rps  | 242 rps  | 235 rps   | 605 ms   | 0.3  |
| summary          | 64 rps   | 83 rps   | 80 rps    | 2316 ms  | 0.1  |
| **by-hour**      | 63 rps   | 73 rps   | 65 rps    | 2257 ms  | 0.1  |
| **records (50)** | 24 rps   | 28 rps   | 25 rps    | 5876 ms  | 0.3  |
| by-country (304) | 196 rps  | 219 rps  | 213 rps   | 4511 ms  | 0.15 |

Three things stand out.

**The date filter does real work.** `by-country` over 30 days is 705 rps.
The same endpoint over all 90 days is 250. The dashboard defaults to 30 days
for that reason, not just because it looks tidier.

**`by-hour` and `records` are the two slow endpoints**, and both were
predictable from the SQL. More on each below.

**An ETag saves bandwidth, not database work.** I originally wrote in a
comment that a 304 costs "no body and no database query". Only half of that is
true. `@fastify/etag` hashes the serialised body in an `onSend` hook, so a
revalidation still runs the handler and still runs the query. The measurement
shows it: 213 rps for a 304 against 250 for a full 200, but 0.15 MB/s against
0.6. What actually removes load from the server is `max-age`, because then the
client doesn't send a request at all.

## Reading the table before the tiers

Worth being straight about what those numbers mean, because they don't all
clear every tier.

At **5 rps** everything is fine, with between 5x and 140x headroom depending
on the endpoint.

At **50 rps** on a single container, four endpoints clear it and two don't:
`records` at 24 rps and `by-hour` at 63 rps (which is close enough that a
p99 of 2.2 seconds makes it a no). That isn't an accident of the measurement,
it's the reason those two get their own sections below. Both would clear 50
comfortably behind a cache, and both have a real fix.

At **500 rps** nothing clears it on one container, which is the point of the
third tier.

## 5 RPS

Everything in the repo today handles this, and the foundations matter more
than the throughput.

At this tier the interesting question isn't throughput, it's whether the
foundations are the kind you can build on. The ones that matter later:

- **Aggregation happens in Postgres.** Every chart is one `GROUP BY` that
  returns at most as many rows as the dimension has members: 16 countries,
  6 vehicle types, 24 hours. Nothing streams the fact table into Node. This is
  the single decision that makes the other tiers possible. Pulling 207k rows
  over the socket to `reduce()` them in JavaScript works fine at 5 rps and
  falls over at 50.
- **The API holds no state.** No sessions, no in-process cache, no sticky
  anything. So `deploy.replicas: N` is a valid scaling move rather than a
  source of weird bugs.
- **Config comes from the environment** and is validated at boot
  (`apps/api/src/config/env.ts`), so a replica with bad config crashes
  immediately instead of serving errors.
- **Clean shutdown** (`apps/api/src/server.ts`). On SIGTERM the server stops
  accepting connections, finishes in-flight requests, then drains the pool.
  Without this, every deploy and every scale-in drops live requests. You don't
  notice at one replica. You notice at ten.
- **A statement timeout** (`PG_STATEMENT_TIMEOUT_MS`, default 5s), so one bad
  query can't hold a pool connection forever.

## 50 RPS

Roughly 10x. Nothing needs rewriting, and most of the work is turning on
things that are already wired up.

### 1. Cache the aggregates (the big one)

The read endpoints already send `Cache-Control: public, max-age=60`
(`AGGREGATE_CACHE_MAX_AGE`). Dashboard traffic is overwhelmingly the same
handful of URLs, because the filter combinations people actually use are few
and the window start is rounded to the hour. Put a CDN or a reverse-proxy
cache in front and a large share of reads never reach the API at all.

The hour rounding is load-bearing here and easy to get wrong. See
`startOfHour` in `apps/web/src/features/traffic-dashboard/api/trafficApi.ts`.
A window built from a raw `Date.now()` changes every render, so every render
is a different URL, which misses the browser cache, the CDN, and TanStack
Query all at once. Rounding to the hour makes the URL stable for an hour, and
since the data is hourly, nothing is lost. There's a test for it.

### 2. More API replicas

`docker compose up --scale api=3`, or a `replicas` count in Kubernetes. The
process is stateless, so this is just arithmetic. Watch the pool though:
`PG_POOL_MAX` is **per instance**. Three replicas at 10 is 30 connections, and
Postgres defaults to `max_connections = 100`. Keep `replicas x PG_POOL_MAX`
comfortably under it.

### 3. Give the write path its own thinking

Writes invalidate every aggregate, so they're `no-store`. At this tier the
read/write ratio is still extreme (a dashboard reads constantly and writes
rarely), so this doesn't need solving yet. It's worth knowing it's there.

### 4. Fix the records endpoint

`records` is the slowest thing in the table at ~25 rps, and the `EXPLAIN`
says exactly why:

```
Limit          (actual time=80.803..80.808 rows=50)
  -> Sort      (actual time=80.802..80.804 rows=50)
    -> WindowAgg (actual time=49.693..59.207 rows=207456)   <-- all of them
      -> Hash Join (rows=207456)
        -> Seq Scan on traffic_records (rows=207456)
```

`COUNT(*) OVER ()` gives the unpaginated total from the same scan, which saves
a round trip, but it makes the query walk every matching row to return 50 of
them. Two fixes, in order of preference:

1. **Keyset pagination.** Order by `(recorded_at, id)` and pass the last seen
   pair as the cursor instead of an offset. Cost stops depending on how deep
   into the list you are. The tradeoff is no page numbers and no exact total.
2. **Approximate the total.** Keep offset pagination but take the count from
   `pg_class.reltuples` when unfiltered, or drop it to "50+ results".

This endpoint drives a support table, not a chart, so it's a good candidate
for deferring. It's the first thing I'd fix if traffic actually landed on it.

## 500 RPS

Another 10x. This is where the shape of the system has to change, not just its
size.

### 1. Pre-aggregate

`by-hour` is the slowest aggregate at ~65 rps, and it was predictable: it's
the one query that can't use the covering indexes, because it needs
`countries.timezone` to work out local time, so it has to join before
grouping. The plan confirms it:

```
GroupAggregate (actual time=62.244..72.837 rows=24)
  -> Sort (rows=207456)
       Sort Method: external merge  Disk: 3672kB     <-- sorting on disk
    -> Hash Join (rows=207456)
      -> Seq Scan on traffic_records (rows=207456)
```

It sorts 207k rows on disk to produce 24 numbers.

Compare that with the country query, which does use its covering index:

```
HashAggregate (actual time=8.756..8.759 rows=16)
  -> Index Only Scan using traffic_records_by_country_idx (rows=69120)
       Heap Fetches: 0                                <-- never touches the table
Execution Time: 8.822 ms
```

The fix is a rollup. I measured it rather than assuming:

```sql
CREATE MATERIALIZED VIEW traffic_by_local_hour AS
SELECT c.id AS country_id,
       t.vehicle_type_id,
       EXTRACT(HOUR FROM t.recorded_at AT TIME ZONE c.timezone)::int AS local_hour,
       date_trunc('day', t.recorded_at) AS day,
       SUM(t.vehicle_count)::bigint      AS vehicle_count,
       SUM(t.avg_speed_kph * t.vehicle_count) AS speed_weight
FROM traffic_records t
JOIN countries c ON c.id = t.country_id
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX ON traffic_by_local_hour
  (country_id, vehicle_type_id, local_hour, day);
```

Result: **72.8 ms to 11.5 ms, about 6x**.

The interesting part is that the rollup has exactly the same 207,456 rows. It
compresses nothing at this grain, because each source row already maps to one
local hour on one day. All of the speedup comes from the work it removes:
no join, no per-row `EXTRACT`, and `local_hour` is a plain integer column, so
Postgres hash-aggregates in memory and parallelises instead of sorting to
disk. I'd assumed the win would come from having fewer rows. It didn't.

Refreshing: `REFRESH MATERIALIZED VIEW CONCURRENTLY traffic_by_local_hour`
(the unique index is what allows `CONCURRENTLY`, which is why it's there).
Run it on a schedule, every 5 minutes or so. That makes the hour chart
eventually consistent, which is fine for a chart about 90 days of history and
not fine for the records table. Worth saying out loud in the UI.

**This is not in the repo.** It's dead weight until the load is real, and
`SELECT` against a stale view is a worse default than a correct query. The
DDL and the measurement are here so the decision is costed rather than
guessed, and switching is a one-line change in
`getTrafficByHour` in `apps/api/src/modules/traffic/traffic.repository.ts`.

### 2. PgBouncer

At this point replica count times pool size runs into `max_connections`.
PgBouncer in transaction mode lets many app connections share few Postgres
ones. Our queries are single-statement and don't use session state, so
transaction pooling is safe here. Prepared statements need care with older
PgBouncer versions.

### 3. Read replicas

Every endpoint on the dashboard is a read. Point them at a replica and keep
the primary for writes. Cheap to do because the read and write paths are
already separate functions in the repository, so this is a routing change and
not a refactor. It adds replication lag, which is the same eventual
consistency tradeoff as the rollup, so make the two choices together.

### 4. Partition the fact table

At 500 rps the dataset probably isn't 207k rows any more. `traffic_records`
partitioned by range on `recorded_at`, monthly, would mean:

- Range queries prune to the partitions they need.
- Dropping old data is `DROP TABLE` on a partition instead of a `DELETE`
  that leaves the table bloated and needing a vacuum.
- Indexes stay small enough to keep in cache.

The natural key already leads with the columns that make this work.

### 5. Watch the right things

Something has to tell you which of the above to do next. The pieces are
already there: `/health/ready` reports database latency, request logging is on
with `LOG_LEVEL` as the knob, and the bench gives a baseline to compare
against. The metrics I'd add first are pool wait time (how long a request
waits for a connection, which is the first thing to go bad) and per-endpoint
p99.

## Summary

| Tier    | What changes                                       | Already here?        |
| ------- | -------------------------------------------------- | -------------------- |
| 5 rps   | Aggregate in SQL, stateless API, clean shutdown    | Yes                  |
| 50 rps  | CDN on `max-age`, more replicas, keyset pagination | Headers yes, rest no |
| 500 rps | Rollups, PgBouncer, read replicas, partitioning    | No, and costed above |

The honest summary is that the first tier is done, the second is mostly
configuration, and the third is real work that shouldn't be started until
something measured says so.
