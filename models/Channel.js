const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Channel = sequelize.define('Channel', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'General'
  },
  logo: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'inactive'
  },
  clientCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bitrate: {
    type: DataTypes.INTEGER,
    defaultValue: 2000
  },
  resolution: {
    type: DataTypes.STRING,
    defaultValue: '720p'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'channels',
  timestamps: true
});

module.exports = Channel;