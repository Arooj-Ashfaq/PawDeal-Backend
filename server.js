const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

dotenv.config();

const { testConnection } = require('./src/config/database');

const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const petRoutes = require('./src/routes/petRoutes');
const productRoutes = require('./src/routes/productRoutes');
const breedRoutes = require('./src/routes/breedRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const cartRoutes = require('./src/routes/cartRoutes');
const favoriteRoutes = require('./src/routes/favoriteRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const commentRoutes = require('./src/routes/commentRoutes');
const blogRoutes = require('./src/routes/blogRoutes');
const guideRoutes = require('./src/routes/guideRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const subscriptionRoutes = require('./src/routes/subscriptionRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const searchRoutes = require('./src/routes/searchRoutes');

const { authenticate } = require('./src/middleware/auth');
const errorHandler = require('./src/middleware/errorHandler');
const notFound = require('./src/middleware/notFound');

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', credentials: true }
});

app.set('io', io);

const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
});

// CORS - Allow everything
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(cors({ origin: '*', credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// FIX: Serve images with correct CORS headers
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Image proxy endpoint for pets
app.get('/api/images/pets/:filename', (req, res) => {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, 'uploads', 'pets', filename);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(imagePath);
});

// Image proxy endpoint for products
app.get('/api/images/products/:filename', (req, res) => {
    const { filename } = req.params;
    const imagePath = path.join(__dirname, 'uploads', 'products', filename);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(imagePath);
});

app.use('/api/auth', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/products', productRoutes);
app.use('/api/breeds', breedRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/guides', guideRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Server is running', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV });
});

app.get('/api/health/db', async (req, res) => {
    const isConnected = await testConnection();
    if (isConnected) {
        res.status(200).json({ status: 'success', message: 'Database connected' });
    } else {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

const messageHandler = require('./src/sockets/messageHandler');
messageHandler(io);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
    testConnection();
});