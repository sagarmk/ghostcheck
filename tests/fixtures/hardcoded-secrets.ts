/**
 * Test fixture: Hardcoded Secrets (SEC-003)
 *
 * Contains hardcoded credentials, API keys, tokens, and passwords.
 * These are extremely common in AI-generated code where the LLM
 * uses example values that look like real secrets.
 *
 * Expected: Each secret should trigger SEC-003 with severity 'error'
 */

// Hardcoded API keys
const API_KEY = 'sk-1234567890abcdef1234567890abcdef';
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
const AWS_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const AWS_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

// Hardcoded passwords
const DB_PASSWORD = 'supersecretpassword123!';
const ADMIN_PASSWORD = 'admin123';
const ROOT_PASSWORD = 'password123';

// Hardcoded tokens
const JWT_SECRET = 'my-super-secret-jwt-signing-key-2024';
const GITHUB_TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
const SLACK_TOKEN = 'xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuv';

// Private keys embedded in code
const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWHF1P0FEeJ3...
-----END RSA PRIVATE KEY-----`;

// Connection strings with embedded credentials
const DATABASE_URL = 'postgresql://admin:secretpass123@db.example.com:5432/production';
const MONGO_URI = 'mongodb://root:mongopass@mongo.example.com:27017/mydb';
const REDIS_URL = 'redis://:redispassword@redis.example.com:6379';

// Secrets in object literals
const config = {
  apiKey: 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe',
  secret: 'my_application_secret_key_do_not_share',
  password: 'P@ssw0rd!2024',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
};

// Secrets in function parameters
function connectToDatabase(): void {
  const connection = {
    host: 'db.production.example.com',
    user: 'admin',
    password: 'prod_db_password_2024!',
    database: 'production',
  };
  void connection;
}

// Secrets in environment variable assignments (direct, not process.env)
const STRIPE_SECRET = 'sk_live_1234567890abcdefghijklmnop';

// Safe examples (should NOT trigger)
const SAFE_KEY = process.env['API_KEY'];            // From environment
const SAFE_PASSWORD = process.env['DB_PASSWORD'];   // From environment
const PLACEHOLDER = 'YOUR_API_KEY_HERE';            // Obvious placeholder
const EMPTY_SECRET = '';                             // Empty string

export {
  API_KEY, OPENAI_KEY, AWS_ACCESS_KEY, AWS_SECRET_KEY,
  DB_PASSWORD, ADMIN_PASSWORD, ROOT_PASSWORD,
  JWT_SECRET, GITHUB_TOKEN, SLACK_TOKEN,
  PRIVATE_KEY, DATABASE_URL, MONGO_URI, REDIS_URL,
  config, connectToDatabase, STRIPE_SECRET,
  SAFE_KEY, SAFE_PASSWORD, PLACEHOLDER, EMPTY_SECRET,
};
