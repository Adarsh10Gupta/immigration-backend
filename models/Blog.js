const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Blog', blogSchema);
