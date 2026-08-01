import { statSync } from 'node:fs';
import path from 'node:path';

import type { Express, Request } from 'express';
import express from 'express';

const navigationPaths = [
  '/',
  '/display',
  '/host',
  '/join',
  '/play/demo',
] as const;

const navigationPathPatterns = [
  /^\/join\/[A-Z0-9]{6}$/,
  /^\/room\/[A-Z0-9]{6}$/,
] as const;

const immutableAssetCacheControl = 'public, max-age=31536000, immutable';
const htmlCacheControl = 'no-cache';

function isNavigationPath(pathname: string): boolean {
  return (
    navigationPaths.includes(pathname as (typeof navigationPaths)[number]) ||
    navigationPathPatterns.some((pattern) => pattern.test(pathname))
  );
}

function acceptsHtml(request: Request): boolean {
  const accept = request.get('accept');
  return accept === undefined || accept.includes('text/html');
}

function hasTraversalAttempt(request: Request): boolean {
  try {
    return decodeURIComponent(request.path)
      .split('/')
      .some((segment) => segment === '..');
  } catch {
    return true;
  }
}

function assertClientDirectory(clientDirectory: string): void {
  const clientDirectoryStat = statSync(clientDirectory);
  if (!clientDirectoryStat.isDirectory()) {
    throw new Error('The production client directory must be a directory.');
  }

  const indexFileStat = statSync(path.join(clientDirectory, 'index.html'));
  if (!indexFileStat.isFile()) {
    throw new Error('The production client directory must include index.html.');
  }
}

/**
 * Adds the single-origin production client boundary. It is deliberately
 * opt-in so Vite continues to own client assets during local development.
 */
export function configureProductionStaticFiles(
  app: Express,
  clientDirectory: string,
): void {
  assertClientDirectory(clientDirectory);

  const indexFile = path.join(clientDirectory, 'index.html');

  app.use((request, response, next) => {
    if (hasTraversalAttempt(request)) {
      response
        .status(404)
        .type('application/json')
        .send({ error: 'Not found' });
      return;
    }
    next();
  });

  app.use(
    '/assets',
    express.static(path.join(clientDirectory, 'assets'), {
      fallthrough: true,
      immutable: true,
      index: false,
      maxAge: '1y',
      setHeaders: (response) => {
        response.setHeader('Cache-Control', immutableAssetCacheControl);
      },
    }),
  );

  app.use(
    express.static(clientDirectory, {
      fallthrough: true,
      index: false,
      setHeaders: (response, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          response.setHeader('Cache-Control', htmlCacheControl);
        }
      },
    }),
  );

  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }

    if (
      request.path.startsWith('/api/') ||
      request.path.startsWith('/socket.io/') ||
      request.path.startsWith('/assets/') ||
      path.extname(request.path) !== '' ||
      !acceptsHtml(request) ||
      !isNavigationPath(request.path)
    ) {
      next();
      return;
    }

    response.setHeader('Cache-Control', htmlCacheControl);
    response.sendFile(indexFile);
  });
}

export const productionStaticCacheControl = {
  html: htmlCacheControl,
  immutableAsset: immutableAssetCacheControl,
};
