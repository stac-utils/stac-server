
const properties = {
  'type': 'object',
  properties: {
    'datetime': { type: 'date' },
    'start_datetime': { type: 'date' },
    'end_datetime': { type: 'date' },
    'created': { type: 'date' },
    'updated': { type: 'date' },
    'eo:cloud_cover': { type: 'float' },
    'eo:gsd': { type: 'float' }
  }
}

const dynamic_templates = [
  {
    descriptions: {
      match_mapping_type: 'string',
      match: 'description',
      mapping: { type: 'text' }
    }
  },
  {
    titles: {
      match_mapping_type: 'string',
      match: 'title',
      mapping: { type: 'text' }
    }
  },
  {
    proj_centroid: {
      match_mapping_type: 'string',
      match: 'proj:centroid',
      mapping: { type: 'geo_point' }
    }
  },
  {
    proj_geometry: {
      match_mapping_type: 'string',
      match: 'proj:geometry',
      mapping: { type: 'geo_shape' }
    }
  },
  {
    no_index_href: {
      match: 'href',
      mapping: {
        type: 'text',
        index: false
      }
    }
  },
  {
    strings: {
      match_mapping_type: 'string',
      mapping: { type: 'keyword' }
    }
  }
]

module.exports = {
  properties,
  dynamic_templates
}