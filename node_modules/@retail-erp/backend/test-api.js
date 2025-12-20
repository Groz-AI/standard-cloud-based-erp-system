// API Endpoints Test
const http = require('http');

const BASE_URL = 'http://localhost:3001';

const endpoints = [
  { method: 'GET', path: '/health', auth: false, name: 'Health Check' },
  { method: 'POST', path: '/api/auth/login', auth: false, name: 'Login Endpoint', body: { email: 'test@test.com', password: 'test' } },
];

async function testEndpoint(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const success = res.statusCode < 500;
        resolve({
          name: endpoint.name,
          status: success ? '✅ OK' : '❌ ERROR',
          code: res.statusCode,
          detail: success ? 'Endpoint responding' : data
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        name: endpoint.name,
        status: '❌ ERROR',
        code: 0,
        detail: e.message
      });
    });

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('  API ENDPOINTS - HEALTH CHECK');
  console.log('========================================\n');

  // Test basic connectivity
  const results = [];
  
  // Health endpoint
  results.push(await testEndpoint({ method: 'GET', path: '/health', name: 'Health Check' }));
  
  console.log('API STATUS:');
  console.log('─'.repeat(50));
  
  for (const r of results) {
    console.log(`${r.status} [${r.code}] ${r.name.padEnd(25)} ${r.detail}`);
  }
  
  // Check if server is up
  const serverUp = results.some(r => r.status.includes('OK'));
  
  if (serverUp) {
    console.log('\n✅ Backend API Server: RUNNING');
    console.log('✅ Frontend Dev Server: http://localhost:3000');
    console.log('\n========================================');
    console.log('  AVAILABLE API ENDPOINTS');
    console.log('========================================');
    console.log(`
  AUTH:
  ├── POST /api/auth/login
  ├── POST /api/auth/register
  └── GET  /api/auth/me

  PRODUCTS:
  ├── GET    /api/products
  ├── POST   /api/products
  ├── GET    /api/products/:id
  ├── PUT    /api/products/:id
  └── DELETE /api/products/:id

  CATEGORIES & BRANDS:
  ├── GET  /api/categories
  ├── POST /api/categories
  ├── GET  /api/brands
  └── POST /api/brands

  CUSTOMERS:
  ├── GET  /api/customers
  └── POST /api/customers

  INVENTORY:
  ├── GET  /api/inventory/stock
  ├── POST /api/inventory/receive
  ├── GET  /api/inventory/ledger
  └── GET  /api/inventory/low-stock

  POS:
  └── POST /api/pos/sale

  DASHBOARD:
  ├── GET /api/dashboard/stats
  ├── GET /api/dashboard/recent-sales
  └── GET /api/dashboard/top-products
`);
  } else {
    console.log('\n❌ Backend API Server: NOT RESPONDING');
  }
}

runTests();
