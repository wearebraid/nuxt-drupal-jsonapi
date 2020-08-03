var path = require('path')
var axios = require('axios')
var cloneDeep = require('clone-deep')

/**
 * Some helpful global variables
 */
var remainingRoutes = []

/**
 * Define the entry point of the nuxt module
 * @param {Object} moduleOptions
 */
module.exports = function NuxtDrupalJsonApi (moduleOptions) {
  var options = Object.assign({
    staticApiDirectory: 'api',
    transformers: false
  }, this.options.drupalJsonApi, moduleOptions)

  // Make sure we have a valid drupal url before proceeding.
  if (!options.drupalUrl) {
    throw new Error('nuxt-drupal-jsonapi requires a `drupalUrl` option to be set in nuxt.config.js')
  }

  const transformersFilePath = options.transformers
    ? options.transformers
    : path.resolve(__dirname, 'plugin-transformers.js')

  // Add the drupal json api plugin.
  this.addPlugin({
    src: path.resolve(__dirname, 'plugin.js'),
    fileName: 'DrupalJsonApi.js',
    options: options
  })

  // Add our drupal 'entity' object as a template
  this.addTemplate({
    src: path.resolve(__dirname, 'plugin-entity.js'),
    fileName: 'DrupalJsonApiEntity.js'
  })

  // Adds a drupal entity 'error' object
  this.addTemplate({
    src: path.resolve(__dirname, 'plugin-entity-error.js'),
    fileName: 'DrupalJsonApiEntityError.js'
  })

  // Adds transformers object as template
  this.addTemplate({
    src: transformersFilePath,
    fileName: 'DrupalJsonApiTransformers.js'
  })

  var generateOptions = {
    dir: './dist'
  }

  // Tap into the generate before hook to grab options.
  this.nuxt.hook('generate:before', async (nuxt, genOpts) => Object.assign(generateOptions, genOpts))

  // When generating, extend the routes and pull the remote site local.
  this.nuxt.hook('generate:extendRoutes', routes => pullRemoteSite(options, generateOptions, routes))

  // this.nuxt.hook('generate:page', data => removeAliasPrefixFromPath(data, options))

  // Each time a page is generated or fails to generate remove it from the registry
  this.nuxt.hook('generate:routeCreated', ({ route }) => removeFromRoutes(route))
  this.nuxt.hook('generate:routeFailed', ({ route }) => removeFromRoutes(route))
}

/**
 * Remove a given route from the routes left to generate.
 */
function removeFromRoutes (route, options) {
  remainingRoutes = remainingRoutes.filter(r => r.route !== route)
}

/**
 * When generating a site with a aliasPrefix, remove that alias prefix from
 * the generated path.
 *
 * @param {object} path the url path
 */
function removeAliasPrefixFromPath (path, options) {
  if (options.aliasPrefix) {
    const escapedAlias = options.aliasPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const patternToReplace = new RegExp(`^/${escapedAlias}`)
    return path.replace(patternToReplace, '')
  }
  return path
}

/**
 * Extends the routes to include routes from Drupal and pull those json:api
 * endpoints (dependency tree) and store them locally.
 *
 * @param options
 * @param routes
 */
async function pullRemoteSite (options, { dir }, routes) {
  // Get all the routes we'll need from Drupal. This requires a Drupal module.
  const manifest = await getManifest(options)
  // const manifest = {
  //   paths: [
  //     '/mcintire.virginia.edu/ms-accounting',
  //     '/mcintire.virginia.edu/ms-accounting/academics',
  //     '/mcintire.virginia.edu/ms-commerce'
  //   ]
  // }

  // server = startStaticServer(dir)
  manifest.paths.map(aliasedRoute => {
    const route = removeAliasPrefixFromPath(aliasedRoute, options)
    if (!routes.find(r => r.route === route)) {
      routes.push({ route, payload: null })
    }
  })
  remainingRoutes = cloneDeep(routes)
}

/**
 * Reach out to a Drupal site and get a full manfiest of pages that need static
 * generation and return the array.
 *
 * @param {object} options
 * @return {Promise([paths])}
 */
async function getManifest (options) {
  const endpoint = `${options.drupalUrl}/api/static-manifest?_format=json${options.aliasPrefix ? '&site=' + encodeURIComponent(options.aliasPrefix) : ''}`
  try {
    const res = await axios.get(endpoint)
    if (res && res.data && Array.isArray(res.data.paths)) {
      return res.data
    }
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', 'Unable to retrieve remote site manifest. It must be accessible at: ' + endpoint)
  }
  return []
}

module.exports.meta = require('../package.json')
