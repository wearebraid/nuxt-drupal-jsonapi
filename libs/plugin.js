import axios from 'axios'
import DrupalJsonApiEntity from './DrupalJsonApiEntity'
import DrupalJsonApiTransformers from './DrupalJsonApiTransformers'
import apiError from './DrupalJsonApiEntityError'

class DrupalJsonApi {
  /**
   * Initialize our api wrapper.
   * @param {context} context an instance of the nuxt context object.
   */
  constructor (context, options) {
    this.ctx = context
    this.options = Object.assign({
      entityOptions: {},
      aliasPrefix: ''
    }, options)
    this.isGenerating = process.static && typeof window === 'undefined'
    this.api = axios.create({
      baseURL: process.static ? (this.isGenerating ? 'http://localhost:8080/api' : '/api') : this.options.drupalUrl
    })
    this.pending = new Set()
    this.cache = new Map()
  }

  /**
   * Retrieve a given endpoint (from cache or server)
   * @param {string} endpoint
   * @return {Promise}
   */
  async fromApi (endpoint) {
    if (this.isCached(endpoint)) {
      return Promise.resolve(this.getCached(endpoint))
    }
    this.pending.add(endpoint)
    let res = false
    try {
      res = await this.api.get(endpoint)
    } catch (err) {
      if (this.isEntity(err.response)) {
        res = err.response
      } else if (err.response.status === 403) {
        res = apiError(403, 'Not Authorized')
      } else if (err.response.status === 404) {
        res = apiError(404, 'Not Found')
      } else {
        res = apiError()
      }
    }
    const d = this.isEntity(res) ? (new DrupalJsonApiEntity(this, res.data)) : res.data
    this.setCache(endpoint, d)
    this.pending.delete(endpoint)
    return d
  }

  /**
   * Given an axios response object, check if it is a json api entity.
   * @param {object} res
   */
  isEntity (res) {
    return !!(res && res.data && res.data.jsonapi && res.data.jsonapi.version)
  }

  /**
   *
   * @param {string} entity
   * @param {object} lookup
   * @return {Promise}
   */
  getEntity (lookup, depth = Infinity) {
    const result = process.static ? this.getFromLocal(lookup) : this.getFromServer(lookup)
    return result.then(async entity => {
      if (entity instanceof DrupalJsonApiEntity) {
        await entity.loadRelationships(depth)
      }
      return entity
    })
  }

  /**
   * Fetch the requested data from the local filesystem.
   * @param {object} lookup
   * @return {Promise}
   */
  getFromLocal (lookup) {
    if (lookup.slug && (!this.isLookupComplete(lookup))) {
      return this.getFromLocalBySlug(lookup)
    }
    if (this.isLookupComplete(lookup)) {
      return this.fromApi(this.endpoint(lookup))
    }
    throw new Error('Incomplete local lookup:', lookup)
  }

  /**
   * Fetch the requested data off the live server.
   * @param {object} lookup
   * @return {Promise}
   */
  getFromServer (lookup) {
    if (lookup.slug && (!this.isLookupComplete(lookup))) {
      return this.getFromServerBySlug(lookup)
    }
    if (this.isLookupComplete(lookup)) {
      return this.fromApi(this.endpoint(lookup))
    }
    throw new Error('Requesting Drupal entities from a live server requires the uuid, entity, and bundle.')
  }

  /**
   * If all we have is a slug and we're local, we need to do a request to the
   * _slugs directory to get the node.
   *
   * @param {object} lookup
   * @return {Promise}
   */
  getFromLocalBySlug (lookup) {
    return this.fromApi(`/_slugs${this.trimSlug(lookup.slug)}.json`)
      .then(entity => {
        lookup.entity = entity.entity
        lookup.bundle = entity.bundle
        lookup.uuid = entity.uuid
        if (this.isLookupComplete(lookup)) {
          return this.getFromLocal(lookup)
        }
      })
      .catch(function (err) {
        throw err
      })
  }

  /**
   * If all we have is a slug and we are pulling from the server, then we need
   * to do a REST api request to determine the uuid and bundle name.
   * @param {object} lookup
   * @return {Promise}
   */
  getFromServerBySlug (lookup) {
    return this.fromApi(this.trimSlug(lookup.slug) + '?_format=json')
      .then(data => {
        if (data instanceof DrupalJsonApiEntity) {
          return data
        } else {
          lookup.entity = 'node'
          lookup.bundle = data.type[0].target_id
          lookup.uuid = data.uuid[0].value
        }
        if (this.isLookupComplete(lookup)) {
          return this.getFromServer(lookup)
        }
      })
      .catch(function (err) {
        throw err
      })
  }

  /**
   * Get the entity value of a relationship from cache.
   * @param {object} relationship
   * @return {object|Promise}
   */
  getRelationship (relationship) {
    const [entity, bundle] = relationship.type.split('--')
    const lookup = { entity, bundle, uuid: relationship.id }
    return this.getCached(lookup) || this.getEntity(lookup)
  }

  /**
   * Checks if a lookup has the required data to make a json:api request to the
   * server directly.
   * @param {object} lookup
   * @return {boolean}
   */
  isLookupComplete (lookup) {
    return lookup.entity && lookup.bundle && lookup.uuid
  }

  /**
   * Make sure there are appropriate slashes (one before, none after)
   * @param {string}
   * @return {string}
   */
  trimSlug (path) {
    path = path.trim()
    if (path[0] !== '/') {
      path = '/' + path
    }
    if (path.substr(-1) === '/') {
      path = path.substr(0, path.length - 1)
    }
    return path
  }

