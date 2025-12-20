// Comprehensive System Test
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runTests() {
  console.log('\n========================================');
  console.log('  RETAIL ERP SYSTEM - HEALTH CHECK');
  console.log('========================================\n');
  
  const results = [];
  
  // Test 1: Database Connection
  try {
    const dbTest = await pool.query('SELECT NOW() as time');
    results.push({ test: 'Database Connection', status: '✅ PASS', detail: `Connected at ${dbTest.rows[0].time}` });
  } catch (e) {
    results.push({ test: 'Database Connection', status: '❌ FAIL', detail: e.message });
  }

  // Test 2: Tenants Table
  try {
    const tenants = await pool.query('SELECT COUNT(*) as count FROM tenants');
    results.push({ test: 'Tenants Table', status: '✅ PASS', detail: `${tenants.rows[0].count} tenants` });
  } catch (e) {
    results.push({ test: 'Tenants Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 3: Users Table
  try {
    const users = await pool.query('SELECT COUNT(*) as count FROM users');
    results.push({ test: 'Users Table', status: '✅ PASS', detail: `${users.rows[0].count} users` });
  } catch (e) {
    results.push({ test: 'Users Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 4: Products Table
  try {
    const products = await pool.query('SELECT COUNT(*) as count FROM products WHERE is_active = true');
    results.push({ test: 'Products Table', status: '✅ PASS', detail: `${products.rows[0].count} active products` });
  } catch (e) {
    results.push({ test: 'Products Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 5: Categories Table
  try {
    const categories = await pool.query('SELECT COUNT(*) as count FROM categories WHERE is_active = true');
    results.push({ test: 'Categories Table', status: '✅ PASS', detail: `${categories.rows[0].count} categories` });
  } catch (e) {
    results.push({ test: 'Categories Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 6: Brands Table
  try {
    const brands = await pool.query('SELECT COUNT(*) as count FROM brands WHERE is_active = true');
    results.push({ test: 'Brands Table', status: '✅ PASS', detail: `${brands.rows[0].count} brands` });
  } catch (e) {
    results.push({ test: 'Brands Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 7: Customers Table
  try {
    const customers = await pool.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true');
    results.push({ test: 'Customers Table', status: '✅ PASS', detail: `${customers.rows[0].count} customers` });
  } catch (e) {
    results.push({ test: 'Customers Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 8: Stock on Hand Table
  try {
    const stock = await pool.query('SELECT COUNT(*) as count FROM stock_on_hand');
    results.push({ test: 'Stock on Hand Table', status: '✅ PASS', detail: `${stock.rows[0].count} stock records` });
  } catch (e) {
    results.push({ test: 'Stock on Hand Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 9: Stock Ledger Table
  try {
    const ledger = await pool.query('SELECT COUNT(*) as count FROM stock_ledger');
    results.push({ test: 'Stock Ledger Table', status: '✅ PASS', detail: `${ledger.rows[0].count} transactions` });
  } catch (e) {
    results.push({ test: 'Stock Ledger Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 10: Sales Receipts Table
  try {
    const sales = await pool.query('SELECT COUNT(*) as count FROM sales_receipts');
    results.push({ test: 'Sales Receipts Table', status: '✅ PASS', detail: `${sales.rows[0].count} sales` });
  } catch (e) {
    results.push({ test: 'Sales Receipts Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 11: Product Barcodes Table
  try {
    const barcodes = await pool.query('SELECT COUNT(*) as count FROM product_barcodes');
    results.push({ test: 'Product Barcodes Table', status: '✅ PASS', detail: `${barcodes.rows[0].count} barcodes` });
  } catch (e) {
    results.push({ test: 'Product Barcodes Table', status: '❌ FAIL', detail: e.message });
  }

  // Test 12: Stores Table
  try {
    const stores = await pool.query('SELECT COUNT(*) as count FROM stores');
    results.push({ test: 'Stores Table', status: '✅ PASS', detail: `${stores.rows[0].count} stores` });
  } catch (e) {
    results.push({ test: 'Stores Table', status: '❌ FAIL', detail: e.message });
  }

  // Print Results
  console.log('TEST RESULTS:');
  console.log('─'.repeat(60));
  
  let passCount = 0;
  let failCount = 0;
  
  for (const r of results) {
    console.log(`${r.status} ${r.test.padEnd(25)} ${r.detail}`);
    if (r.status.includes('PASS')) passCount++;
    else failCount++;
  }
  
  console.log('─'.repeat(60));
  console.log(`\nSUMMARY: ${passCount} passed, ${failCount} failed`);
  
  if (failCount === 0) {
    console.log('\n🎉 ALL SYSTEMS OPERATIONAL!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.\n');
  }
  
  await pool.end();
}

runTests().catch(console.error);
