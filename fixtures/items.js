const dynamicTemplates = require('./dynamicTemplates')

module.exports = {
  mappings: {
    numeric_detection: false,
    dynamic_templates: dynamicTemplates.templates,
    properties: {
      geometry: { type: 'geo_shape' },
      assets: { type: 'object', enabled: false },
      links: { type: 'object', enabled: false },
      id: { type: 'keyword' },
      collection: { type: 'keyword' },
      properties: {
        type: 'object',
        properties: {

          // Common https://github.com/radiantearth/stac-spec/blob/master/item-spec/common-metadata.md
          datetime: { type: 'date' },
          start_datetime: { type: 'date' },
          end_datetime: { type: 'date' },
          created: { type: 'date' },
          updated: { type: 'date' },

          // Satellite Extension https://github.com/stac-extensions/sat
          'sat:absolute_orbit': { type: 'integer' },
          'sat:relative_orbit': { type: 'integer' }
        }
      }
    }
  }
}
