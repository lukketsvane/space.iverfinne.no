-- Enable UUID generation if it's not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create the folders table if it doesn't exist
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  description TEXT
);

-- Add an index on parent_id for faster lookups of folder contents, if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

-- Create the models table if it doesn't exist
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  model_url TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL
);

-- Add an index on folder_id for faster lookups of models within a folder, if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_models_folder_id ON models(folder_id);
