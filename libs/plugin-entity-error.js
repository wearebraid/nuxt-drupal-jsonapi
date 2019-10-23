export default function (status = '520', title = 'Unknown Error') {
  return {
    data: {
      jsonapi: {
        version: '1.0',
        meta: {
          links: {
            self: {
              href: 'http://jsonapi.org/format/1.0/'
            }
          }
        }
      },
      errors: [
        {
          title,
          status
        }
      ]
    }
  }
}
