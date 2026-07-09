-- Bat le cœur du process Worker (voir WorkerCronService) à chaque tick, dans
-- une table à ligne unique. Nécessaire parce que l'API et le Worker sont
-- deux services Railway séparés, sans aucune communication directe : la
-- base de données est le seul canal partagé permettant à /health (process
-- API) de savoir si le process Worker tourne toujours.
CREATE TABLE worker_heartbeats (
    id TEXT PRIMARY KEY,
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
