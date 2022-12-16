const dynamicTemplates = require('./dynamicTemplates')

const itemsIndexConfiguration = function () {
  const numberOfShards = process.env.ITEMS_INDICIES_NUM_OF_SHARDS
  const numberOfReplicas = process.env.ITEMS_INDICIES_NUM_OF_REPLICAS

  const config = {}

  if (numberOfShards || numberOfReplicas) {
    const index = {}
    if (numberOfShards) index.number_of_shards = Number(numberOfShards)
    if (numberOfReplicas) index.number_of_replicas = Number(numberOfReplicas)

    config.settings = { index }
  }

  config.mappings = {
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

  return config
}

module.exports = {
  itemsIndexConfiguration
}
