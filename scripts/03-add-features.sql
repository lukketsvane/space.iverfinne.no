-- Add is_public column to folders
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- Add is_public and view_settings columns to models
ALTER TABLE models ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE models ADD COLUMN IF NOT EXISTS view_settings JSONB;

-- Add indexes for is_public for potential filtering
CREATE INDEX IF NOT EXISTS idx_folders_is_public ON folders(is_public);
CREATE INDEX IF NOT EXISTS idx_models_is_public ON models(is_public);
