const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ✅ PostgreSQL (Supabase) connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Supabase
});

// ✅ Root route (Render health check)
app.get("/", (req, res) => {
  res.send("SkyRoute API running");
});

// ✅ Database connection test route
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      success: true,
      time: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ Start server (Render requires process.env.PORT)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
