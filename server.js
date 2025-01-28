import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Load environment variables
dotenv.config();

// Initialize express
const app = express();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer and Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'wildlife-sightings',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection options
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    retryWrites: true,
};

// Update MongoDB Schema to include image URL
const sightingSchema = new mongoose.Schema({
    animal: {
        type: String,
        required: true,
        enum: ['deer', 'turkey', 'cow', 'sheep', 'goat', 'coyote']
    },
    isBaby: {
        type: Boolean,
        default: false
    },
    location: {
        lat: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },
        lng: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        }
    },
    imageUrl: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        expires: 3600 // Automatically delete after 1 hour (3600 seconds)
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Create MongoDB model
const Sighting = mongoose.model('Sighting', sightingSchema);

// Periodic cleanup job (additional safety)
const cleanupExpiredSightings = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        await Sighting.deleteMany({ timestamp: { $lt: oneHourAgo } });
        console.log('Expired sightings cleaned up');
    } catch (error) {
        console.error('Error cleaning up expired sightings:', error);
    }
};

// Run cleanup every 30 minutes
setInterval(cleanupExpiredSightings, 30 * 60 * 1000);

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mongoConnection: mongoose.connection.readyState });
});

// Routes
app.get('/api/sightings', async (req, res) => {
    try {
        const sightings = await Sighting.find()
            .sort({ timestamp: -1 })
            .limit(100);
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// Update POST route to handle image upload
app.post('/api/sightings', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const sightingData = JSON.parse(req.body.sighting);
        const { animal, location, isBaby } = sightingData;

        if (!animal || !location || !location.lat || !location.lng) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const sighting = new Sighting({
            animal,
            isBaby: isBaby || false,
            location: {
                lat: parseFloat(location.lat),
                lng: parseFloat(location.lng)
            },
            imageUrl: req.file.path
        });

        const savedSighting = await sighting.save();
        res.status(201).json(savedSighting);
    } catch (error) {
        console.error('Error creating sighting:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error creating sighting' });
    }
});

// New route to mark a sighting as "still here"
app.post('/api/sightings/:id/still-here', async (req, res) => {
    try {
        const sighting = await Sighting.findByIdAndUpdate(
            req.params.id, 
            { 
                timestamp: new Date(), // Reset the 1-hour timer
                lastUpdated: new Date() 
            }, 
            { new: true }
        );

        if (!sighting) {
            return res.status(404).json({ error: 'Sighting not found' });
        }

        res.json(sighting);
    } catch (error) {
        console.error('Error updating sighting:', error);
        res.status(500).json({ error: 'Error updating sighting' });
    }
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Print connection string (without credentials) for debugging
console.log('Attempting to connect to MongoDB at:', 
    MONGODB_URI.replace(/mongodb\+srv:\/\/[^:]+:[^@]+@/, 'mongodb+srv://USERNAME:PASSWORD@'));

mongoose.connect(MONGODB_URI, mongooseOptions)
    .then(() => {
        console.log('Connected to MongoDB successfully');
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Detailed MongoDB connection error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            codeName: error.codeName,
            serverHost: error.serverHost,
        });
        process.exit(1);
    });

// Monitor MongoDB connection
mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(false)
        .then(() => {
            console.log('MongoDB connection closed.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Error closing MongoDB connection:', err);
            process.exit(1);
        });
});

export default app;