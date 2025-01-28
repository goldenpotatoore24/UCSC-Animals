const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb+srv://your_username:your_password@your-cluster.mongodb.net/wildlife-tracker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Sighting model
const Sighting = mongoose.model('Sighting', {
    animal: String,
    isBaby: Boolean,
    location: {
        lat: Number,
        lng: Number
    },
    timestamp: Date
});

// API Routes
app.get('/api/sightings', async (req, res) => {
    try {
        const sightings = await Sighting.find().sort('-timestamp');
        res.json(sightings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sightings' });
    }
});

app.post('/api/sightings', async (req, res) => {
    try {
        const sighting = new Sighting(req.body);
        await sighting.save();
        res.status(201).json(sighting);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create sighting' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
