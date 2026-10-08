import { generateRoutes, generateSpecAndRoutes } from '@tsoa/cli';

async function prepare() {
  const metadata = await generateSpecAndRoutes({ configuration: 'tsoa.json' });
  const fixtures = [
    { directory: 'express', basePath: '/v1' },
    { directory: 'express-router' },
    { directory: 'express-router-with-custom-multer' },
    { directory: 'express-openapi3', basePath: '/v1', noImplicitAdditionalProperties: 'throw-on-extras' as const },
    { directory: 'express-dynamic-controllers', basePath: '/v1' },
  ];
  await Promise.all(
    fixtures.map(({ directory, basePath, noImplicitAdditionalProperties }) =>
      generateRoutes(
        {
          noImplicitAdditionalProperties: noImplicitAdditionalProperties || 'silently-remove-extras',
          bodyCoercion: true,
          authenticationModule: './fixtures/express/authentication.ts',
          basePath,
          entryFile: './fixtures/express/server.ts',
          routesDir: `./fixtures/${directory}`,
        },
        undefined,
        undefined,
        metadata,
      ),
    ),
  );
  await generateRoutes({
    noImplicitAdditionalProperties: 'silently-remove-extras',
    bodyCoercion: true,
    authenticationModule: './fixtures/express/authentication.ts',
    basePath: '/v1',
    entryFile: './fixtures/express-root-security/server.ts',
    routesDir: './fixtures/express-root-security',
    rootSecurity: [{ api_key: [] }],
  });
  await generateRoutes({
    noImplicitAdditionalProperties: 'silently-remove-extras',
    bodyCoercion: false,
    entryFile: './fixtures/route-ordering/controller.ts',
    routesDir: './fixtures/route-ordering',
  });
}

void prepare();
