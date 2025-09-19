import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "./schema";

config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

async function seed() {
  console.log("🌱 Seeding database...");

  // Create a demo user in Supabase Auth first
  const demoUserId = "00000000-0000-0000-0000-000000000001";
  const demoEmail = "demo@marketplace-watcher.com";
  const demoPassword = "demo123456"; // Simple password for demo

  console.log("🔐 Creating demo user in Supabase Auth...");

  // Create the auth user with the specific UUID
  await sql`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, recovery_sent_at, last_sign_in_at, 
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) 
    VALUES (
      '00000000-0000-0000-0000-000000000000', 
      ${demoUserId}::uuid, 
      'authenticated', 
      'authenticated', 
      ${demoEmail}, 
      crypt(${demoPassword}, gen_salt('bf')), 
      current_timestamp, 
      current_timestamp, 
      current_timestamp, 
      '{"provider":"email","providers":["email"]}'::jsonb, 
      '{}'::jsonb, 
      current_timestamp, 
      current_timestamp, 
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // Create the auth identity
  await sql`
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), 
      ${demoUserId}::uuid, 
      ${JSON.stringify({
        sub: demoUserId,
        email: demoEmail,
      })}::jsonb, 
      'email', 
      gen_random_uuid(), 
      current_timestamp, 
      current_timestamp, 
      current_timestamp
    )
    ON CONFLICT (provider, provider_id) DO NOTHING
  `;

  console.log("✅ Created demo user in Supabase Auth");

  // Create the application user record
  await db
    .insert(users)
    .values({
      id: demoUserId,
      phoneNumber: "+1234567890",
      email: demoEmail,
    })
    .onConflictDoNothing();

  console.log("✅ Created demo user in application database");

  console.log("✨ Database seeded successfully!");
  console.log("\n📧 Demo user credentials:");
  console.log(`Email: ${demoEmail}`);
  console.log(`Password: ${demoPassword}`);
}

seed()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });
