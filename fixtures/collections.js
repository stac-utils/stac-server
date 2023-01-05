import templates from './dynamicTemplates.js'

export default function () {
  return {
    mappings: {
      numeric_detection: false,
      dynamic_templates: templates,
      properties: {
        'extent.spatial.bbox': { type: 'long' },
        'extent.temporal.interval': { type: 'date' },
        providers: { type: 'object', enabled: false },
        links: { type: 'object', enabled: false },
        item_assets: { type: 'object', enabled: false }
      }
    }
  }
}
