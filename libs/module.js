var path = require('path')
var fs = require('fs')
var axios = require('axios')
var staticServer = require('node-static')
var stoppable = require('stoppable')
var http = require('http')
var cloneDeep = require('clone-deep')
const { Spider, Extractor, Logger } = require('drupal-jsonapi-extractor')

/**
 * Some helpful global variables
 */
var server
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

  // make sure that we have a valid transformers file path before proceeding
  // const transformersFileExists = fs.existsSync(options.transformers)
  // if (!transformersFileExists && options.transformers !== false) {
  //   throw new Error(`nuxt-drupal-jsonapi: provided transformers file path (${options.transformers}) in nuxt.config.js does not exist`)
  // }
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

  this.nuxt.hook('generate:page', data => removeAliasPrefixFromPath(data, options))

  // Each time a page is generated or fails to generate remove it from the registry
  this.nuxt.hook('generate:routeCreated', ({ route }) => removeFromRoutes(route))
  this.nuxt.hook('generate:routeFailed', ({ route }) => removeFromRoutes(route))
}

/**
 * Remove a given route from the routes left to generate.
 */
function removeFromRoutes (route, options) {
  remainingRoutes = remainingRoutes.filter(r => r.route !== route)
  if (!remainingRoutes.length) {
    server.stop()
  }
}

/**
 * When generating a site with a aliasPrefix, remove that alias prefix from
 * the generated path.
 *
 * @param {object} data data object with route, path, html
 */
function removeAliasPrefixFromPath (data, options) {
  if (options.aliasPrefix) {
    const escapedAlias = options.aliasPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    const patternToReplace = new RegExp(`^/${escapedAlias}`)
    data.path = data.path.replace(patternToReplace, '')
  }
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
  console.log('\x1b[36mℹ\x1b[0m Downloading json:api.')

  // Setup the drupal-jsonapi-extrator module to pull the remote data.
  const spider = new Spider({ baseURL: options.drupalUrl + '/jsonapi' })
  const extractor = new Extractor(spider, {
    location: `${dir}/${options.staticApiDirectory}`,
    clean: false
  })
  new Logger([spider, extractor], { verbosity: 2 }) // eslint-disable-line

  // Start the spider adding each json:api path
  await new Promise((resolve, reject) => {
    spider.observe('crawl-complete', () => resolve())
    manifest.jsonApi.map(jsonPath => {
      try {
        spider.crawl(jsonPath)
      } catch (err) {
        console.log('\x1b[31m%s\x1b[0m', 'Failed to crawl ' + jsonPath)
        reject(err)
      }
    })
  })

  server = startStaticServer(dir)
  manifest.paths.map(route => {
    if (!routes.find(r => r.route === route)) {
      routes.push({ route, payload: null })
    }
  })
  remainingRoutes = cloneDeep(routes)
}

/**
 * Start a static server to serve up files.
 *
 * @param {string} publicDir
 */
function startStaticServer (publicDir) {
  console.log(`\x1b[36mℹ\x1b[0m Static server at: ${publicDir}`)
  const fileServer = new staticServer.Server(publicDir)

  return stoppable(
    http.createServer(function (request, response) {
      request.addListener('end', function (e) {
        fileServer.serve(request, response, function (e, res) {
          if (e && (e.status === 404)) {
            console.log(`Failed to load: ${request.url}`)
          }
        })
      }).resume()
    }).listen(8080)
  )
}

/**
 * Reach out to a Drupal site and get a full manfiest of pages that need static
 * generation and return the array.
 *
 * @param {object} options
 * @return {Promise([paths])}
 */
async function getManifest (options) {
  // const endpoint = `${options.drupalUrl}/api/static-manifest?_format=json${options.aliasPrefix ? '&site=' + encodeURIComponent(options.aliasPrefix) : ''}`
  // try {
  //   const res = await axios.get(endpoint)
  //   if (res && res.data && Array.isArray(res.data.paths)) {
  //     return res.data
  //   }
  // } catch (err) {
  //   console.log('\x1b[31m%s\x1b[0m', 'Unable to retrieve remote site manifest. It must be accessible at: ' + endpoint)
  // }
  // return []
  return {
    paths: [
      '/node/1461',
      '/mcintire.virginia.edu/student-success/support-services'
    ],
    jsonApi: [
      '/node/enterprise_landing_page/890c5507-d1b5-4a4b-ae0e-57f0a1af874a',
      '/menu_link_content/enterprise-footer-navigation',
      '/menu_link_content/enterprise-footer-utility-nav',
      '/menu_link_content/enterprise-header-eyebrow-nav',
      '/menu_link_content/enterprise-primary-navigation',
      '/menu_link_content/enterprise-quick-info-navigation'
    ]
  }
}

module.exports.meta = require('../package.json')
