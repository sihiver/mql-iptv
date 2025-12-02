const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Client = sequelize.define('Client', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  clientId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deviceType: {
    type: DataTypes.ENUM('Desktop', 'Mobile', 'Tablet', 'Smart TV', 'Bot', 'Unknown'),
    defaultValue: 'Unknown'
  },
  channelId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isp: {
    type: DataTypes.STRING,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'clients',
  timestamps: true
});

module.exports = Client;