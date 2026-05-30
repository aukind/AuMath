-- Single-row global counter
CREATE TABLE IF NOT EXISTS site_statistics (
  id   INT     PRIMARY KEY DEFAULT 1,
  total_views BIGINT  NOT NULL    DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO site_statistics (id, total_views)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Atomic increment: runs as table owner, so anon can't manipulate the value directly
CREATE OR REPLACE FUNCTION increment_site_views()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count BIGINT;
BEGIN
  UPDATE site_statistics
  SET    total_views = total_views + 1
  WHERE  id = 1
  RETURNING total_views INTO new_count;
  RETURN new_count;
END;
$$;

-- RLS: anyone can read, no one can write directly
ALTER TABLE site_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read site_statistics"
  ON site_statistics
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anon & authenticated to call the RPC (write goes through SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION increment_site_views() TO anon, authenticated;
