import * as ts from 'typescript';
import * as YAML from 'yaml';
import { ExtendedSpecConfig } from '../cli';
import { MetadataGenerator } from '../metadataGeneration/metadataGenerator';
import { Tsoa, Swagger, Config } from '@tsoa/runtime';
import { SpecGenerator3 } from '../swagger/specGenerator3';
import { SpecGenerator31 } from '../swagger/specGenerator31';
import { fsMkDir, fsWriteFileIfChanged } from '../utils/fs';
import { inlineTypeExpressions } from '../swagger/inlineTypeExpressions';

export const getSwaggerOutputPath = (swaggerConfig: ExtendedSpecConfig) => {
  const ext = swaggerConfig.yaml ? 'yaml' : 'json';
  const specFileBaseName = swaggerConfig.specFileBaseName || 'swagger';

  return `${swaggerConfig.outputDirectory}/${specFileBaseName}.${ext}`;
};

export const generateSpec = async (
  swaggerConfig: ExtendedSpecConfig,
  compilerOptions?: ts.CompilerOptions,
  ignorePaths?: string[],
  /**
   * pass in cached metadata returned in a previous step to speed things up
   */
  metadata?: Tsoa.Metadata,
  defaultNumberType?: Config['defaultNumberType'],
) => {
  if (!metadata) {
    const tsconfigPath = MetadataGenerator.resolveTsconfigPath(swaggerConfig.entryFile);
    metadata = new MetadataGenerator(swaggerConfig.entryFile, compilerOptions, ignorePaths, swaggerConfig.controllerPathGlobs, swaggerConfig.rootSecurity, defaultNumberType, tsconfigPath).Generate();
  }

  let spec: Swagger.Spec;

  switch (swaggerConfig.specVersion) {
    case 3:
    case undefined:
      spec = new SpecGenerator3(metadata, swaggerConfig).GetSpec();
      break;
    case 3.1:
    default:
      spec = new SpecGenerator31(metadata, swaggerConfig).GetSpec();
  }

  spec = inlineTypeExpressions(spec, metadata);

  await fsMkDir(swaggerConfig.outputDirectory, { recursive: true });

  let data = JSON.stringify(spec, null, '\t');
  if (swaggerConfig.yaml) {
    data = YAML.stringify(JSON.parse(data));
  }

  const outputPath = getSwaggerOutputPath(swaggerConfig);
  await fsWriteFileIfChanged(outputPath, data);

  return metadata;
};
