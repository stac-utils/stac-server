export function isCollection(record) {
  return record && record.type === 'Collection'
}

export function isItem(record) {
  return record && record.type === 'Feature'
}
