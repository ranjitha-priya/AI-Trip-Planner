import axios from 'axios';
import 'dotenv/config';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('Testing Gemini API...');
console.log('API Key:', GEMINI_API_KEY ? '✅ Found' : '❌ Not found');

async function testGemini() {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: "Say hello!"
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Success!');
    console.log('Response:', response.data.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testGemini();