const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

/* ✅ Middleware */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ✅ PostgreSQL (Supabase) connection */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ✅ Root route */
app.get("/", (req, res) => {
  res.send("SkyRoute API running");
});

/* ✅ Database test */
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ✅ REGISTER PAGE (browser) */
app.get("/register", (req, res) => {
  res.send(`
    <html>
      <body>
        <h2>Register</h2>
        <form method="POST" action="/register">
          <input name="email" type="email" placeholder="Email" required /><br/><br/>
          <input name="password" type="password" placeholder="Password" required /><br/><br/>
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
    res.send("✅ Registration successful");
  } catch {
    res.status(400).send("❌ User already exists");
  }
});

/* ✅ LOGIN PAGE (browser) */
app.get("/login", (req, res) => {
  res.send(`
    <html>
      <body>
        <h2>Login</h2>
        <form method="POST" action="/login">
          <input name="email" type="email" placeholder="Email" required /><br/><br/>
          <input name="password" type="password" placeholder="Password" required /><br/><br/>
          <button type="submit">Login</button>
        </form>
      </body>
    </html>
  `);
});

/* ✅ LOGIN API */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(400).send("Invalid credentials");
  }

  const valid = await bcrypt.compare(password, result.rows[0].password_hash);
  if (!valid) {
    return res.status(400).send("Invalid credentials");
  }

  const token = jwt.sign(
    { userId: result.rows[0].id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ success: true, token });
});

/* ✅ SERVER MUST ALWAYS BE LAST */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
``
