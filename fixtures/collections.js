const common = require('./common.js')

module.exports = () => ({
  mappings: {
    dynamic_templates: common.dynamic_templates,
    properties: {
      "extent.spatial.bbox": { type: "long" },
      "extent.temporal.interval": { type: "date" },
      "providers": { type: "object", enabled: false },
      "links": { type: "object", enabled: false },
      "item_assets": { type: "object", enabled: false },
    }
  }
})
