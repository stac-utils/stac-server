'use strict'

const path = require('path')
const moment = require('moment')
const _ = require('lodash')
const AWS = require('aws-sdk')
const satlib = require('@sat-utils/api-lib')
const through2 = require('through2')

// s3 client
const s3 = new AWS.S3()


const collection = {
  name: 'landsat-8-l1',
  title: 'Landsat 8 L1',
  description: 'Landat 8 imagery radiometrically calibrated and orthorectified ' +
                   'using gound points and Digital Elevation Model (DEM) data to ' +
                   'correct relief displacement.',
  keywords: 'landsat',
  version: '0.1.0',
  extent: {
    spatial: [-180, -90, 180, 90],
    temporal: ['2013-06-01', null]
  },
  properties: {
    providers: [
      {name: 'USGS', url: 'https://landsat.usgs.gov/'},
      {name: 'Planet Labs', url: 'https://github.com/landsat-pds/landsat_ingestor'},
      {name: 'AWS', url: 'https://landsatonaws.com/'},
      {name: 'Development Seed', url:'https://developmentseed.org/'}
    ],
    license: 'PDDL-1.0',
    'eo:gsd': 15,
    'eo:platform': 'landsat-8',
    'eo:instrument': 'OLI_TIRS',
    'eo:off_nadir': 0,
    'eo:bands': [
      {
        name: 'B1',
        common_name: 'coastal',
        gsd: 30.0,
        center_wavelength: 0.44,
        full_width_half_max: 0.02
      }, {
        name: 'B2',
        common_name: 'blue',
        gsd: 30.0,
        center_wavelength: 0.48,
        full_width_half_max: 0.06
      }, {
        name: 'B3',
        common_name: 'green',
        gsd: 30.0,
        center_wavelength: 0.56,
        full_width_half_max: 0.06
      }, {
        name: 'B4',
        common_name: 'red',
        gsd: 30.0,
        center_wavelength: 0.65,
        full_width_half_max: 0.04
      }, {
        name: 'B5',
        common_name: 'nir',
        gsd: 30.0,
        center_wavelength: 0.86,
        full_width_half_max: 0.03
      }, {
        name: 'B6',
        common_name: 'swir16',
        gsd: 30.0,
        center_wavelength: 1.6,
        full_width_half_max: 0.08
      }, {
        name: 'B7',
        common_name: 'swir22',
        gsd: 30.0,
        center_wavelength: 2.2,
        full_width_half_max: 0.2
      }, {
        name: 'B8',
        common_name: 'pan',
        gsd: 15.0,
        center_wavelength: 0.59,
        full_width_half_max: 0.18
      }, {
        name: 'B9',
        common_name: 'cirrus',
        gsd: 30.0,
        center_wavelength: 1.37,
        full_width_half_max: 0.02
      }, {
        name: 'B10',
        common_name: 'lwir11',
        gsd: 100.0,
        center_wavelength: 10.9,
        full_width_half_max: 0.8
      }, {
        name: 'B11',
        common_name: 'lwir12',
        gsd: 100.0,
        center_wavelength: 12.0,
        full_width_half_max: 1.0
      }
    ]
  },
  'assets': {
    'index': {name: 'HTML index page', type: 'text/html'},
    'ANG': {name: "Angle coefficients file", type: 'text/plain'},
    'MTL': {name: 'original metadata file', type: 'text/plain'},
    'thumbnail': {name: 'Thumbnail image', type: 'image/jpeg'},
    'BQA': {name: "Band quality data", type: 'image/x.geotiff'},
    'B1': {name: "Band 1 (coastal)", type: 'image/x.geotiff', 'eo:bands': [0]},
    'B2': {name: "Band 2 (blue)", type: 'image/x.geotiff', 'eo:bands': [1]},
    'B3': {name: "Band 3 (green)", type: 'image/x.geotiff', 'eo:bands': [2]},
    'B4': {name: "Band 4 (red)", type: 'image/x.geotiff', 'eo:bands': [3]},
    'B5': {name: "Band 5 (nir)", type: 'image/x.geotiff', 'eo:bands': [4]},
    'B6': {name: "Band 6 (swir16)", type: 'image/x.geotiff', 'eo:bands': [5]},
    'B7': {name: "Band 7 (swir22)", type: 'image/x.geotiff', 'eo:bands': [6]},
    'B8': {name: "Band 8 (pan)", type: 'image/x.geotiff', 'eo:bands': [7]},
    'B9': {name: "Band 9 (cirrus)", type: 'image/x.geotiff', 'eo:bands': [8]},
    'B10': {name: "Band 10 (lwir)", type: 'image/x.geotiff', 'eo:bands': [9]},
    'B11': {name: "Band 11 (lwir)", type: 'image/x.geotiff', 'eo:bands': [10]}
  },
  links: []
}


