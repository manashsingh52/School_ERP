import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { API_PREFIX, UNPREFIXED_CONTROLLERS } from '../../config/routes.js';
import { ACCESS_RULE, type AccessRule } from './decorators.js';

export interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  path: string;
  rule: AccessRule | undefined;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];

/**
 * Refuses to start the app if any route lacks @Public / @Authenticated / @RequirePermission
 * (docs/03 §6). Also used by the tenant-isolation tests to discover every route.
 */
@Injectable()
export class RouteAccessCheck implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  routes(): RouteInfo[] {
    const result: RouteInfo[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const base = this.normalise(this.reflector.get<string | string[]>(PATH_METADATA, metatype));
      const prefix = UNPREFIXED_CONTROLLERS.includes(base) ? '' : API_PREFIX;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as (...args: unknown[]) => unknown;
        const sub = this.reflector.get<string | string[] | undefined>(PATH_METADATA, handler);
        const methodIndex = this.reflector.get<number | undefined>(METHOD_METADATA, handler);
        if (sub === undefined || methodIndex === undefined) continue;
        const rule =
          this.reflector.get<AccessRule | undefined>(ACCESS_RULE, handler) ??
          this.reflector.get<AccessRule | undefined>(ACCESS_RULE, metatype);
        result.push({
          controller: metatype.name,
          handler: name,
          method: METHODS[methodIndex] ?? String(methodIndex),
          path: `/${[prefix, base, this.normalise(sub)].filter(Boolean).join('/')}`,
          rule,
        });
      }
    }
    return result;
  }

  onApplicationBootstrap(): void {
    const missing = this.routes().filter((r) => !r.rule);
    if (missing.length) {
      const list = missing.map((r) => `  ${r.method} ${r.path} (${r.controller}.${r.handler})`).join('\n');
      throw new Error(`Routes without an access rule (@Public/@Authenticated/@RequirePermission):\n${list}`);
    }
  }

  private normalise(path: string | string[] | undefined): string {
    const value = Array.isArray(path) ? (path[0] ?? '') : (path ?? '');
    return value.replace(/^\/+|\/+$/g, '');
  }
}
