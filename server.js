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


const upload = multer({ storage });

// Serve uploads folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const cors = require('cors');

const allowedOrigins = [
  'https://immigration-frontend-ten.vercel.app',
  'https://immigration-frontend-dr23pg6wm-adarsh-guptas-projects-8d1322f2.vercel.app'
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true); // allow non-browser requests like Postman
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

//cloudinary settings
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,       // Your Cloudinary cloud name
  api_key: process.env.CLOUD_API_KEY,       // Your Cloudinary API key
  api_secret: process.env.CLOUD_API_SECRET  // Your Cloudinary secret
});
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'blogs', // Cloudinary folder
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const parser = multer({ storage: storage });



// ✅ Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// ✅ Serve only safe static files
app.use('/images', express.static(path.join(__dirname, 'images')));
//sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
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

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});


// Fetch all blogs (used by frontend & dashboard)
// Fetch all blogs
app.get("/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 });
    console.log("Fetched blogs:", blogs.length);
    res.json(blogs);
  } catch (err) {
    console.error("Failed to fetch blogs:", err);
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});
// =================== ADD BLOG ===================
app.post('/add-blog', parser.single('image'), async (req, res) => {
  try {
    const { title, content, date } = req.body;
    const imageUrl = req.file ? req.file.path : '';

    const newBlog = new Blog({
      title,
      content,
      date,
      imageUrl
    });

    await newBlog.save();
    res.json({ message: 'Blog added successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Ensure uploads folder exists
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}




app.get('/edit-blog/:id', async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.send('Blog not found');

  const html = `
    <form action="/edit-blog/${blog._id}" method="POST">
      <input type="text" name="title" value="${blog.title}" required><br>
      <input type="hidden" name="image" value="${blog.imageUrl}" required><br>
      <input type="date" name="date" value="${blog.date.toISOString().split('T')[0]}" required><br>
      <textarea name="content" required>${blog.content}</textarea><br>
      <button type="submit">Update Blog</button>
    </form>`;
  res.send(html);
});

// =================== EDIT BLOG ===================
app.post('/edit-blog/:id', parser.single('image'), async (req, res) => {
  try {
    const { title, content, date } = req.body;
    const blog = await Blog.findById(req.params.id);

    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    blog.title = title;
    blog.content = content;
    blog.date = date;

    if (req.file) blog.imageUrl = req.file.path; // Replace image if new one uploaded

    await blog.save();
    res.json({ message: 'Blog updated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});




app.post('/delete-blog/:id', async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json({ message: 'Blog deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.use('/admin', express.static(path.join(__dirname, 'admin')));
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
