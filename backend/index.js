const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

/* ======================
   HARD ERROR LOGGING ✅ ADDED
====================== */
process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
  process.exit(1);
});

const app = express();

/* ======================
   GLOBAL MIDDLEWARE
====================== */
app.use(cors());
app.options("*", cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================
   DATABASE (SUPABASE)
   ✅ Hardened Pool
====================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5
});

/* ✅ TEST DB ON STARTUP (CRITICAL) */
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }
})();

/* ======================
   JWT AUTH MIDDLEWARE
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
   DB TEST
====================== */
app.get("/db-test", async (req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json(result.rows[0]);
});

/* ======================
   REGISTER
====================== */
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
    res.status(400).send("User already exists");
  }
});

/* ======================
   LOGIN
====================== */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );
  if (result.rows.length === 0)
    return res.status(400).send("Invalid credentials");

  const valid = await bcrypt.compare(
    password,
    result.rows[0].password_hash
  );
  if (!valid)
    return res.status(400).send("Invalid credentials");

  const token = jwt.sign(
    { userId: result.rows[0].id, email },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

/* ======================
   DASHBOARD (PROTECTED)
====================== */
app.get("/dashboard", authenticateToken, (req, res) => {
  res.json({ message: `Welcome ${req.user.email}` });
});

/* ======================
   FLIGHTS (SKYSCANNER)
   ✅ Uses built-in fetch (Node 22)
====================== */
app.get("/flights", async (req, res) => {
  const { from, to, date } = req.query;

  try {
    const response = await fetch(
      "https://skyscanner-api.p.rapidapi.com/v3/flights/live/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": process.env.SKYSCANNER_API_KEY,
          "X-RapidAPI-Host": "skyscanner-api.p.rapidapi.com"
        },
        body: JSON.stringify({
          originPlaceId: { iata: from },
          destinationPlaceId: { iata: to },
          departureDate: date,
          adults: 1,
          cabinClass: "ECONOMY"
        })
      }
    );

    res.json(await response.json());
  } catch (err) {
    console.error("Flights error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================
   STRIPE PAYMENT
====================== */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/create-payment-intent", authenticateToken, async (req, res) => {
  const intent = await stripe.paymentIntents.create({
    amount: 5000,
    currency: "usd",
    automatic_payment_methods: { enabled: true }
  });

  res.json({ clientSecret: intent.client_secret });
});

/* ======================
   SERVER
====================== */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("✅ Backend running on port", PORT);
});
