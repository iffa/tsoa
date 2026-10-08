import * as fs from 'fs';
import * as handlebars from 'handlebars';
import * as path from 'path';
import { ExtendedRoutesConfig } from '../cli';
import { TsoaRoute, assertNever } from '@tsoa/runtime';
import { fsReadFile, fsWriteFile } from '../utils/fs';
import { convertBracesPathParams } from '../utils/pathUtils';
import { AbstractRouteGenerator } from './routeGenerator';

export class DefaultRouteGenerator extends AbstractRouteGenerator<ExtendedRoutesConfig> {
  public async GenerateRoutes() {
    const allowedExtensions = ['.ts', '.mts'];

    if (!fs.lstatSync(this.options.routesDir).isDirectory()) {
      throw new Error(`routesDir should be a directory`);
    } else if (this.options.routesFileName !== undefined) {
      const ext = path.extname(this.options.routesFileName);
      if (!allowedExtensions.includes(ext)) {
        throw new Error(`routesFileName should be a valid typescript file.`);
      }
    }

    const fileName = `${this.options.routesDir}/${this.options.routesFileName || 'routes.ts'}`;
    const template = await fsReadFile(path.join(__dirname, 'templates/express.hbs'));
    const content = this.buildContent(template.toString());

    if (await this.shouldWriteFile(fileName, content)) {
      await fsWriteFile(fileName, content);
    }
  }

  protected pathTransformer(path: string): string {
    return convertBracesPathParams(path);
  }

  public buildContent(middlewareTemplate: string) {
    handlebars.registerHelper('json', (context: any) => {
      return JSON.stringify(context);
    });
    const additionalPropsHelper = (additionalProperties: TsoaRoute.RefObjectModelSchema['additionalProperties']) => {
      if (additionalProperties) {
        // Then the model for this type explicitly allows additional properties and thus we should assign that
        return JSON.stringify(additionalProperties);
      } else if (this.options.noImplicitAdditionalProperties === 'silently-remove-extras') {
        return JSON.stringify(false);
      } else if (this.options.noImplicitAdditionalProperties === 'throw-on-extras') {
        return JSON.stringify(false);
      } else if (this.options.noImplicitAdditionalProperties === 'ignore') {
        return JSON.stringify(true);
      } else {
        return assertNever(this.options.noImplicitAdditionalProperties);
      }
    };
    handlebars.registerHelper('additionalPropsHelper', additionalPropsHelper);

    const routesTemplate = handlebars.compile(middlewareTemplate, { noEscape: true });

    return routesTemplate(this.buildContext());
  }
}
