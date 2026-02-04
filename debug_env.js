require('dotenv').config();
console.log("Checking Environment Variables...");
console.log("AIRTABLE_API_KEY exists:", !!process.env.AIRTABLE_API_KEY);
console.log("AIRTABLE_BASE_ID exists:", !!process.env.AIRTABLE_BASE_ID);
// Do not print secrets
if (process.env.AIRTABLE_API_KEY) console.log("Key length:", process.env.AIRTABLE_API_KEY.length);
console.log("Done.");
