const isCollection = function (record) {
  return record
    && (
      record.type === 'Collection'
      || record.hasOwnProperty('extent')
    )
}

const isItem = function (record) {
  return record
    && (
      record.type === 'Feature'
      || record.hasOwnProperty('geometry')
    )
}

module.exports = {
  isCollection,
  isItem
}
