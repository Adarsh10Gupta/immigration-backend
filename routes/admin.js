const express = require('express');
const router = express.Router();
const path = require('path');

// Dummy login credentials
const ADMIN = {
    username: 'admin',
    password: 'admin123'
};

// Login page
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/login.html'));
});

// Login POST
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN.username && password === ADMIN.password) {
        req.session.isLoggedIn = true;
        res.redirect('/admin/dashboard');
    } else {
        res.send('Invalid credentials');
    }
});

// Dashboard page
router.get('/dashboard', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect('/admin/login');
    }
    res.sendFile(path.join(__dirname, '../views/dashboard.html'));
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

module.exports = router;
