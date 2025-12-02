const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StreamLog = sequelize.define('StreamLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  channelId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  action: {
    type: DataTypes.ENUM('start', 'stop', 'error', 'client_connect', 'client_disconnect'),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  clientCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bitrate: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'stream_logs',
  timestamps: true
});

module.exports = StreamLog;