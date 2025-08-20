const express = require("express");
const path = require("path");
const router = express.Router();

// Middleware to protect routes
function requireLogin(req, res, next) {
  if (req.session && req.session.user === "admin") return next();
  return res.redirect("/login");
}

// Login page
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin", "login.html"));
});

// Handle login
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.user = "admin";
    return res.redirect("/dashboard");
  }
  res.redirect("/login");
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Dashboard (protected)
router.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "admin", "dashboard.html"));
});

module.exports = router;
