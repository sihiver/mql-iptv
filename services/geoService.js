const axios = require('axios');

class GeoService {
  static async getLocationFromIP(ip) {
    // Skip local IPs
    if (ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return {
        country: 'Local',
        city: 'Local Network',
        isp: 'Local'
      };
    }

    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}`, {
        timeout: 5000
      });
      
      if (response.data.status === 'success') {
        return {
          country: response.data.country,
          city: response.data.city,
          isp: response.data.isp,
          lat: response.data.lat,
          lon: response.data.lon
        };
      }
    } catch (error) {
      console.log('Geo location service error:', error.message);
    }

    return {
      country: 'Unknown',
      city: 'Unknown',
      isp: 'Unknown'
    };
  }

  static async enrichClientData(clientData) {
    try {
      const geoData = await this.getLocationFromIP(clientData.ip);
      return {
        ...clientData,
        ...geoData
      };
    } catch (error) {
      return clientData;
    }
  }
}

module.exports = GeoService;