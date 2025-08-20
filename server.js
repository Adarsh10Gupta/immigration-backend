// server.js (full, paste-replace)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser'); // optional but explicit
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- Trust proxy (Render/Heroku style) ---------------- */
app.set('trust proxy', 1);

/* ---------------- CORS ----------------
   Adjust allowedOrigins to include every frontend origin that needs access.
*/
const allowedOrigins = [
  'https://immigration-frontend-ten.vercel.app',
  'https://immigration-frontend-dr23pg6wm-adarsh-guptas-projects-8d1322f2.vercel.app/'
];

app.use(cors({
  origin: ["https://immigration-frontend-ten.vercel.app"], // add all frontend URLs
  credentials: true, // important for cookies
}));
/* ---------------- Helmet (CSP) ----------------
   Allows fonts, blob scripts and remote images. Adjust as needed.
*/
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' data: blob:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:;"
  );
  next();
});

/* ---------------- Body parsers ---------------- */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------------- Sessions ---------------- */
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    httpOnly: true,
    secure: true,          // ✅ Required when frontend is HTTPS (Vercel)
    sameSite: "none",      // ✅ Allows cross-site cookie (Render <-> Vercel)
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

/* ---------------- Cloudinary + multer storage ----------------
   Make sure you set CLOUD_NAME, CLOUD_API_KEY, CLOUD_API_SECRET in Render env.
*/
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'blogs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});
const upload = multer({ storage });

/* ---------------- Static admin folder ----------------
   login.html and dashboard.html should be in ./admin
*/
app.use('/admin', express.static(path.join(__dirname, 'admin')));

/* ---------------- MongoDB ----------------
   Use MONGODB_URI in Render env.
*/
mongoose.connect(process.env.MONGODB_URI, {
  // options harmless for recent drivers
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

/* ---------------- Models ---------------- */
const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  imageUrl: String,
  date: { type: Date, default: Date.now }
});
const Blog = mongoose.model('Blog', blogSchema);

/* ---------------- Utilities ---------------- */
const PLACEHOLDER_IMG = 'https://res.cloudinary.com/demo/image/upload/w_800,h_450,c_fill,e_blur:200/sample.jpg';
function safeImageUrl(url) {
  if (!url) return PLACEHOLDER_IMG;
  if (/^https?:\/\//i.test(url)) return url;
  return PLACEHOLDER_IMG;
}

/* ---------------- Auth middleware ---------------- */
function requireLogin(req, res, next) {
  if (req.session && req.session.user === 'admin') return next();
  // If AJAX expects JSON, respond with 401 JSON
  const acceptsJSON = req.get('Accept') && req.get('Accept').includes('application/json');
  if (acceptsJSON || req.xhr) return res.status(401).json({ message: 'Unauthorized' });
  // Otherwise redirect to login page
  return res.redirect('/admin/login.html');
}

/* ---------------- Routes ---------------- */

// Root → redirect to admin login
app.get('/', (req, res) => res.redirect('/admin/login.html'));

// Serve admin login page explicitly (optional)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Login handler — supports both form POST and fetch requests.
// If request wants JSON, returns JSON { success, redirect } else does redirects.
app.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      const resp = { success: false, message: 'Missing credentials' };
      if (req.get('Accept') && req.get('Accept').includes('application/json')) return res.status(400).json(resp);
      return res.status(400).send('Missing credentials');
    }

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      req.session.user = 'admin';
      const resp = { success: true, redirect: '/dashboard' };
      if (req.get('Accept') && req.get('Accept').includes('application/json')) return res.json(resp);
      return res.redirect('/dashboard');
    }

    const resp = { success: false, message: 'Invalid credentials' };
    if (req.get('Accept') && req.get('Accept').includes('application/json')) return res.status(401).json(resp);
    return res.redirect('/admin/login.html');
  } catch (err) {
    console.error('Login error:', err);
    if (req.get('Accept') && req.get('Accept').includes('application/json')) return res.status(500).json({ success: false, message: 'Server error' });
    return res.status(500).send('Internal Server Error');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login.html');
  });
});

// Dashboard (protected)
app.get('/dashboard', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

/* ---------------- BLOG APIs ---------------- */

// GET all blogs (public)
app.get('/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 }).lean();
    const mapped = blogs.map(b => ({ ...b, imageUrl: safeImageUrl(b.imageUrl) }));
    return res.json(mapped);
  } catch (err) {
    console.error('Failed to fetch blogs:', err);
    return res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// Add blog (protected)
app.post('/add-blog', requireLogin, upload.single('image'), async (req, res) => {
  try {
    const { title, content, date } = req.body || {};
    const imageUrl = req.file ? req.file.path : (req.body.image || '');
    const blog = new Blog({ title, content, date, imageUrl });
    await blog.save();
    return res.json({ message: 'Blog added successfully!', blog });
  } catch (err) {
    console.error('Add blog error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Edit blog (protected)
app.post('/edit-blog/:id', requireLogin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const { title, content, date, image } = req.body || {};
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    blog.title = title;
    blog.content = content;
    blog.date = date;

    if (req.file) {
      blog.imageUrl = req.file.path;
    } else if (image) {
      blog.imageUrl = image;
    }

    await blog.save();
    return res.json({ message: 'Blog updated successfully!', blog });
  } catch (err) {
    console.error('Edit blog error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete blog (protected)
app.post('/delete-blog/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const blog = await Blog.findByIdAndDelete(id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // optional: delete Cloudinary asset if you stored public_id
    return res.json({ message: 'Blog deleted successfully!' });
  } catch (err) {
    console.error('Delete blog error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* ---------------- Email routes (unchanged) ----------------
   If you have many, keep them here. Using transporter defined above.
   Example (keep your existing ones)...
*/

// Ensure uploads dir exists (not really used now, Cloudinary used)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}




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
