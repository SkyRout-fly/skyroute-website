const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const Stripe = require("stripe");

const app = express();

/* ======================
   MIDDLEWARE
====================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================
   DATABASE (SUPABASE)
====================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ======================
   AUTH MIDDLEWARE (JWT)
====================== */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).send("No token");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Invalid token");
    req.user = user;
    next();
  });
}

/* ======================
   ROOT
====================== */
app.get("/", (req, res) => {
  res.send("SkyRoute API running");
});

/* ======================
   DATABASE TEST
====================== */
app.get("/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json(result.rows[0]);
});

/* ======================
   AUTH – REGISTER
====================== */
app.get("/register", (req, res) => {
  res.send(`
    <h2>Register</h2>
    <form method="POST" action="/register">
      <input name="email" type="email" placeholder="Email" required/><br/><br/>
      <input name="password" type="password" placeholder="Password" required/><br/><br/>
      <button>Register</button>
    </form>
  `);
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1,$2)",
      [email, hash]
    );
    res.send("✅ Registered successfully");
  } catch {
    res.status(400).send("User exists");
  }
});

/* ======================
   AUTH – LOGIN
====================== */
app.get("/login", (req, res) => {
  res.send(`
    <h2>Login</h2>
    <form method="POST" action="/login">
      <input name="email" type="email" required/><br/><br/>
      <input name="password" type="password" required/><br/><br/>
      <button>Login</button>
    </form>
  `);
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );
  if (result.rows.length === 0) return res.send("Invalid");

  const valid = await bcrypt.compare(
    password,
    result.rows[0].password_hash
  );
  if (!valid) return res.send("Invalid");

  const token = jwt.sign(
    { userId: result.rows[0].id, email },
    process.env.JWT_SECRET
  );

  res.send(`
    <p>✅ Logged in</p>
    <p>JWT Token (copy this):</p>
    <textarea rows="4" cols="80">${token}</textarea>
  `);
});

/* ======================
   DASHBOARD (PROTECTED)
====================== */
app.get("/dashboard", authenticateToken, (req, res) => {
  res.send(`
    <h2>Dashboard</h2>
    <p>Welcome ${req.user.email}</p>
  `);
});

/* ======================
   FLIGHT SEARCH (AMADEUS)
====================== */
async function getAmadeusToken() {
  const res = await fetch(
    "https://test.api.amadeus.com/v1/security/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        `grant_type=client_credentials&client_id=${process.env.AMADEUS_CLIENT_ID}&client_secret=${process.env.AMADEUS_CLIENT_SECRET}`
    }
  );
  const data = await res.json();
  return data.access_token;
}

app.get("/flights", async (req, res) => {
  const { from, to, date } = req.query;
  const token = await getAmadeusToken();

  const response = await fetch(
    `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${from}&destinationLocationCode=${to}&departureDate=${date}&adults=1`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  res.json(await response.json());
});

/* ======================
   BOOKINGS + PAYMENTS (STRIPE)
====================== */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/create-payment-intent", authenticateToken, async (req, res) => {
  const intent = await stripe.paymentIntents.create({
    amount: 5000,
    currency: "usd"
  });

  res.json({ clientSecret: intent.client_secret });
});

/* ======================
   SERVER (LAST)
====================== */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
