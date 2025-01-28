import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer storage with Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'wildlife-sightings',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Schema
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
        default: Date.now
    },
    lastUpdate: {
        type: Date,
        default: Date.now
    }
});

const Sighting = mongoose.model('Sighting', sightingSchema);

// Routes

// GET all active sightings (less than 1 hour old)
app.get('/api/sightings', async (req, res) => {
    try {
        const hourAgo = new Date(Date.now() - 3600000); // 1 hour ago
        const sightings = await Sighting.find({
            lastUpdate: { $gte: hourAgo }
        }).sort({ timestamp: -1 });
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// POST new sighting with image
app.post('/api/sightings', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const locationData = JSON.parse(req.body.location);
        
        const sighting = new Sighting({
            animal: req.body.animal,
            isBaby: req.body.isBaby === 'true',
            location: {
                lat: parseFloat(locationData.lat),
                lng: parseFloat(locationData.lng)
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

// POST refresh a sighting's timestamp ("Still here" functionality)
app.post('/api/sightings/:id/refresh', async (req, res) => {
    try {
        const sighting = await Sighting.findById(req.params.id);
        
        if (!sighting) {
            return res.status(404).json({ error: 'Sighting not found' });
        }

        sighting.lastUpdate = new Date();
        await sighting.save();
        
        res.json(sighting);
    } catch (error) {
        console.error('Error refreshing sighting:', error);
        res.status(500).json({ error: 'Error refreshing sighting' });
    }
});

// DELETE expired sightings (called by scheduled task or manually)
app.delete('/api/sightings/expired', async (req, res) => {
    try {
        const hourAgo = new Date(Date.now() - 3600000);
        const result = await Sighting.deleteMany({
            lastUpdate: { $lt: hourAgo }
        });
        
        res.json({ 
            message: 'Expired sightings deleted',
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        console.error('Error deleting expired sightings:', error);
        res.status(500).json({ error: 'Error deleting expired sightings' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        mongoConnection: mongoose.connection.readyState
    });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');
    
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
} catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
}

// Cleanup job - runs every 5 minutes to delete expired sightings
setInterval(async () => {
    try {
        const hourAgo = new Date(Date.now() - 3600000);
        await Sighting.deleteMany({
            lastUpdate: { $lt: hourAgo }
        });
        console.log('Cleanup job completed');
    } catch (error) {
        console.error('Error in cleanup job:', error);
    }
}, 300000); // 5 minutes

export default app;