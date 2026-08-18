require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
  const url = process.env.DATABASE_URL.replace('&pgbouncer=true', '');
  const client = new Client({ connectionString: url });
  
  try {
    await client.connect();
    console.log("Connected to DB.");

    await client.query(`
      ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "title" TEXT;
      ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "toolCalls" JSONB;
      
      CREATE TABLE IF NOT EXISTS "Memory" (
          "id" TEXT NOT NULL,
          "workspaceId" TEXT NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'general',
          "content" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
      );

      DO $$ 
      BEGIN 
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Memory_workspaceId_idx') THEN 
              CREATE INDEX "Memory_workspaceId_idx" ON "Memory"("workspaceId"); 
          END IF; 
          
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Memory_category_idx') THEN 
              CREATE INDEX "Memory_category_idx" ON "Memory"("category"); 
          END IF; 
      END $$;

      DO $$ 
      BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Memory_workspaceId_fkey') THEN 
              ALTER TABLE "Memory" ADD CONSTRAINT "Memory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; 
          END IF; 
      END $$;
    `);
    
    console.log("Migration executed successfully!");

    // pgvector setup for long-term semantic memory
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await client.query(`ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS embedding vector(768);`);
    await client.query(`CREATE INDEX IF NOT EXISTS "Memory_embedding_idx" ON "Memory" USING hnsw (embedding vector_cosine_ops);`);
    console.log("pgvector memory setup complete.");
    
    // Check if the _prisma_migrations table needs to be spoofed? No, Prisma db push doesn't use migrations table.
    
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrate();
