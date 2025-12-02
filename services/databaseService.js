const { Channel, Client, StreamLog, SystemLog, sequelize } = require('../models');
const { Op } = require('sequelize');

class DatabaseService {
  // Channel operations
  static async getAllChannels() {
    return await Channel.findAll({
      order: [['id', 'ASC']]
    });
  }

  static async getChannelById(id) {
    return await Channel.findByPk(id);
  }

  static async createChannel(channelData) {
    return await Channel.create(channelData);
  }

  static async updateChannel(id, channelData) {
    const channel = await Channel.findByPk(id);
    if (!channel) throw new Error('Channel not found');
    
    return await channel.update(channelData);
  }

  static async deleteChannel(id) {
    const channel = await Channel.findByPk(id);
    if (!channel) throw new Error('Channel not found');
    
    return await channel.destroy();
  }

  // Client operations
  static async createClient(clientData) {
    return await Client.create(clientData);
  }

  static async getRecentClients(limit = 100) {
    return await Client.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  static async getClientsByChannel(channelId) {
    return await Client.findAll({
      where: { channelId },
      order: [['createdAt', 'DESC']]
    });
  }

  static async getClientStats() {
    // Count unique IPs using raw SQL query
    const [totalResult] = await sequelize.query(
      'SELECT COUNT(DISTINCT ip) as count FROM Clients',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Count unique IPs today
    const [todayResult] = await sequelize.query(
      `SELECT COUNT(DISTINCT ip) as count FROM Clients 
       WHERE datetime(createdAt) >= datetime('${today.toISOString()}')`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Get device stats from unique IPs
    const deviceStats = await sequelize.query(
      `SELECT deviceType, COUNT(DISTINCT ip) as count 
       FROM Clients 
       GROUP BY deviceType`,
      { type: sequelize.QueryTypes.SELECT }
    );

    return {
      totalClients: totalResult.count,
      todayClients: todayResult.count,
      deviceStats
    };
  }

  // Stream log operations
  static async createStreamLog(logData) {
    return await StreamLog.create(logData);
  }

  static async getStreamLogs(limit = 100) {
    return await StreamLog.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  static async getChannelStreamLogs(channelId, limit = 50) {
    return await StreamLog.findAll({
      where: { channelId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  // System log operations
  static async createSystemLog(logData) {
    return await SystemLog.create(logData);
  }

  static async getSystemLogs(level = null, limit = 100) {
    const where = level ? { level } : {};
    return await SystemLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  // Statistics
  static async getSystemStats() {
    const totalChannels = await Channel.count();
    const activeChannels = await Channel.count({ where: { status: 'active' } });
    const totalStreamLogs = await StreamLog.count();
    
    // Count unique IPs instead of all client records
    const [totalResult] = await sequelize.query(
      'SELECT COUNT(DISTINCT ip) as count FROM Clients',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [todayResult] = await sequelize.query(
      `SELECT COUNT(DISTINCT ip) as count FROM Clients 
       WHERE datetime(createdAt) >= datetime('${today.toISOString()}')`,
      { type: sequelize.QueryTypes.SELECT }
    );

    return {
      totalChannels,
      activeChannels,
      totalClients: totalResult.count,
      todayClients: todayResult.count,
      totalStreamLogs
    };
  }

  // Cleanup old data
  static async cleanupOldData(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      // Delete old clients
      const deletedClients = await Client.destroy({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate
          }
        }
      });

      // Delete old stream logs
      const deletedStreamLogs = await StreamLog.destroy({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate
          }
        }
      });

      // Delete old system logs (keep errors longer)
      const errorCutoffDate = new Date();
      errorCutoffDate.setDate(errorCutoffDate.getDate() - 90);

      const deletedSystemLogs = await SystemLog.destroy({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate
          },
          level: {
            [Op.ne]: 'error'
          }
        }
      });

      return {
        deletedClients,
        deletedStreamLogs,
        deletedSystemLogs
      };
    } catch (error) {
      console.error('Cleanup error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseService;