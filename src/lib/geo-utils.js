import extent from '@mapbox/extent'
import { ValidationError } from './errors.js'

/**
 * Conver tboundng box input to useable format and check bounds
 * @param {*} bbox - bounding box from request.  Expected format is either an
 *  array as a single string or array formatted [x_min, y_min, x_max, y_max,
 * z_min, z_max]'. Z values are optional
 * @param {boolean} fromString - bool to indicate if we are parsing from a
 * string or not
 * @returns {Array | undefined}
 */
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
      throw new ValidationError('Invalid bbox, must have 4 or 6 points. '
        + '6 points is for 3D bounding boxes')
    }

    if ((bboxArray.length === 4 && bboxArray[1] > bboxArray[3])
        || (bboxArray.length === 6 && bboxArray[1] > bboxArray[4])) {
      throw new ValidationError('Invalid bbox, SW latitude must be less than NE latitude')
    }
    if (
      (bboxArray[0] < -180 || bboxArray[0] > 180)
      || (bboxArray[1] < -90 || bboxArray[1] > 90)
      || (bboxArray[2] > 180 || bboxArray[2] < -180)
      || (bboxArray[3] > 90 || bboxArray[3] < -90)) {
      throw new ValidationError('Invalid [lon, lat, lon, lat, z, z] bbox.  '
        + 'Longitudes must be between -180/180, latitudes must be between '
        + '-90/90, extent should not exceed [-180, -90, 180, 90]')
    }

    return extent(bboxArray).polygon()
  }

  return undefined
}
