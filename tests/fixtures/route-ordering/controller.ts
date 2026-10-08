import { Body, Controller, FormField, Get, Head, Middlewares, Path, Post, Query, Request, Route, UploadedFile } from '@tsoa/runtime';
import type { Request as ExpressRequest, RequestHandler } from 'express';
import { Readable } from 'node:stream';

const marked: RequestHandler = (_request, response, next) => {
  response.setHeader('X-Middleware', 'called');
  next();
};

@Route('ordered/items')
@Middlewares(marked)
export class ParameterRouteController extends Controller {
  @Get('{id}')
  public item(@Path() id: string): { id: string } {
    return { id };
  }

  @Get('by-name/{name}')
  public named(@Path() name: string): { name: string } {
    return { name };
  }
}

@Route('ordered')
export class LiteralRouteController extends Controller {
  @Get('items/bulk')
  public bulk(): string[] {
    return ['bulk'];
  }

  @Get('items/by-name/all')
  public all(): string[] {
    return ['all'];
  }

  @Get('status')
  public status(): string {
    this.setHeader('X-Handler', 'get');
    return 'ready';
  }

  @Head('status')
  public head(): void {
    this.setHeader('X-Handler', 'head');
  }

  @Post('body')
  public body(@Body() body: { count: number; enabled: boolean }): { count: number; enabled: boolean } {
    return body;
  }

  @Get('query/{count}')
  public query(@Path() count: number, @Query() enabled: boolean): { count: number; enabled: boolean } {
    return { count, enabled };
  }

  @Post('upload')
  public upload(@UploadedFile() file: Express.Multer.File, @FormField() count: number): { name: string; count: number } {
    return { name: file.originalname, count };
  }

  @Post('raw')
  public raw(@Request() request: ExpressRequest): { bytes: number } {
    return { bytes: (request.body as Buffer).length };
  }

  @Get('download')
  public download(): Readable {
    this.setHeader('Content-Type', 'application/octet-stream');
    return Readable.from(['download']);
  }
}
