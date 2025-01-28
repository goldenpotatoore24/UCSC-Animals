// Required dependencies
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize express
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
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Create MongoDB model
const Sighting = mongoose.model('Sighting', sightingSchema);

// Routes

// GET all sightings
app.get('/api/sightings', async (req, res) => {
    try {
        const sightings = await Sighting.find()
            .sort({ timestamp: -1 }) // Sort by newest first
            .limit(100); // Limit to last 100 sightings for performance
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// POST new sighting
app.post('/api/sightings', async (req, res) => {
    try {
        // Validate required fields
        const { animal, location } = req.body;
        if (!animal || !location || !location.lat || !location.lng) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create new sighting
        const sighting = new Sighting({
            animal: req.body.animal,
            isBaby: req.body.isBaby || false,
            location: {
                lat: parseFloat(location.lat),
                lng: parseFloat(location.lng)
            }
        });

        // Save to database
        const savedSighting = await sighting.save();
        res.status(201).json(savedSighting);
    } catch (error) {
        console.error('Error creating sighting:', error);
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'Error creating sighting' });
    }
});

// GET sightings within date range
app.get('/api/sightings/range', async (req, res) => {
    try {
        const { start, end } = req.query;
        const query = {};
        
        if (start || end) {
            query.timestamp = {};
            if (start) query.timestamp.$gte = new Date(start);
            if (end) query.timestamp.$lte = new Date(end);
        }

        const sightings = await Sighting.find(query).sort({ timestamp: -1 });
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings by date range:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// GET sightings by animal type
app.get('/api/sightings/:animal', async (req, res) => {
    try {
        const sightings = await Sighting.find({ 
            animal: req.params.animal 
        }).sort({ timestamp: -1 });
        res.json(sightings);
    } catch (error) {
        console.error('Error fetching sightings by animal:', error);
        res.status(500).json({ error: 'Error fetching sightings' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wildlife-tracker';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
        process.exit(1);
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