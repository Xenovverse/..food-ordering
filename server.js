"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const path = require("path");

// ─────────────────────────────────────────────
//  Setup
// ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// In-memory store
let orders = [];
let orderCounter = 1;

// ─────────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: "luxe-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
});
app.use(sessionMiddleware);

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────
//  Auth helpers
// ─────────────────────────────────────────────
const CREDENTIALS = { username: "Admin", password: "1234" };

const requireAuth = (req, res, next) => {
  if (req.session?.isAuthenticated) return next();
  res.status(401).json({ error: "Unauthorized" });
};

// ─────────────────────────────────────────────
//  REST Routes
// ─────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    req.session.isAuthenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/api/check-auth", (req, res) => {
  res.json({ authenticated: !!req.session?.isAuthenticated });
});

app.get("/api/orders", requireAuth, (req, res) => {
  res.json(orders);
});

// ─────────────────────────────────────────────
//  Socket.io
// ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Connected  ${socket.id}`);

  // Customer places an order
  socket.on("place-order", (orderData) => {
    const padded = String(orderCounter++).padStart(4, "0");
    const order = {
      id: `ORD-${padded}`,
      items: orderData.items || [],
      total: orderData.total || 0,
      paymentMethod: orderData.paymentMethod || "cash",
      note: orderData.note || "",
      status: "pending",
      timestamp: new Date().toISOString(),
    };

    orders.push(order);

    // Broadcast new order to all clients (cashier listens)
    io.emit("new-order", order);

    // Confirm back to the customer who placed it
    socket.emit("order-confirmed", order);

    console.log(
      `[ORDER] ${order.id} | ${order.paymentMethod.toUpperCase()} | Rp ${order.total.toLocaleString("id-ID")}`,
    );
  });

  // Cashier updates order status
  socket.on("update-status", ({ orderId, status }) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    order.status = status;
    io.emit("order-updated", order);
    console.log(`[STATUS] ${orderId} → ${status}`);
  });

  socket.on("disconnect", () => {
    console.log(`[-] Disconnected ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`\n  ◆ Luxe Ordering System`);
  console.log(`  ◆ Running on http://localhost:${PORT}`);
  console.log(`  ◆ Cashier: http://localhost:${PORT}/cashier.html\n`);
});
