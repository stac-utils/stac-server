const common = require('./common.js')

module.exports = () => ({
  mappings: {
    doc: {
      dynamic_templates: common.dynamic_templates,
      properties: {
        geometry: { type: 'geo_shape' },
        properties: common.properties
      }
    }
  }
})
