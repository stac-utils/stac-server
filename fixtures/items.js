const common = require('./common.js')

module.exports = () => ({
  mappings: {
    dynamic_templates: common.dynamic_templates,
    properties: {
      geometry: { type: 'geo_shape' },
      properties: common.properties,
      assets: { type: "object", enabled: false },
      links: { type: "object", enabled: false },
    }
  }
})
