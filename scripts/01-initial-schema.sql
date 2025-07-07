-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist to ensure a clean slate
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS folders;

-- Create the folders table
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add an index on parent_id for faster lookups of folder contents
CREATE INDEX idx_folders_parent_id ON folders(parent_id);

-- Create the models table
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  model_url TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL
);

-- Add an index on folder_id for faster lookups of models within a folder
CREATE INDEX idx_models_folder_id ON models(folder_id);