//! Check to see if a URL exists
function fileExists(url) {
  const params = {
    Bucket: 'landsat-pds',
    Key: url.slice(37)
  }
  return new Promise(((resolve, reject) => {
    s3.headObject(params, (err) => {
      if (err && err.code === 'NotFound') {
        reject(url)
      }
      else {
        resolve(url)
      }
    })
  }))
}

//! iterate over an array synchronously, invoke function on each element
function arrayIterate(values, fn) {
  return new Promise(((resolve, reject) => {
    // Are there any values to check?
    if (values.length === 0) {
      // All were rejected
      reject()
    }
    // Try the first value
    fn(values[0]).then((val) => {
      // Resolved, we're all done
      resolve(val)
    }).catch(() => {
      // Rejected, remove the first item from the array and recursively
      // try the next one
      values.shift()
      arrayIterate(values, fn).then(resolve).catch(reject)
    })
  }))
}


function awsLinks(data) {
  // generates links for the data on AWS
  const row = _.padStart(data.row, 3, '0')
  const _path = _.padStart(data.path, 3, '0')
  const sceneId = data.sceneID
  const productId = data.LANDSAT_PRODUCT_ID

  let files = ['ANG.txt', 'B1.TIF', 'B2.TIF', 'B3.TIF', 'B4.TIF', 'B5.TIF', 'B6.TIF',
    'B7.TIF', 'B8.TIF', 'B9.TIF', 'B10.TIF', 'B11.TIF', 'BQA.TIF', 'MTL.txt']
  const _bands = Object.keys(collection.properties['eo:bands'])

  const c1Base = `https://landsat-pds.s3.amazonaws.com/c1/L8/${path.join(_path, row, productId)}`
  //const c1Files = bands.map((b) => [{name: b.slice(0, -4), href: `${c1Base}/${productId}_${b}`}])
  let key
  let val
  const c1Files = _.fromPairs(files.map((b) => {
    key = b.slice(0, -4)
    val = { href: `${c1Base}/${productId}_${b}` }
    //if (_bands.includes(key)) {
    //  val['eo:bands'] = [key]
    //}
    return [key, val]
  }))
  c1Files.thumbnail = { href: `${c1Base}/${productId}_thumb_large.jpg` }
  c1Files.index = `${c1Base}/index.html`

  const c1 = {
    index: c1Files.index,
    files: c1Files
  }

  return new Promise(((resolve, reject) => {
    // AWS doesn't include all C1 scenes, we return the old urls for
    // any scenes that is before May 1 2017
    if (moment(data.acquisitionDate) > moment('2017-04-30')) {
      // check that file exists
      fileExists(c1.index).then(() => resolve(c1))
        .catch((e) => {
          console.log(`not avail: ${JSON.stringify(c1)}`)
          const error = new Error(`${c1.index} not available: ${JSON.stringify(data)}`)
          reject(error, e)
        })
    }
    else {
      const _sceneId = sceneId.slice(0, -2)
      let sid
      let newKey
      const rev = sceneId.slice(-2)
      let prefix = `https://landsat-pds.s3.amazonaws.com/L8/${path.join(_path, row, _sceneId)}`
      const links = _.range(rev, -1, -1).map((r) => `${prefix}${_.pad(r, 2, '0')}/index.html`)

      arrayIterate(links.reverse(), fileExists).then((value) => {
        let newVal = value
        prefix += newVal.slice(-13, -11)
        sid = _sceneId + val.slice(-13, -11)
        files = _.fromPairs(files.map((b) => {
          newKey = b.slice(0, -4)
          newVal = { href: `${prefix}/${sid}_${b}` }
          //if (_bands.includes(newKey)) {
          //  newVal['eo:bands'] = [newKey]
          //}
          return [key, newVal]
        }))
        files.thumbnail = { href: `${prefix}/${sid}_thumb_large.jpg` }
        files.index = `${prefix}/index.html`
        const pre = {
          index: files.index,
          files: files
        }
        resolve(pre)
      }).catch((err) => {
        const error = new Error(`${c1.index} not available: `)
        reject(error, err)
      })
    }
  }))
}


