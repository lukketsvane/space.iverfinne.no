import { list } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

async function main() {
  console.log('--- Starting Model Recovery Process ---');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('ERROR: BLOB_READ_WRITE_TOKEN environment variable is not set.');
    return;
  }
  if (!process.env.POSTGRES_URL) {
    console.error('ERROR: POSTGRES_URL environment variable is not set.');
    return;
  }

  const sql = neon(process.env.POSTGRES_URL);

  try {
    // Ensure tables exist before trying to insert
    console.log('Verifying database tables exist...');
    await sql`
      CREATE TABLE IF NOT EXISTS folders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        description TEXT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS models (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        model_url TEXT NOT NULL,
        thumbnail_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        folder_id UUID REFERENCES folders(id) ON DELETE SET NULL
      );
    `;
     console.log('Database tables verified.');

    // 1. List all blobs from Vercel
    console.log('Fetching all files from Vercel Blob storage...');
    const { blobs } = await list({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    console.log(`Found ${blobs.length} total files in storage.`);

    // 2. Filter for .glb model files
    const modelBlobs = blobs.filter(
      (blob) => blob.pathname.endsWith('.glb') && !blob.pathname.startsWith('thumbnails/')
    );
    console.log(`Found ${modelBlobs.length} model files to recover.`);

    if (modelBlobs.length === 0) {
      console.log('No model files (.glb) found in Blob storage. Nothing to recover.');
      return;
    }

    // 3. Re-insert each model into the database
    let successCount = 0;
    let skippedCount = 0;

    for (const blob of modelBlobs) {
      const modelName = blob.pathname.replace(/\.glb$/, '').replace(/_/g, ' ');
      const modelUrl = blob.url;
      const thumbnailUrl = `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(modelName)}`;

      // Check if a model with this URL already exists to prevent duplicates
      const existing = await sql`SELECT id FROM models WHERE model_url = ${modelUrl}`;
      if (existing.length > 0) {
        console.log(`- Skipping already existing model: ${modelName}`);
        skippedCount++;
        continue;
      }

      console.log(`+ Recovering model: ${modelName}`);
      await sql`
        INSERT INTO models (name, model_url, thumbnail_url, folder_id)
        VALUES (${modelName}, ${modelUrl}, ${thumbnailUrl}, NULL)
      `;
      successCount++;
    }

    console.log('\n--- Recovery Complete ---');
    console.log(`✅ Successfully recovered ${successCount} models.`);
    console.log(`- Skipped ${skippedCount} already existing models.`);
    console.log('\nNext Steps:');
    console.log('1. Refresh your application in the browser.');
    console.log('2. Your models should now appear in the main "Assets" folder.');
    console.log('3. You will need to manually recreate your folders and move the models into them.');

  } catch (error) {
    console.error('\n--- An error occurred during the recovery process ---');
    console.error(error);
    console.error('\nPlease check your environment variables and database connection.');
  }
}

main();
