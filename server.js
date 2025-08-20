const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

//cors setup
const cors = require('cors');
app.use(cors({
  origin: "https://immigration-frontend-ten.vercel.app", // later you can restrict to your frontend URL
  methods: ["GET", "POST"]
}));

// Set storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // store in /uploads folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // e.g. 1692212-123.png
  }
});
// Serve the uploads folder as static
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Middleware
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// ✅ Serve only safe static files
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/images', express.static(path.join(__dirname, 'images')));
//sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

// ✅ Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ✅ Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
// ✅ Blog Schema and Model
const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  date: { type: Date, default: Date.now }
});
const Blog = mongoose.model('Blog', blogSchema);

// ✅ Auth Middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.user === 'admin') return next();
  return res.redirect('/login');
}

// ✅ Routes
app.get('/', (req, res) => {
  res.send('<h1>Welcome</h1><a href="/login">Login</a>');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.user = username;
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/dashboard', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/add-blog', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'add-blog.html'));
});

app.post('/add-blog', requireLogin, async (req, res) => {
  const { title, content, image, date } = req.body;
  const blog = new Blog({
    title,
    content,
    imageUrl: image,
    date: date || new Date()
  });
  await blog.save();
  res.redirect('/dashboard');
});

// Ensure uploads folder exists
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer with file filter + size limit
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);
    if (extName && mimeType) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpg, jpeg, png, gif)"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB max
});

// Secure blog POST route
app.post('/api/blogs', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const blog = {
      title: req.body.title,
      content: req.body.content,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
      date: new Date()
    };

    blogs.unshift(blog);
    res.status(201).json(blog);
  });
});


app.get('/edit-blog/:id', requireLogin, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.send('Blog not found');

  const html = `
    <form action="/edit-blog/${blog._id}" method="POST">
      <input type="text" name="title" value="${blog.title}" required><br>
      <input type="text" name="image" value="${blog.imageUrl}" required><br>
      <input type="date" name="date" value="${blog.date.toISOString().split('T')[0]}" required><br>
      <textarea name="content" required>${blog.content}</textarea><br>
      <button type="submit">Update Blog</button>
    </form>`;
  res.send(html);
});

app.post('/edit-blog/:id', requireLogin, async (req, res) => {
  const { title, content, image, date } = req.body;
  await Blog.findByIdAndUpdate(req.params.id, {
    title,
    content,
    imageUrl: image,
    date: date || new Date()
  });
  res.redirect('/dashboard');
});

app.post('/delete-blog/:id', async (req, res) => {
  const blogId = req.params.id;
  try {
    await Blog.findByIdAndDelete(blogId);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).send('Failed to delete blog');
  }
});

app.get('/api/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ message: 'Could not load blogs' });
  }
});

//send-contactUsForm
//german page form
app.post('/send-contactUsForm', async (req, res) => {
  const { service, username, email, message } = req.body;

  const output = `
    <h3>Contact Us Page Enquiry!</h3>
    <p><strong>Service Choosen:</strong> ${service || 'Not specified'}</p>
    <p><strong>Name:</strong> ${username}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong> ${message || 'None'}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Contact Us Page Enquiry" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Contact Us Page enquiry',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).send('Email sent');
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).send('Error sending email. Please try again later.');
  }
});
// POST route to handle form submission
app.post('/send', async (req, res) => {
  const {
    username,
    email,
    message,
    'phone-number': phone,
    'country-code': code,
    language_lvl
  } = req.body;

  const output = `
    <h3>You have a new demo class request!</h3>
    <p><strong>Name:</strong> ${username}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> +${code} ${phone}</p>
    <p><strong>Selected Level:</strong> ${language_lvl || 'Not selected'}</p>
    <p><strong>Additional Message:</strong> ${message || 'None'}</p>
  `;

  try {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    let mailOptions = {
      from: `"Demo Class Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'New French Demo Class Booking',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent!');
    res.status(200).send('Email sent');
  } catch (error) {
    console.error('❌ Error sending email:', error);
    res.status(500).send('Error sending email. Please try again later.');
  }
});

