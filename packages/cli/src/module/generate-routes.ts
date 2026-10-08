import * as ts from 'typescript';
import { ExtendedRoutesConfig } from '../cli';
import { MetadataGenerator } from '../metadataGeneration/metadataGenerator';
import { Tsoa } from '@tsoa/runtime';
import { DefaultRouteGenerator } from '../routeGeneration/defaultRouteGenerator';
import { fsMkDir } from '../utils/fs';
import { Config as BaseConfig } from '@tsoa/runtime';

export async function generateRoutes<Config extends ExtendedRoutesConfig>(
  routesConfig: Config,
  compilerOptions?: ts.CompilerOptions,
  ignorePaths?: string[],
  /**
   * pass in cached metadata returned in a previous step to speed things up
   */
  metadata?: Tsoa.Metadata,
  defaultNumberType?: BaseConfig['defaultNumberType'],
) {
  if (!metadata) {
    const tsconfigPath = MetadataGenerator.resolveTsconfigPath(routesConfig.entryFile);
    metadata = new MetadataGenerator(routesConfig.entryFile, compilerOptions, ignorePaths, routesConfig.controllerPathGlobs, routesConfig.rootSecurity, defaultNumberType, tsconfigPath).Generate();
  }

  const routeGenerator = new DefaultRouteGenerator(metadata, routesConfig);

  await fsMkDir(routesConfig.routesDir, { recursive: true });
  await routeGenerator.GenerateRoutes();

  return metadata;
}