  /**
   * Given a lookup return an url
   * @param {object} lookup
   */
  endpoint (lookup) {
    if (!process.static) {
      return `/jsonapi/${lookup.entity}/${lookup.bundle}/${lookup.uuid}`
    }
    return `/_resources/${lookup.entity}/${lookup.bundle}/${lookup.uuid}.json`
  }

  /**
   * Find a given node by a json:api uuid, or the node id integer.
   * @param {string|int} identifier
   * @return {Promise}
   */
  node (identifier) {
    return this.getEntity({ entity: 'node', identifier: identifier })
  }

  /**
   * Find a given node by an alias.
   * @param {string|int} identifier
   * @return {Promise}
   */
  slug (slug, throwOnError = true) {
    const isNodeRequest = /^\/node\/\d+$/
    if (this.options.aliasPrefix && !this.isGenerating && !isNodeRequest.test(slug)) {
      slug = `${this.trimSlug(this.options.aliasPrefix)}${this.trimSlug(slug)}`
    }
    const entity = this.getEntity({ entity: 'node', slug: slug })
    return this.throwOnError ? this.throwOnError(entity) : entity
  }

  /**
   * Find a given node by an alias.
   * @param {string|int} identifier
   * @return {Promise}
   */
  alias (slug) {
    return this.slug(slug)
  }

  /**
   * Find a given taxonomy term by a json:api uuid, or the taxonomy term id integer.
   * @param {string|int} identifier
   * @return {Promise}
   */
  term (identifier) {
    return this.getEntity({ entity: 'taxonomy_term', identifier: identifier })
  }

  /**
   * Find a given file by a json:api uuid, or the file id integer.
   * @param {string|int} identifier
   * @return {Promise}
   */
  file (identifier) {
    return this.getEntity({ entity: 'file', identifier: identifier })
  }

  /**
   * Find a given media item by a json:api uuid, or the media item id integer.
   * @param {string|int} identifier
   * @return {Promise}
   */
  media (identifier) {
    return this.getEntity({ entity: 'media', identifier: identifier })
  }

  /**
   * Find a given paragraph by a json:api uuid, or the paragraph id integer.
   * @param {string|int} identifier
   * @return {Promise}
   */
  paragraph (identifier) {
    return this.getEntity({ entity: 'paragraph', identifier: identifier })
  }

  /**
   * Checks if a particular cache key exists.
   * @param {string} key
   * @return {boolean}
   */
  isCached (key) {
    const k = (typeof key === 'object') ? this.endpoint(key) : key
    return this.cache.has(k)
  }

  /**
   * Returns a cache value.
   */
  getCached (key) {
    const k = (typeof key === 'object') ? this.endpoint(key) : key
    return this.isCached(k) ? this.cache.get(k) : false
  }

  /**
   * Set a value on the cache.
   * @param {string} key
   * @param {mixed} value
   * @return {NuxtDrupalJsonApi}
   */
  setCache (key, value) {
    this.cache.set(key, value)
    return this
  }

  /**
   * Given a plane object, merge with cache.
   * @param {object} cache
   */
  restoreCache (cache) {
    for (const key in cache) {
      let value = null
      try {
        value = this.entify(cache[key])
      } catch (err) {
        value = cache[key]
      }
      this.setCache(key, value)
    }
  }

  /**
   * Convert the cache Map to a POJO.
   * @return {object}
   */
  cacheToObject () {
    const obj = {}
    for (let [key, value] of this.cache) {
      obj[key] = (value instanceof DrupalJsonApiEntity) ? value.toObject() : value
    }
    return obj
  }

  /**
   * Determine if a given lookup has already been traversed.
   * @param {lookup} lookup
   * @return {boolean}
   */
  hasBeenTraversed (lookup) {
    const endpoint = this.endpoint(lookup)
    return this.isCached(endpoint) || this.pending.has(endpoint)
  }

  /**
   * Re-constitute an entity object from a json decode.
   * @param {Object} data
   */
  entify (data) {
    if (data instanceof DrupalJsonApiEntity) {
      return data
    }
    if (data.__NUXT_SERIALIZED__) {
      this.restoreCache(data.__NUXT_SERIALIZED__.cache)
      return new DrupalJsonApiEntity(this, data.__NUXT_SERIALIZED__.res)
    } else if (data && data.data && data.data.type) {
      return new DrupalJsonApiEntity(this, data)
    }
    throw new Error ('DrupalJsonApi was unable to create an entity from given data')
  }

  /**
   * Pass through data to entify.
   * @param {Object} data
   */
  toEntity (data) {
    return this.entify(data)
  }

  /**
   * Handle throwing page level errors.
   * @param {Promise|entity}
   * @return {Promise}
   */
  async throwOnError (willBeEntity) {
    const entity = (willBeEntity instanceof Promise) ? await willBeEntity : willBeEntity
    return (entity.isError) ? this.ctx.error(entity.pageError()) : entity
  }
}

/**
 * Exposes $drupalApi prototype functions.
 * @param {object} context
 */
export default function NuxtDrupalJsonApi (context, inject) {
  const config = {}
  config.drupalUrl = '<%= options.drupalUrl %>'
  <% if (options.entityOptions) { %>
  config.entityOptions = {}
    <% if (options.entityOptions.transform === false) { %>
      config.entityOptions.transform = false
    <% } %>
  <% } %>
  <% if (options.aliasPrefix) { %>
    config.aliasPrefix = '<%= options.aliasPrefix %>'
  <% } %>
  <% if (options.transformers) { %>
    config.transformers = DrupalJsonApiTransformers
  <% } %>
  inject('dapi', new DrupalJsonApi(context, config))
}
