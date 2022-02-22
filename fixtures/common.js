const properties = {
  'type': 'object',
  properties: {
    // Common https://github.com/radiantearth/stac-spec/blob/master/item-spec/common-metadata.md
    'datetime': { type: 'date' },
    'start_datetime': { type: 'date' },
    'end_datetime': { type: 'date' },
    'created': { type: 'date' },
    'updated': { type: 'date' },
    'gsd': { type: 'float' },

    // EO Extension https://github.com/stac-extensions/eo
    'eo:cloud_cover': { type: 'float' },

    // View Extension https://github.com/stac-extensions/view
    'view:off_nadir': { type: 'float' },
    'view:incidence_angle': { type: 'float' },
    'view:azimuth': { type: 'float' },
    'view:sun_azimuth': { type: 'float' },
    'view:sun_elevation': { type: 'float' },

    // Satellite Extension https://github.com/stac-extensions/sat
    'sat:absolute_orbit': { type: 'integer' },
    'sat:relative_orbit': { type: 'integer' },

    // SAR Extention https://github.com/stac-extensions/sar
    'sar:center_frequency': { type: 'float' },
    'sar:resolution_range': { type: 'float' },
    'sar:resolution_azimuth': { type: 'float' },
    'sar:pixel_spacing_range': { type: 'float' },
    'sar:pixel_spacing_azimuth': { type: 'float' },
    'sar:looks_range': { type: 'float' },
    'sar:looks_azimuth': { type: 'float' },
    'sar:looks_equivalent_number': { type: 'float' }
  }
}

// eslint-disable-next-line camelcase
const dynamic_templates = [
  // Common https://github.com/radiantearth/stac-spec/blob/master/item-spec/common-metadata.md
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

  // Projection Extension https://github.com/stac-extensions/projection
  {
    proj_epsg: {
      match: 'proj:epsg',
      mapping: { type: 'integer' }
    }
  },
  {
    proj_projjson: {
      match: 'proj:projjson',
      mapping: { type: 'object', enabled: 'false' }
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
  // Default all other strings not otherwise specified to keyword
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
