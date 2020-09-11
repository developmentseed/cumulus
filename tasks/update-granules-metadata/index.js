'use strict';

const cumulusMessageAdapter = require('@cumulus/cumulus-message-adapter-js');
const get = require('lodash/get');
const keyBy = require('lodash/keyBy');
const mapValues = require('lodash/mapValues');
const set = require('lodash/set');

const {
  getJsonS3Object,
} = require('@cumulus/aws-client/S3');

const {
  updateCMRMetadata,
  isCMRFile,
  granulesToCmrFileObjects,
} = require('@cumulus/cmrjs');

const BucketsConfig = require('@cumulus/common/BucketsConfig');

const { getDistributionBucketMapKey } = require('@cumulus/common/stack');

/**
 * Modifies CMR metadata file with file's OnlineAccessURLs updated to their new locations.
 *
 * @param {Array<Object>} cmrFiles       - array of objects that include CMR xmls uris and
 *                                         granuleIds
 * @param {Object} granulesObject        - an object of the granules where the key is the granuleId
 * @param {string} cmrGranuleUrlType .   - type of granule CMR url
 * @param {string} distEndpoint          - the api distribution endpoint
 * @param {Object} bucketTypes           - map of bucket names to bucket types
 * @param {Object} distributionBucketMap - mapping of bucket->distirubtion path values
 *                                         (e.g. { bucket: distribution path })
 * @returns {Promise<Object[]>} array of updated CMR files with etags
 *
 */
async function updateEachCmrFileAccessURLs(
  cmrFiles,
  granulesObject,
  cmrGranuleUrlType,
  distEndpoint,
  bucketTypes,
  distributionBucketMap
) {

  return Promise.all(cmrFiles.map( (cmrFile) => {
    const granuleId = cmrFile.granuleId;
    const granule = granulesObject[granuleId];
    cmrFile = granule.files.find(isCMRFile)

    return updateCMRMetadata({
      granuleId,
      cmrFile,
      files: granule.files,
      distEndpoint,
      published: false,
      bucketTypes,
      cmrGranuleUrlType,
      distributionBucketMap,
    });
  }));
}

/**
 * Adds etag values to the specified granules' CMR files.
 *
 * @param {Object} granulesByGranuleId - mapping of granule IDs to granules,
 *    each containing a list of `files`
 * @param {Object[]} cmrFiles - array of CMR file objects with `filename` and
 *    `etag` properties
 * 
 * @returns {Object} Granule mapping that parallels shape of granulesByGranuleId, but
 *    with CMR file objects updated with the `etag` values supplied via the
 *    array of CMR file objects, matched by `filename`.
 */
function addCmrFileEtags(granulesByGranuleId, cmrFiles) {
  const filenameToEtagMap = cmrFiles.map(({ filename, etag }) => [filename, etag])
  const etagsByFilename = Object.fromEntries(filenameToEtagMap);
  const addEtag = (file) => set(file, 'etag', etagsByFilename[file.filename]);
  const addEtags = (files) => files.map((f) => (isCMRFile(f) ? addEtag(f) : f));

  const result =  mapValues(granulesByGranuleId,
    (granule) => ({ ...granule, files: addEtags(granule.files) }));
  return result
}

async function updateGranulesMetadata(event) {
  const config = event.config;
  const bucketsConfig = new BucketsConfig(config.buckets);
  const bucketTypes = Object.fromEntries(Object.values(bucketsConfig.buckets)
  .map(({ name, type }) => [name, type]));

  const cmrGranuleUrlType = get(config, 'cmrGranuleUrlType', 'distribution');

  const granules = event.input.granules;
  const cmrFiles = granulesToCmrFileObjects(granules);
  const granulesByGranuleId = keyBy(granules, 'granuleId');

  const distributionBucketMap = await getJsonS3Object(
    process.env.system_bucket,
    getDistributionBucketMapKey(process.env.stackName)
  );
    
  const updatedCmrFiles = await updateEachCmrFileAccessURLs(
    cmrFiles,
    granulesByGranuleId,
    cmrGranuleUrlType,
    config.distribution_endpoint,
    bucketTypes,
    distributionBucketMap
  );

   // Transfer etag info to granules' CMR files
   const result = addCmrFileEtags(granulesByGranuleId, updatedCmrFiles);

   return { granules: Object.values(result) }
}

/**
 * Lambda handler
 *
 * @param {Object} event      - a Cumulus Message
 * @param {Object} context    - an AWS Lambda context
 * @returns {Promise<Object>} - Returns output from task.
 *                              See schemas/output.json for detailed output schema
 */
async function handler(event, context) {
  return cumulusMessageAdapter.runCumulusTask(updateGranulesMetadata, event, context);
}

exports.handler = handler;
exports.updateGranulesMetadata = updateGranulesMetadata;