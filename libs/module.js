var path = require('path')

/**
 * Define the entry point of the nuxt module
 * @param {Object} moduleOptions
 */
module.exports = function NuxtDrupalJsonApi (moduleOptions) {
  var options = Object.assign({}, this.options.drupalJsonApi, moduleOptions)
  if (!options.drupalUrl) {
    throw new Error('nuxt-drupal-jsonapi requires a `drupalUrl` option to be set in nuxt.config.js')
  }
  this.addPlugin({
    src: path.resolve(__dirname, 'plugin.js'),
    fileName: 'DrupalJsonApi.js',
    options: options
  })
  this.addTemplate({
    src: path.resolve(__dirname, 'plugin-entity.js'),
    fileName: 'DrupalJsonApiEntity.js'
  })
}

module.exports.meta = require('../package.json')
