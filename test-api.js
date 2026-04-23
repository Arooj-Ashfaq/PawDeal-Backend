// test-api.js
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const testAPI = async () => {
    console.log('🔍 Testing Pet Marketplace API...\n');

    try {
        // 1. Test health endpoint
        console.log('1️⃣ Testing Health Check...');
        const health = await axios.get(`${API_URL}/health`);
        console.log('   ✅ Server is running\n');

        // 2. Test database connection
        console.log('2️⃣ Testing Database Connection...');
        const dbHealth = await axios.get(`${API_URL}/health/db`);
        console.log('   ✅ Database connected\n');

        // 3. Get all pets (public)
        console.log('3️⃣ Fetching Pets...');
        const pets = await axios.get(`${API_URL}/pets?limit=5`);
        console.log(`   ✅ Found ${pets.data.data?.length || 0} pets\n`);

        // 4. Get all breeds
        console.log('4️⃣ Fetching Breeds...');
        const breeds = await axios.get(`${API_URL}/breeds`);
        console.log(`   ✅ Found ${breeds.data.data?.length || 0} breeds\n`);

        // 5. Get all products
        console.log('5️⃣ Fetching Products...');
        const products = await axios.get(`${API_URL}/products?limit=5`);
        console.log(`   ✅ Found ${products.data.data?.length || 0} products\n`);

        console.log('🎉 All API tests passed! Your backend is ready!');
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
    }
};

testAPI();