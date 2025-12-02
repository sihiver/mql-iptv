const { sequelize, testConnection } = require('../config/database');
const Channel = require('./Channel');
const Client = require('./Client');
const StreamLog = require('./StreamLog');
const SystemLog = require('./SystemLog');

// Initialize models
const models = {
  Channel,
  Client,
  StreamLog,
  SystemLog
};

// Sync database
async function syncDatabase(force = false) {
  try {
    await sequelize.sync({ force });
    console.log('✅ Database synchronized successfully');
    
    // Create sample data if database is empty
    const channelCount = await Channel.count();
    if (channelCount === 0) {
      await createSampleData();
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database synchronization failed:', error);
    throw error;
  }
}

// Create sample data
async function createSampleData() {
  try {
    const sampleChannels = [
      {
        name: 'TV One Sample',
        source: 'http://example.com/tvone.m3u8',
        category: 'News',
        logo: '',
        status: 'inactive',
        bitrate: 2000,
        resolution: '720p'
      },
      {
        name: 'RCTI Sample',
        source: 'http://example.com/rcti.m3u8',
        category: 'Entertainment',
        logo: '',
        status: 'inactive',
        bitrate: 2000,
        resolution: '720p'
      },
      {
        name: 'SCTV Sample', 
        source: 'http://example.com/sctv.m3u8',
        category: 'Entertainment',
        logo: '',
        status: 'inactive',
        bitrate: 2000,
        resolution: '720p'
      }
    ];

    await Channel.bulkCreate(sampleChannels);
    console.log('✅ Sample channels created');
  } catch (error) {
    console.error('❌ Failed to create sample data:', error);
  }
}

module.exports = {
  sequelize,
  testConnection, // Pastikan ini diekspor
  syncDatabase,
  ...models
};