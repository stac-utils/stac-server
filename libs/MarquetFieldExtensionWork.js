function buildFieldsFilter(parameters) {
  const { fields } = parameters
  let _sourceInclude = [
    'id',
    'type',
    'geometry',
    'bbox',
    'links',
    'assets',
    'collection',
    'properties.datetime'
  ]
  let _sourceExclude = []
  if (fields) {
    const { include, exclude } = fields
    // Remove exclude fields from the default include list and add them to the source exclude list
    if (exclude && exclude.length > 0) {
      _sourceInclude = _sourceInclude.filter((field) => !exclude.includes(field))
      _sourceExclude = exclude
    }
    // Add include fields to the source include list if they're not already in it
    if (include && include.length > 0) {
      include.forEach((field) => {
        if (_sourceInclude.indexOf(field) < 0) {
          _sourceInclude.push(field)
        }
      })
    }
  }
  return { _sourceInclude, _sourceExclude }
}

const { _sourceInclude, _sourceExclude } = buildFieldsFilter(parameters)
if (_sourceExclude.length > 0) {
  searchParams._sourceExclude = _sourceExclude
}
if (_sourceInclude.length > 0) {
  searchParams._sourceInclude = _sourceInclude
}