//german page form
app.post('/send-indexG', async (req, res) => {
  const { level, name, email, message } = req.body;

  const output = `
    <h3>You have a new Course Inquiry!</h3>
    <p><strong>Course Type:</strong> ${level || 'Not specified'}</p>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong> ${message || 'None'}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Course Inquiry Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'German classes enquiry',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).send('Email sent');
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).send('Error sending email. Please try again later.');
  }
});

//Contact us page form
app.post('/send-contact', async (req, res) => {
  const { firstName, lastName, email, message, phoneNumber, countryCode } = req.body;

  const output = `
    <h3>New Contact Message Received</h3>
    <p><strong>Name:</strong> ${firstName} ${lastName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${countryCode} ${phoneNumber}</p>
    <p><strong>Message:</strong> ${message}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Website Contact Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Get in touch form from German Page',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Contact email sent!');
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('❌ Error sending contact form email:', error);
    res.status(500).send('Failed to send message');
  }
});


//german page form
app.post('/send-contactUs', async (req, res) => {
  const { level, name, email, message } = req.body;

  const output = `
    <h3>You have a new German Course Enquiry!</h3>
    <p><strong>German Courses Selected:</strong> ${level || 'Not specified'}</p>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong> ${message || 'None'}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Contact Us Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Germany Courses enquiry form',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).json({ success: false, message: 'Email sending failed.' });
  }
});

//German Book Now form
// POST route for form
app.post("/send-german-form", async (req, res) => {
  const { course, name, email, phone } = req.body;

  if (!course || !name || !email || !phone) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail", // or use custom SMTP
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.RECEIVER_EMAIL,
      subject: `New German Course Booking - ${course}`,
      html: `
        <h3>Course: ${course}</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, message: 'Email sending failed.' });
  }
});
//ielts demo page form
app.post('/send-ielts', async (req, res) => {
  const { name, email, phoneNumber } = req.body;

  const output = `
    <h3>You have a new Ielts Demo Class Enquiry</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone Number:</strong> ${phoneNumber}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Contact Us Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Ielts Demo Class Enquiry Form',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).json({ success: false, message: 'Email sending failed.' });
  }
});

//French reuire form
app.post('/send-frenchReq', async (req, res) => {
  const { name, email, phone, course, message } = req.body;

  const output = `
    <h3>You have a new French Class Enquiry</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Course Selected:</strong> ${course}</p>
    <p><strong>Phone Number:</strong> ${phone}</p>
    <p><strong>Message:</strong> ${message}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"French Enquire Form" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'French Enquiry Class Form',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).json({ success: false, message: 'Email sending failed.' });
  }
});


//Ielts coaching form
app.post('/send-ieltsCoaching', async (req, res) => {
  const { name, email, phone, course } = req.body;

  const output = `
    <h3>You have a new Ielts Class Enquiry</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Course Selected:</strong> ${course}</p>
    <p><strong>Phone Number:</strong> ${phone}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Ielts Coaching Form Option" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Ielts Coaching Form',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).json({ success: false, message: 'Email sending failed.' });
  }
});

//TOEFL PAGE FORM
app.post('/send-contactFormToefl', async (req, res) => {
  const {name, email, message, phone } = req.body;

  const output = `
    <h3>TOEFL Contact Us Enquiry!</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone Number:</strong> ${phone}</p>
    <p><strong>Message:</strong> ${message || 'None'}</p>
  `;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Toefl Page Enquiry" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Toefl Page enquiry',
      html: output,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ indexG Email sent!');
    res.status(200).send('Email sent');
  } catch (error) {
    console.error('❌ Error sending indexG email:', error);
    res.status(500).send('Error sending email. Please try again later.');
  }
});


// ✅ Start server once
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
