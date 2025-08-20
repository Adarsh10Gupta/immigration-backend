const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Blog schema
const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  date: { type: Date, default: Date.now },
});
const Blog = mongoose.model("Blog", blogSchema);

// Middleware for auth
function requireLogin(req, res, next) {
  if (req.session && req.session.user === "admin") return next();
  return res.redirect("/login");
}

// Add blog
router.post("/add-blog", requireLogin, async (req, res) => {
  const { title, content, image, date } = req.body;
  const blog = new Blog({ title, content, imageUrl: image, date: date || new Date() });
  await blog.save();
  res.redirect("/dashboard");
});

// Edit blog
router.post("/edit-blog/:id", requireLogin, async (req, res) => {
  const { title, content, image, date } = req.body;
  await Blog.findByIdAndUpdate(req.params.id, { title, content, imageUrl: image, date });
  res.redirect("/dashboard");
});

// Delete blog
router.post("/delete-blog/:id", requireLogin, async (req, res) => {
  await Blog.findByIdAndDelete(req.params.id);
  res.redirect("/dashboard");
});

// Get blogs (frontend consumption)
router.get("/api/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: "Error loading blogs" });
  }
});

module.exports = router;
