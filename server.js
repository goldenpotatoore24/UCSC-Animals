import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config();

// Configure Cloudinary - replace these with your actual credentials
cloudinary.config({
    cloud_name: 'YOUR_CLOUD_NAME',
    api_key: 'YOUR_API_KEY',
    api_secret: 'YOUR_API_SECRET'
});

const app = express();

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'wildlife-sightings',
        allowed_formats: ['jpg', 'jpeg', 'png'],
        transformation: [{ width: 1000, crop: "limit" }] // Resize large images
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

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

// Get all active sightings (less than 1 hour old)
app.get('/api/sightings', async (req, res) => {
    try {
        const hourAgo = new Date(Date.now() - 3600000);
        const sightings = await Sighting.find({
            lastUpdate: { $gte: hourAgo }
        }).sort({ timestamp: -1 });
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// Add new sighting with image
app.post('/api/sightings', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const sighting = new Sighting({
            animal: req.body.animal,
            isBaby: req.body.isBaby === 'true',
            location: JSON.parse(req.body.location),
            imageUrl: req.file.path
        });

        const savedSighting = await sighting.save();
        res.status(201).json(savedSighting);
    } catch (error) {
        console.error('Error creating sighting:', error);
        
        // If there was an error, try to delete the uploaded image
        if (req.file?.path) {
            try {
                const publicId = req.file.filename;
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudinaryError) {
                console.error('Error deleting image:', cloudinaryError);
            }
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error creating sighting' });
    }
});

// Refresh sighting timestamp
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

// Delete expired sightings and their images
const cleanupExpiredSightings = async () => {
    try {
        const hourAgo = new Date(Date.now() - 3600000);
        const expiredSightings = await Sighting.find({
            lastUpdate: { $lt: hourAgo }
        });

        // Delete images from Cloudinary
        for (const sighting of expiredSightings) {
            try {
                const publicId = sighting.imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(publicId);
            } catch (error) {
                console.error('Error deleting image:', error);
            }
        }

        // Delete sightings from database
        await Sighting.deleteMany({
            lastUpdate: { $lt: hourAgo }
        });
    } catch (error) {
        console.error('Error in cleanup job:', error);
    }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSightings, 300000);

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
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
}

export default app;