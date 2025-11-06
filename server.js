import express from 'express';
import cors from 'cors';
import axios from 'axios';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;

// API Keys
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== AI CHAT ENDPOINTS ====================

// Main chat endpoint - auto-selects available AI service
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`💬 Chat request from user: ${userId}`);
    console.log(`📝 Message: ${message}`);

    // Use Gemini if available (free!), otherwise OpenAI
    if (GEMINI_API_KEY) {
      console.log('🔮 Using Gemini API');
      return await handleGeminiChat(req, res);
    } else if (OPENAI_API_KEY) {
      console.log('🤖 Using OpenAI API');
      return await handleOpenAIChat(req, res);
    } else {
      console.error('❌ No AI service configured!');
      return res.status(500).json({ 
        error: 'No AI service configured',
        reply: 'The AI service is not configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to your .env file.'
      });
    }

  } catch (error) {
    console.error('❌ Chat Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get AI response',
      reply: "I'm having trouble connecting right now. Please try again.",
      details: error.message
    });
  }
});

// Gemini chat handler
async function handleGeminiChat(req, res) {
  const { message } = req.body;

  try {
    const prompt = `You are TripCompanion, an expert AI travel assistant. You help users with travel information, destination details, hotel recommendations, tourist attractions, local cuisine, travel tips, and more.

User question: ${message}

Provide helpful, accurate, and engaging travel information. Be concise but informative. Format your response clearly with line breaks where appropriate.`;

    console.log('🔮 Calling Gemini API...');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Gemini API Response Status:', response.status);

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const reply = response.data.candidates[0].content.parts[0].text;
      console.log('✅ Reply generated successfully');
      return res.json({ reply, source: 'gemini' });
    } else {
      console.error('❌ Unexpected Gemini response structure:', JSON.stringify(response.data));
      throw new Error('Invalid response from Gemini API');
    }

  } catch (error) {
    console.error('❌ Gemini API Error:', error.response?.data || error.message);
    
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
    }

    return res.status(500).json({ 
      error: 'Failed to get AI response from Gemini',
      reply: "I'm having trouble connecting to my AI service. Please check your API key configuration.",
      details: error.response?.data?.error?.message || error.message
    });
  }
}

// OpenAI chat handler
async function handleOpenAIChat(req, res) {
  const { message } = req.body;

  try {
    const systemPrompt = `You are TripCompanion, an expert AI travel assistant. You help users with:
- Detailed information about destinations, cities, and countries
- Hotel and accommodation recommendations  
- Tourist attractions and activities
- Local cuisine and restaurants
- Travel tips and cultural insights
- Budget planning and cost estimates
- Best times to visit places
- Transportation options
- Safety and travel advisories

Provide helpful, accurate, and engaging travel information. Be concise but informative.`;

    console.log('🤖 Calling OpenAI API...');

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 800,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    console.log('✅ OpenAI Response generated successfully');

    return res.json({ reply, source: 'openai' });

  } catch (error) {
    console.error('❌ OpenAI API Error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to get AI response from OpenAI',
      reply: "I'm having trouble connecting right now. Please try again.",
      details: error.response?.data?.error?.message || error.message
    });
  }
}

// ==================== EXISTING PLACES ENDPOINTS ====================

// Route to get nearby places
app.get('/api/places', async (req, res) => {
  try {
    const { lat, lng, type = 'tourist_attraction', radius = 5000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    console.log(`Fetching places: lat=${lat}, lng=${lng}, type=${type}, radius=${radius}`);

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${lat},${lng}`,
          radius: radius,
          type: type,
          key: GOOGLE_MAPS_API_KEY,
        },
      }
    );

    console.log('Google API Status:', response.data.status);

    if (response.data.status === 'OK' || response.data.status === 'ZERO_RESULTS') {
      const places = (response.data.results || []).map((place) => ({
        name: place.name,
        address: place.vicinity || place.formatted_address || 'Address not available',
        rating: place.rating || 'N/A',
        location: {
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
        },
        photos: place.photos?.[0]?.photo_reference || null,
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${place.geometry.location.lat},${place.geometry.location.lng}&query_place_id:${place.place_id}`,
        placeId: place.place_id,
      }));

      console.log(`Found ${places.length} places`);
      res.json(places);
    } else if (response.data.status === 'REQUEST_DENIED') {
      console.error('API Key Error:', response.data.error_message);
      res.status(403).json({ 
        error: 'Google API request denied. Check your API key and enabled APIs.',
        details: response.data.error_message,
        places: []
      });
    } else if (response.data.status === 'INVALID_REQUEST') {
      console.error('Invalid Request:', response.data.error_message);
      res.status(400).json({ 
        error: 'Invalid request parameters',
        details: response.data.error_message,
        places: []
      });
    } else {
      console.error('Unexpected API Status:', response.data);
      res.status(500).json({ 
        error: 'Failed to fetch places', 
        details: response.data,
        places: []
      });
    }
  } catch (error) {
    console.error('Error fetching nearby places:', error.message);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      apiError: error.response?.data,
      places: []
    });
  }
});

// Route to get Google Place photo URL
app.get('/get-photo-url', async (req, res) => {
  try {
    const { photoReference } = req.query;

    if (!photoReference) {
      return res.status(400).json({ error: 'Photo reference is required' });
    }

    const imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoReference}&key=${GOOGLE_MAPS_API_KEY}`;

    res.json({ imageUrl });
  } catch (error) {
    console.error('Error generating photo URL:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Get place details
app.get('/api/place-details', async (req, res) => {
  try {
    const { placeId } = req.query;

    if (!placeId) {
      return res.status(400).json({ error: 'Place ID is required' });
    }

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'name,rating,formatted_address,formatted_phone_number,opening_hours,website,reviews,price_level,photos',
          key: GOOGLE_MAPS_API_KEY,
        },
      }
    );

    if (response.data.status === 'OK') {
      res.json(response.data.result);
    } else {
      res.status(404).json({ error: 'Place not found', details: response.data });
    }
  } catch (error) {
    console.error('Error fetching place details:', error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Test endpoint for debugging
app.post('/api/test-gemini', async (req, res) => {
  try {
    console.log('🧪 Testing Gemini API...');
    console.log('API Key present:', !!GEMINI_API_KEY);
    console.log('API Key prefix:', GEMINI_API_KEY?.substring(0, 10) + '...');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: "Say 'Hello, TripCompanion is working!' in one sentence."
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Test successful!');
    res.json({ 
      success: true, 
      response: response.data,
      reply: response.data.candidates[0].content.parts[0].text
    });

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false,
      error: error.response?.data || error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    services: {
      googleMaps: !!GOOGLE_MAPS_API_KEY,
      openai: !!OPENAI_API_KEY,
      gemini: !!GEMINI_API_KEY,
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 Google Maps API: ${GOOGLE_MAPS_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🤖 OpenAI API: ${OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🔮 Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  
  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    console.log('⚠️  WARNING: No AI service configured! Please add API key to .env');
  }
});