<div align="center">
  <a href="https://tsoa-community.github.io/docs/" target="blank">
    <h1>tsoa</h1>
  </a>
Pronounced so·uh

OpenAPI-compliant REST APIs using TypeScript and Node

![build status](https://github.com/lukeautry/tsoa/actions/workflows/runTestsOnPush.yml/badge.svg)
[![npm version](https://img.shields.io/npm/v/tsoa/latest)](https://www.npmjs.com/package/tsoa)

</div>

## Goal

- TypeScript controllers and models as the single source of truth for your API
- An OpenAPI 3.0 or 3.1 specification is generated from your controllers and models, including:
  - Paths (e.g. GET /users)
  - Definitions based on TypeScript interfaces (models)
  - Parameters/model properties marked as required or optional based on TypeScript (e.g. myProperty?: string is optional in the OpenAPI spec)
  - jsDoc supported for object descriptions (most other metadata can be inferred from TypeScript types)
- ESM routes are generated for Express 5 and validate request payloads.

## Philosophy

- Rely on TypeScript type annotations to generate API metadata if possible
- If regular type annotations aren't an appropriate way to express metadata, use decorators
- Use jsdoc for pure text metadata (e.g. endpoint descriptions)
- Minimize boilerplate
- Models are best represented by interfaces (pure data structures), but can also be represented by classes
- Runtime validation follows the generated OpenAPI schema.

## Defaults

Generated routes use Express 5 and ESM imports. OpenAPI defaults to 3.0.
JSON bodies must match their declared types. Query, path, and multipart fields are parsed from text.
Undeclared properties are removed, and generated files are written only when their content changes.
Literal routes register before parameter routes across controllers. Equivalent route registrations fail with both source locations.

The `tsoa` package exports runtime decorators and validation. Import generation APIs from `@tsoa/cli`; the `tsoa` executable provides the generation commands.

## Getting Started

- [Documentation](https://tsoa-community.github.io/docs/)
- [API Reference](https://tsoa-community.github.io/reference/)
- [Getting started guide](https://tsoa-community.github.io/docs/getting-started)

## Examples

Check out the [guides](https://tsoa-community.github.io/docs/getting-started)

See example controllers in [the tests](tests/fixtures/controllers)

See example models in [the tests](tests/fixtures/testModel.ts)

## Help wanted

### Contributing code

To contribute (via a PR), please first see the [Contributing Guide](https://github.com/lukeautry/tsoa/tree/master/docs/CONTRIBUTING.md)

### Becoming a maintainer

tsoa wants additional maintainers! The library has increased in popularity and has quite a lot of pull requests and issues. [Please post in this issue](https://github.com/lukeautry/tsoa/issues/236) if you're willing to take on the role of a maintainer.
