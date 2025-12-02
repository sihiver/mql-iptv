const { syncDatabase } = require('../models');

async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');
    await syncDatabase(false); // false = jangan force recreate
    console.log('✅ Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();
