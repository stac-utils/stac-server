const common = require('./common.js')

module.exports = () => ({
  mappings: {
    doc: {
      dynamic_templates: common.dynamic_templates,
      properties: {
        properties: common.properties,
        extent: {
          type: 'object',
          properties: {
            spatial: { type: 'long' },
            temporal: { type: 'date' }
          }
        }
      }
    }
  }
})
