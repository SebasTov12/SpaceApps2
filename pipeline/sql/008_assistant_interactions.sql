-- Auditable Groq assistant responses with the compact evidence snapshot used.
CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE IF NOT EXISTS analysis.assistant_interactions (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    model text NOT NULL,
    user_message text NOT NULL,
    answer text NOT NULL,
    context_snapshot jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS assistant_interactions_created_at_idx
    ON analysis.assistant_interactions (created_at DESC);

COMMENT ON TABLE analysis.assistant_interactions IS
    'Auditable SAROS assistant answers and the database evidence snapshot supplied to Groq; not model predictions.';
