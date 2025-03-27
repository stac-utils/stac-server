import extent from '@mapbox/extent'
import { ValidationError } from './errors.js'

// eslint-disable-next-line import/prefer-default-export
export const bboxToPolygon = function (bbox, fromString) {
  if (bbox) {
    let bboxArray
    if (fromString && typeof bbox === 'string') {
      try {
        bboxArray = bbox.split(',').map(parseFloat).filter((x) => !Number.isNaN(x))
      } catch (_) {
        throw new ValidationError('Invalid bbox')
      }
    } else {
      bboxArray = bbox
    }

    if (!Array.isArray(bboxArray)) {
      throw new ValidationError('Invalid bbox')
    }

    if (bboxArray.length !== 4 && bboxArray.length !== 6) {
      throw new ValidationError('Invalid bbox, must have 4 or 6 points')
    }

    if ((bboxArray.length === 4 && bboxArray[1] > bboxArray[3])
        || (bboxArray.length === 6 && bboxArray[1] > bboxArray[4])) {
      throw new ValidationError('Invalid bbox, SW latitude must be less than NE latitude')
    }

    return extent(bboxArray).polygon()
  }

  return undefined
}
