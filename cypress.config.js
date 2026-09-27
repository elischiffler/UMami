const { defineConfig } = require("cypress");
require("dotenv").config({ path: "./frontend/.env" });

module.exports = defineConfig({
   env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY:
         process.env.VITE_SUPABASE_ANON_KEY,
      TEST_EMAIL: process.env.TEST_EMAIL,
      TEST_PASSWORD: process.env.TEST_PASSWORD,
      TEST_RESTAURANT_NAME:
         process.env.TEST_RESTAURANT_NAME,
      TEST_BOOKMARK_RESTAURANT_NAME:
         process.env.TEST_BOOKMARK_RESTAURANT_NAME,
      TEST_FOLLOW_USER_NAME:
         process.env.TEST_FOLLOW_USER_NAME,
   },

   e2e: {
      baseUrl: "http://localhost:5173",
      setupNodeEvents(on, config) {},
   },
});