function transform(incomingData, encoding, next) {
  const data = incomingData
  // concert numeric fields to numbers
  const numberFields = [
    'path',
    'row',
    'upperLeftCornerLatitude',
    'upperLeftCornerLongitude',
    'upperRightCornerLatitude',
    'upperRightCornerLongitude',
    'lowerLeftCornerLatitude',
    'lowerLeftCornerLongitude',
    'lowerRightCornerLatitude',
    'lowerRightCornerLongitude',
    'sceneCenterLatitude',
    'sceneCenterLongitude',
    'cloudCover',
    'sunElevation',
    'sunAzimuth',
    'receivingStation',
    'imageQuality1',
    'ROLL_ANGLE',
    'GEOMETRIC_RMSE_MODEL',
    'GEOMETRIC_RMSE_MODEL_X',
    'GEOMETRIC_RMSE_MODEL_Y',
    'COLLECTION_NUMBER',
    'CLOUD_COVER_LAND'
  ]
  numberFields.forEach((f) => {
    data[f] = parseFloat(data[f])
  })

  const geometry = {
    type: 'Polygon',
    coordinates: [[
      [data.upperRightCornerLongitude, data.upperRightCornerLatitude],
      [data.upperLeftCornerLongitude, data.upperLeftCornerLatitude],
      [data.lowerLeftCornerLongitude, data.lowerLeftCornerLatitude],
      [data.lowerRightCornerLongitude, data.lowerRightCornerLatitude],
      [data.upperRightCornerLongitude, data.upperRightCornerLatitude]
    ]]
  }

  // check for crossing antimeridian
  const leftLong = Math.min(data.lowerLeftCornerLongitude, data.upperLeftCornerLongitude)
  if (leftLong < -1000000) { //> rightLong) {
    console.log(
      `warning: skipping ${data.sceneID} for crossing anti-meridian (${JSON.stringify(geometry)})`
    )
    next()
  }
  else if ((moment(data.acquisitionDate) < moment('2013-05-26'))) {
    console.log(`skipping pre-service data ${data.sceneID}`)
    next()
  }
  else {
    awsLinks(data).then((info) => {
      const start = moment(data.sceneStartTime, 'YYYY:DDD:HH:mm:ss.SSSSS')
      const record = {
        bbox: [
          data.lowerLeftCornerLongitude,
          data.lowerLeftCornerLatitude,
          data.upperRightCornerLongitude,
          data.upperRightCornerLatitude
        ],
        geometry: geometry,
        properties: {
          id: data.LANDSAT_PRODUCT_ID,
          cid: 'landsat-8-l1',
          datetime: start.toISOString(),
          // eo extension metadata
          'eo:cloud_cover': parseInt(data.cloudCover),
          'eo:sun_azimuth': data.sunAzimuth,
          'eo:sun_elevation': data.sunElevation,
          'landsat:path': data.path,
          'landsat:row': data.row,
          assets: info.files
        },
        links: []
      }
      this.push(record)
      next()
    }).catch((e) => {
      console.log(`error processing ${data.sceneID}: ${e}`)
      next()
    })
  }
}


function handler(event, context, cb) {
  console.log(JSON.stringify(event))
  // create stream from transform function
  const _transform = through2({ objectMode: true, consume: true }, transform)
  const bucket = _.get(event, 'bucket')
  const key = _.get(event, 'key')
  const currentFileNum = _.get(event, 'currentFileNum', 0)
  const lastFileNum = _.get(event, 'lastFileNum', 0)
  const arn = _.get(event, 'arn', null)
  const retries = _.get(event, 'retries', 0)

  // add collection
  let esClient
  return satlib.es.client()
    .then((client) => {
      esClient = client
      return satlib.es.putMapping(esClient, 'collections')
    })
    .then(() => {
      satlib.es.saveRecords(esClient, [collection], 'collections', 'name', (err) => {
        if (err) console.log('Warning: ', err)
      })
    })
    .then(() => satlib.ingestcsv.update({
      client: esClient,
      bucket,
      key,
      transform: _transform,
      cb,
      currentFileNum,
      lastFileNum,
      arn,
      retries
    }))
    .catch((e) => console.log(e))
}


module.exports.handler = handler