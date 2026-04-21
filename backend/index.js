const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

/* ✅ Middleware */
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // REQUIRED for HTML forms

/* ✅ PostgreSQL (Supabase) connection */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ✅ Root route */
app.get("/", (req, res) => {
  res.send("SkyRoute API running");
});

/* ✅ Database test route */
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ✅ REGISTER PAGE (Browser View) */
app.get("/register", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SkyRoute - Register</title>
      <meta charset="UTF-8"/>
    </head>
    <body>
      <h2>Register</h2>
      <form method="POST" action="/register">
        <label>Email:</label><br/>
        <input type="email" name="email" required/><br/><br/>
        <label>Password:</label><br/>
        <input type="password" name="password" required/><br/><br/>
        <button type="submit">Register</button>
      </form>
    </body>
    </html>
  `);
});

/* ✅ REGISTER API */
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Email and password required");
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2)",
      [email, hash]
    );

    res.send("✅ Registration successful. You can now log in.");
  } catch (err) {
    res.status(400).send("❌ User already exists");
  }
});

/* ✅ LOGIN API */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ success: true, token });
});

/* ✅ Start server (Render compatible) */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
/* ✅ LOGIN PAGE (Browser View) */
app.get("/login", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SkyRoute - Login</title>
      <meta charset="UTF-8"/>
    </head>
    <body>
      <h2>Login</h2>
      <form method="POST" action="/login">
        <label>Email:</label><br/>
        <input type="email" name="email" required/><br/><br/>
        <label>Password:</label><br/>
        <input type="password" name="password" required/><br/><br/>
        <button type="submit">Login</button>
      </form>
    </body>
    </html>
  `);
});

