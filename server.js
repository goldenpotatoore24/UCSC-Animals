import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize express
const app = express();

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
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Create MongoDB model
const Sighting = mongoose.model('Sighting', sightingSchema);

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

app.post('/api/sightings', async (req, res) => {
    try {
        const { animal, location } = req.body;
        if (!animal || !location || !location.lat || !location.lng) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const sighting = new Sighting({
            animal: req.body.animal,
            isBaby: req.body.isBaby || false,
            location: {
                lat: parseFloat(location.lat),
                lng: parseFloat(location.lng)
            }
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