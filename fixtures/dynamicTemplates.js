// these are attributes that can appear in multiple places in a STAC entity
export default [
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
      mapping: { type: 'object', enabled: false }
    }
  },
  {
    proj_centroid: {
      match: 'proj:centroid',
      mapping: { type: 'geo_point' }
    }
  },
  {
    proj_geometry: {
      match: 'proj:geometry',
      mapping: { type: 'object', enabled: false }
    }
  },
  {
    proj_transform: {
      match: 'proj:transform',
      mapping: { type: 'object', enabled: false }
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
  },
  {
    numerics: {
      match_mapping_type: 'long',
      mapping: { type: 'float' }
    }
  }
]
