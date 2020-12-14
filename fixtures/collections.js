const common = require('./common.js')

module.exports = () => ({
  mappings: {
    doc: {
      dynamic_templates: common.dynamic_templates,
      properties: {
        extent: {
          type: 'object',
          properties: {
            spatial: { 
              type: 'object',
              properties: {
                bbox: { type: 'long' }
              }
            },
            temporal: {
              type: 'object',
              properties: {
                interval: { type: 'date' }
              }
            }
          }
        }
      }
    }
  }
})
