-- Highlights & Annotations Feature
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/evqsckxouvkdlxcvntvu/sql

-- 1. Create highlights table
CREATE TABLE IF NOT EXISTS highlights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id      text NOT NULL,

  -- Position anchoring (XPath + character offsets)
  xpath           text NOT NULL,
  start_offset    int NOT NULL,
  end_offset      int NOT NULL,

  -- Content
  selected_text   text NOT NULL,
  note            text,

  -- Sharing (null = private, populated = shareable)
  share_id        text UNIQUE,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_highlights_user_article
  ON highlights(user_id, article_id);

CREATE INDEX IF NOT EXISTS idx_highlights_share
  ON highlights(share_id)
  WHERE share_id IS NOT NULL;

-- 3. Enable Row Level Security
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Users can view their own highlights
CREATE POLICY "Users can view own highlights"
  ON highlights FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own highlights
CREATE POLICY "Users can create highlights"
  ON highlights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own highlights
CREATE POLICY "Users can update own highlights"
  ON highlights FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own highlights
CREATE POLICY "Users can delete own highlights"
  ON highlights FOR DELETE
  USING (auth.uid() = user_id);

-- Anyone can view shared highlights (by share_id)
CREATE POLICY "Public can view shared highlights"
  ON highlights FOR SELECT
  USING (share_id IS NOT NULL);

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_highlights_updated_at
  BEFORE UPDATE ON highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
