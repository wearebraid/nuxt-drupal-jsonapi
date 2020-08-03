# Nuxt Drupal JSON:API

> ⚠️ Update: In version 1.0.0-alpha.1 and later the extractor is removed from this project with the expectation you'll use Nuxt >= 2.14 which includes it's own extractor.

Nuxt Drupal JSON:API is a module for the Nuxt framework that allows for full
static generation of a drupal site leveraging (primarily) the [now core](https://dri.es/jsonapi-lands-in-drupal-core) Drupal
implementation of the [JSON:API](https://jsonapi.org/) specification. We'll
describe how it performs this magic later on, but for now what is important to
understand is what problems this module solves.

Static generation of a dynamic content management system is quite challenging
because the static generator needs to know every single route to generate.
Furthermore, once those static pages have been created hydration of the data
required for the front end to function properly typically requires the framework
to make HTTP requests back to the original server when navigating to pages that
are were not the initial page load.

This package solves these issues by downloading a static copy of every node and
it's relationships to nuxt dist directory so when your site.

## Live Mode

When viewing a Drupal site in live mode requests are made directly to the Drupal
json:api and not a local static version. However, due to limitations of Drupal's
json:api, the following modules must be enabled:

- [JSON:API](https://www.drupal.org/project/jsonapi)
- [RESTful Web Services](https://www.drupal.org/docs/8/core/modules/rest/overview) (with node entity turned on at a minimum, consider using [REST UI](https://www.drupal.org/project/restui) to do this)

## Configuration

To configure the nuxt module, provide the `drupalUrl`.

```json
modules: [
  ['nuxt-drupal-jsonapi', {
    drupalUrl: 'https://example.drupal.org'
  }]
]
```

You can also pass an `aliasPrefix` option which will prefix every slug request
to drupal with it's value, this is not typically needed.
